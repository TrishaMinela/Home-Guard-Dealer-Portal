-- NOT APPLIED.
-- Do not use supabase db push. Migration history on HGI Portal Dev
-- (udbcnpjtwhmjzpjjhoph) has diverged from these filenames. For example,
-- add_dealer_dual_logo is file 20261119000000 and live version 20261120071843,
-- and add_dealer_logo_website_urls is live version 20261120160435.
-- Apply later by name with apply_migration and record the version it assigns.
--
-- Additive and backward compatible: new tables only. Existing CRM integration
-- tables, leads, dealers, and env-var webhook routing are unchanged.
-- Until this migration is applied, Door Builder treats the webhook table as
-- absent and keeps the current master / America's Best / WDM / UHR env routing.
--
-- ROLLBACK, only after this migration is the latest applied change and the
-- stored webhook secrets no longer need to be kept:
-- begin;
-- drop table if exists public.dealer_door_builder_webhook_deliveries;
-- drop table if exists public.dealer_door_builder_webhook_audit;
-- drop table if exists public.dealer_door_builder_webhooks;
-- drop table if exists public.door_builder_integration_managers;
-- drop function if exists public.claim_door_builder_webhook_retry(uuid, uuid);
-- drop function if exists public.can_manage_door_builder_webhooks();
-- commit;
-- After rollback, Door Builder uses only the existing Vercel env var webhooks.
-- Webhook ciphertext uses DOOR_BUILDER_WEBHOOK_ENCRYPTION_KEY, not the CRM key.

begin;

create table public.dealer_door_builder_webhooks (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null unique references public.dealers(id) on delete restrict,
  masked_url text not null,
  webhook_ciphertext text not null,
  webhook_iv text not null,
  webhook_auth_tag text not null,
  credential_key_version smallint not null,
  verified boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_success_http_status smallint,
  last_failure_at timestamptz,
  last_failure_http_status smallint,
  last_test_at timestamptz,
  last_test_http_status smallint,
  constraint dealer_door_builder_webhooks_masked_url_check check (
    char_length(masked_url) between 20 and 120
    and masked_url like 'https://hooks.zapier.com/hooks/catch/%'
    and position('••••' in masked_url) > 0
    and masked_url not like '%@%'
  ),
  constraint dealer_door_builder_webhooks_ciphertext_check check (
    char_length(webhook_ciphertext) between 1 and 16384
    and webhook_ciphertext not like 'https://%'
    and webhook_ciphertext not like 'http://%'
  ),
  constraint dealer_door_builder_webhooks_iv_check check (char_length(webhook_iv) = 16),
  constraint dealer_door_builder_webhooks_tag_check check (char_length(webhook_auth_tag) = 24),
  constraint dealer_door_builder_webhooks_key_version_check check (credential_key_version > 0),
  constraint dealer_door_builder_webhooks_success_status_check check (
    last_success_http_status is null or last_success_http_status between 100 and 599
  ),
  constraint dealer_door_builder_webhooks_failure_status_check check (
    last_failure_http_status is null or last_failure_http_status between 100 and 599
  ),
  constraint dealer_door_builder_webhooks_test_status_check check (
    last_test_http_status is null or last_test_http_status between 100 and 599
  )
);

create table public.dealer_door_builder_webhook_audit (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid references public.dealer_door_builder_webhooks(id) on delete set null,
  dealer_id uuid not null references public.dealers(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('saved', 'replaced', 'removed', 'tested')),
  masked_url text,
  http_status smallint,
  test_submission_id text,
  created_at timestamptz not null default now(),
  constraint dealer_door_builder_webhook_audit_test_id_check check (
    test_submission_id is null or test_submission_id ~ '^test-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  constraint dealer_door_builder_webhook_audit_masked_url_check check (
    masked_url is null or (
      char_length(masked_url) between 20 and 120
      and masked_url like 'https://hooks.zapier.com/hooks/catch/%'
      and position('••••' in masked_url) > 0
    )
  ),
  constraint dealer_door_builder_webhook_audit_status_check check (
    http_status is null or http_status between 100 and 599
  )
);

