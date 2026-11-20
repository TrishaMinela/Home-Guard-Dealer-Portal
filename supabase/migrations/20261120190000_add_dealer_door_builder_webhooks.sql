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
-- commit;
-- After rollback, Door Builder uses only the existing Vercel env var webhooks.

begin;

create table public.dealer_door_builder_webhooks (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null unique references public.dealers(id) on delete restrict,
  masked_url text not null,
  webhook_ciphertext text not null,
  webhook_iv text not null,
  webhook_auth_tag text not null,
  credential_key_version smallint not null,
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
  created_at timestamptz not null default now(),
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
  delivery_status text not null check (delivery_status in ('attempting', 'succeeded', 'failed')),
  http_status smallint,
  attempted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealer_door_builder_webhook_deliveries_once unique (dealer_id, submission_id),
  constraint dealer_door_builder_webhook_deliveries_status_check check (
    http_status is null or http_status between 100 and 599
  )
);

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
grant select (
  id, dealer_id, masked_url, created_by, updated_by, created_at, updated_at,
  last_success_at, last_success_http_status, last_failure_at, last_failure_http_status,
  last_test_at, last_test_http_status
) on public.dealer_door_builder_webhooks to authenticated;
grant select on public.dealer_door_builder_webhook_audit, public.dealer_door_builder_webhook_deliveries to authenticated;

create policy "Access managers can read Door Builder webhook status"
on public.dealer_door_builder_webhooks for select to authenticated
using (public.is_billing_access_manager());

create policy "Access managers can read Door Builder webhook audit"
on public.dealer_door_builder_webhook_audit for select to authenticated
using (public.is_billing_access_manager());

create policy "Access managers can read Door Builder webhook deliveries"
on public.dealer_door_builder_webhook_deliveries for select to authenticated
using (public.is_billing_access_manager());

comment on table public.dealer_door_builder_webhooks is
  'One active Door Builder Zapier Catch Hook per dealer. The URL is AES-256-GCM ciphertext written and read only by server-side service-role code.';
comment on column public.dealer_door_builder_webhooks.webhook_ciphertext is
  'AES-256-GCM ciphertext of the Catch Hook URL. Do not grant this column to anon or authenticated.';
comment on column public.dealer_door_builder_webhooks.masked_url is
  'Non-secret display value. The hook key is replaced and cannot be reconstructed from this column.';
comment on table public.dealer_door_builder_webhook_deliveries is
  'At-most-once dealer webhook delivery per dealer and Door Builder submission. No payload and no webhook URL are stored.';

commit;
