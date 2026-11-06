-- PREPARED ONLY. Apply to HGI Portal Dev only after explicit approval.
-- Phase 1 creates no trigger, worker, HTTP extension call, cron, or outbound delivery path.
begin;

alter table public.leads
  add constraint leads_id_dealer_id_key unique (id, dealer_id);

create table public.dealer_crm_integrations (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete restrict,
  provider text not null check (provider in ('opta', 'gohighlevel', 'custom_webhook')),
  state text not null default 'disabled' check (state in ('disabled', 'test', 'live')),
  field_mapping jsonb not null default '{}'::jsonb check (jsonb_typeof(field_mapping) = 'object'),
  credentials_ciphertext bytea,
  credentials_iv bytea,
  credentials_auth_tag bytea,
  credential_key_version smallint,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealer_crm_integrations_dealer_provider_key unique (dealer_id, provider),
  constraint dealer_crm_integrations_id_dealer_provider_key unique (id, dealer_id, provider),
  constraint dealer_crm_credentials_complete check (
    (credentials_ciphertext is null and credentials_iv is null and credentials_auth_tag is null and credential_key_version is null)
    or
    (credentials_ciphertext is not null and octet_length(credentials_ciphertext) between 1 and 16384
      and octet_length(credentials_iv) = 12 and octet_length(credentials_auth_tag) = 16
      and credential_key_version > 0)
  )
);

create table public.dealer_crm_lead_deliveries (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null,
  lead_id uuid not null,
  dealer_id uuid not null,
  provider text not null check (provider in ('opta', 'gohighlevel', 'custom_webhook')),
  delivery_status text not null check (delivery_status in ('pending', 'attempting', 'succeeded', 'failed', 'dead_letter', 'test_succeeded', 'test_failed')),
  idempotency_key text not null check (idempotency_key ~ '^[a-f0-9]{64}$'),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempted_at timestamptz,
  external_request_id text,
  http_status smallint check (http_status between 100 and 599),
  response_metadata jsonb check (response_metadata is null or (jsonb_typeof(response_metadata) = 'object' and octet_length(response_metadata::text) <= 32768)),
  error_code text check (error_code is null or error_code ~ '^[A-Z0-9_]{1,80}$'),
  error_message text check (error_message is null or char_length(error_message) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealer_crm_delivery_integration_fk foreign key (integration_id, dealer_id, provider)
    references public.dealer_crm_integrations(id, dealer_id, provider) on delete restrict,
  constraint dealer_crm_delivery_lead_fk foreign key (lead_id, dealer_id)
    references public.leads(id, dealer_id) on delete restrict,
  constraint dealer_crm_delivery_once_per_lead unique (integration_id, lead_id),
  constraint dealer_crm_delivery_idempotency_key unique (idempotency_key)
);

create index dealer_crm_integrations_dealer_idx on public.dealer_crm_integrations(dealer_id);
create index dealer_crm_deliveries_dealer_created_idx on public.dealer_crm_lead_deliveries(dealer_id, created_at desc);
create index dealer_crm_deliveries_retry_idx on public.dealer_crm_lead_deliveries(updated_at)
  where delivery_status in ('pending', 'failed');

create table public.dealer_crm_integration_audit_log (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid references public.dealer_crm_integrations(id) on delete restrict,
  dealer_id uuid not null references public.dealers(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('created', 'configuration_updated', 'credentials_updated', 'state_changed')),
  previous_state text check (previous_state is null or previous_state in ('disabled', 'test', 'live')),
  next_state text check (next_state is null or next_state in ('disabled', 'test', 'live')),
  created_at timestamptz not null default now()
);

alter table public.dealer_crm_integrations enable row level security;
alter table public.dealer_crm_lead_deliveries enable row level security;
alter table public.dealer_crm_integration_audit_log enable row level security;

revoke all on public.dealer_crm_integrations, public.dealer_crm_lead_deliveries,
  public.dealer_crm_integration_audit_log from public, anon, authenticated;
grant all on public.dealer_crm_integrations, public.dealer_crm_lead_deliveries,
  public.dealer_crm_integration_audit_log to service_role;

-- Authenticated Home Guard admins can inspect non-secret configuration metadata
-- and sanitized delivery/audit status. Credential columns have no authenticated grant.
grant select (id, dealer_id, provider, state, field_mapping, created_by, updated_by, created_at, updated_at)
  on public.dealer_crm_integrations to authenticated;
grant select on public.dealer_crm_lead_deliveries, public.dealer_crm_integration_audit_log to authenticated;

create policy "Home Guard admins can read safe CRM integration metadata"
on public.dealer_crm_integrations for select to authenticated
using (exists (select 1 from public.home_guard_admins where user_id = (select auth.uid())));

create policy "Home Guard admins can read CRM delivery status"
on public.dealer_crm_lead_deliveries for select to authenticated
using (exists (select 1 from public.home_guard_admins where user_id = (select auth.uid())));

create policy "Home Guard admins can read CRM integration audit history"
on public.dealer_crm_integration_audit_log for select to authenticated
using (exists (select 1 from public.home_guard_admins where user_id = (select auth.uid())));

comment on table public.dealer_crm_integrations is
  'Dealer-scoped CRM configuration. Credentials are AES-GCM ciphertext written and read only by server-side service-role code.';
comment on table public.dealer_crm_lead_deliveries is
  'Idempotent dealer/lead/provider delivery status. Composite foreign keys prevent cross-dealer credential use.';
comment on column public.dealer_crm_lead_deliveries.response_metadata is
  'Sanitized provider metadata only. Never store credentials, request payloads, or raw customer data.';

commit;