create table public.dealer_door_builder_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete restrict,
  submission_id uuid not null,
  webhook_id uuid,
  destination_fingerprint text not null,
  payload jsonb,
  delivery_status text not null check (delivery_status in ('attempting', 'succeeded', 'failed')),
  attempt_number integer not null,
  http_status smallint,
  error_code text,
  attempted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  constraint dealer_door_builder_webhook_deliveries_attempt_once unique (dealer_id, submission_id, attempt_number),
  constraint dealer_door_builder_webhook_deliveries_attempt_check check (attempt_number > 0),
  constraint dealer_door_builder_webhook_deliveries_fingerprint_check check (destination_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint dealer_door_builder_webhook_deliveries_status_check check (
    http_status is null or http_status between 100 and 599
  ),
  constraint dealer_door_builder_webhook_deliveries_error_check check (
    error_code is null or error_code ~ '^[A-Z0-9_]{1,80}$'
  ),
  constraint dealer_door_builder_webhook_deliveries_payload_check check (
    payload is null or (
      jsonb_typeof(payload) = 'object'
      and octet_length(payload::text) <= 131072
      and position('hooks.zapier.com' in payload::text) = 0
    )
  )
);

create unique index dealer_door_builder_webhook_deliveries_succeeded_once
  on public.dealer_door_builder_webhook_deliveries (dealer_id, submission_id)
  where delivery_status = 'succeeded';
create unique index dealer_door_builder_webhook_deliveries_one_attempt
  on public.dealer_door_builder_webhook_deliveries (dealer_id, submission_id)
  where delivery_status = 'attempting';

create index dealer_door_builder_webhook_audit_dealer_idx
  on public.dealer_door_builder_webhook_audit (dealer_id, created_at desc);
create index dealer_door_builder_webhook_deliveries_dealer_idx
  on public.dealer_door_builder_webhook_deliveries (dealer_id, attempted_at desc);

alter table public.dealer_door_builder_webhooks enable row level security;
alter table public.dealer_door_builder_webhook_audit enable row level security;
alter table public.dealer_door_builder_webhook_deliveries enable row level security;

revoke all on public.dealer_door_builder_webhooks, public.dealer_door_builder_webhook_audit,
  public.dealer_door_builder_webhook_deliveries from public, anon, authenticated;

grant all on public.dealer_door_builder_webhooks, public.dealer_door_builder_webhook_audit,
  public.dealer_door_builder_webhook_deliveries to service_role;

-- Browser roles can read status only. The ciphertext, IV, and auth tag have no grant.
create table public.door_builder_integration_managers (
  user_id uuid primary key references auth.users(id) on delete restrict,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.door_builder_integration_managers enable row level security;
revoke all on public.door_builder_integration_managers from public, anon, authenticated;
grant all on public.door_builder_integration_managers to service_role;

create or replace function public.can_manage_door_builder_webhooks()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.home_guard_admins where user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.door_builder_integration_managers where user_id = (select auth.uid())
  );
$$;
revoke all on function public.can_manage_door_builder_webhooks() from public, anon;
grant execute on function public.can_manage_door_builder_webhooks() to authenticated, service_role;

grant select (
  id, dealer_id, masked_url, verified, created_by, updated_by, created_at, updated_at,
  last_success_at, last_success_http_status, last_failure_at, last_failure_http_status,
  last_test_at, last_test_http_status
) on public.dealer_door_builder_webhooks to authenticated;
grant select (
  id, webhook_id, dealer_id, actor_user_id, action, masked_url, http_status, test_submission_id, created_at
) on public.dealer_door_builder_webhook_audit to authenticated;
grant select (
  id, dealer_id, submission_id, delivery_status, attempt_number, http_status, error_code, attempted_at, updated_at
) on public.dealer_door_builder_webhook_deliveries to authenticated;

create policy "Door Builder webhook managers can read webhook status"
on public.dealer_door_builder_webhooks for select to authenticated
using (public.can_manage_door_builder_webhooks());

create policy "Door Builder webhook managers can read webhook audit"
on public.dealer_door_builder_webhook_audit for select to authenticated
using (public.can_manage_door_builder_webhooks());

create policy "Door Builder webhook managers can read webhook deliveries"
on public.dealer_door_builder_webhook_deliveries for select to authenticated
using (public.can_manage_door_builder_webhooks());

create or replace function public.claim_door_builder_webhook_retry(p_dealer_id uuid, p_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest public.dealer_door_builder_webhook_deliveries%rowtype;
  v_id uuid;
  v_attempt integer;
begin
  perform 1 from public.dealer_door_builder_webhook_deliveries
  where dealer_id = p_dealer_id and submission_id = p_submission_id
  for update;

  if exists (
    select 1 from public.dealer_door_builder_webhook_deliveries
    where dealer_id = p_dealer_id and submission_id = p_submission_id and delivery_status = 'succeeded'
  ) then
    return jsonb_build_object('result', 'already_succeeded');
  end if;

  update public.dealer_door_builder_webhook_deliveries
  set delivery_status = 'failed', error_code = 'LEASE_EXPIRED', updated_at = now()
  where dealer_id = p_dealer_id and submission_id = p_submission_id
    and delivery_status = 'attempting'
    and lease_expires_at <= now();

  if exists (
    select 1 from public.dealer_door_builder_webhook_deliveries
    where dealer_id = p_dealer_id and submission_id = p_submission_id
      and delivery_status = 'attempting'
      and (lease_expires_at is null or lease_expires_at > now())
  ) then
    return jsonb_build_object('result', 'in_progress');
  end if;

  select * into v_latest from public.dealer_door_builder_webhook_deliveries
  where dealer_id = p_dealer_id and submission_id = p_submission_id
  order by attempt_number desc
  limit 1;
  if not found or v_latest.delivery_status <> 'failed' then
    return jsonb_build_object('result', 'not_failed');
  end if;

  v_attempt := v_latest.attempt_number + 1;
  insert into public.dealer_door_builder_webhook_deliveries (
    dealer_id, submission_id, webhook_id, destination_fingerprint, payload,
    delivery_status, attempt_number, lease_expires_at
  ) values (
    p_dealer_id, p_submission_id, v_latest.webhook_id, v_latest.destination_fingerprint, v_latest.payload,
    'attempting', v_attempt, now() + interval '2 minutes'
  ) returning id into v_id;

  return jsonb_build_object(
    'result', 'claimed',
    'attemptId', v_id,
    'attemptNumber', v_attempt,
    'webhookId', v_latest.webhook_id,
    'destinationFingerprint', v_latest.destination_fingerprint,
    'payload', v_latest.payload
  );
end;
$$;
revoke all on function public.claim_door_builder_webhook_retry(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_door_builder_webhook_retry(uuid, uuid) to service_role;

comment on table public.dealer_door_builder_webhooks is
  'One active Door Builder Zapier Catch Hook per dealer. The URL is AES-256-GCM ciphertext written and read only by server-side service-role code.';
comment on column public.dealer_door_builder_webhooks.webhook_ciphertext is
  'AES-256-GCM ciphertext of the Catch Hook URL. Do not grant this column to anon or authenticated.';
comment on column public.dealer_door_builder_webhooks.masked_url is
  'Non-secret display value. The hook key is replaced and cannot be reconstructed from this column.';
comment on table public.door_builder_integration_managers is
  'Explicit Door Builder webhook grant. It does not grant billing access or CRM credential access.';
comment on table public.dealer_door_builder_webhook_deliveries is
  'Dealer webhook attempts. A succeeded row is never resent. payload is the lead copy for a manual retry and is not granted to browser roles. The webhook URL is not stored.';
comment on column public.dealer_door_builder_webhooks.verified is
  'True only after Zapier accepts a test or a live dealer delivery. America''s Best, WDM, and UHR keep their env-var hook until this is true.';

commit;
