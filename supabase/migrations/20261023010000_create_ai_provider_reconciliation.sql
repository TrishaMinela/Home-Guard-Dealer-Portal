create table public.ai_provider_activity_daily (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'openai',
  provider_project_id text not null,
  usage_date date not null,
  period_start_at timestamptz not null,
  period_end_at timestamptz not null,
  provider_model text not null,
  telemetry_model text not null,
  operation_type text not null,
  request_count integer not null,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cached_input_tokens bigint not null default 0,
  text_input_tokens bigint not null default 0,
  text_output_tokens bigint not null default 0,
  image_input_tokens bigint not null default 0,
  image_output_tokens bigint not null default 0,
  calculated_estimated_cost_usd numeric(16, 8),
  source_file_name text not null,
  source_file_sha256 text not null,
  source_row_sha256 text not null unique,
  imported_at timestamptz not null default now(),
  constraint ai_provider_activity_daily_operation_type_check
    check (operation_type in ('image_generation', 'entrance_analysis', 'unclassified')),
  constraint ai_provider_activity_daily_period_check
    check (period_end_at > period_start_at),
  constraint ai_provider_activity_daily_counts_check
    check (
      request_count >= 0
      and input_tokens >= 0
      and output_tokens >= 0
      and cached_input_tokens >= 0
      and text_input_tokens >= 0
      and text_output_tokens >= 0
      and image_input_tokens >= 0
      and image_output_tokens >= 0
    ),
  constraint ai_provider_activity_daily_cost_check
    check (calculated_estimated_cost_usd is null or calculated_estimated_cost_usd >= 0),
  constraint ai_provider_activity_daily_natural_key
    unique (provider, provider_project_id, usage_date, provider_model)
);

create table public.ai_provider_cost_daily (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'openai',
  reconciled_project_id text not null,
  export_project_id text,
  usage_date date not null,
  period_start_at timestamptz not null,
  period_end_at timestamptz not null,
  actual_cost_usd numeric(16, 10) not null,
  currency text not null default 'usd',
  scope_verification text not null,
  source_file_name text not null,
  source_file_sha256 text not null,
  source_row_sha256 text not null unique,
  imported_at timestamptz not null default now(),
  constraint ai_provider_cost_daily_period_check
    check (period_end_at > period_start_at),
  constraint ai_provider_cost_daily_cost_check
    check (actual_cost_usd >= 0),
  constraint ai_provider_cost_daily_currency_check
    check (currency = 'usd'),
  constraint ai_provider_cost_daily_scope_check
    check (scope_verification in ('export_project_id', 'daily_activity_exact_match')),
  constraint ai_provider_cost_daily_natural_key
    unique (provider, reconciled_project_id, usage_date, currency)
);

create index ai_provider_activity_daily_usage_date_idx
  on public.ai_provider_activity_daily (usage_date desc);

create index ai_provider_cost_daily_usage_date_idx
  on public.ai_provider_cost_daily (usage_date desc);

alter table public.ai_provider_activity_daily enable row level security;
alter table public.ai_provider_cost_daily enable row level security;

revoke all on public.ai_provider_activity_daily from anon, authenticated;
revoke all on public.ai_provider_cost_daily from anon, authenticated;

create policy "Home Guard admins can read provider activity reconciliation"
on public.ai_provider_activity_daily
for select
to authenticated
using (
  exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

create policy "Home Guard admins can read provider cost reconciliation"
on public.ai_provider_cost_daily
for select
to authenticated
using (
  exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

grant select on public.ai_provider_activity_daily to authenticated;
grant select on public.ai_provider_cost_daily to authenticated;

comment on table public.ai_provider_activity_daily is
  'Daily aggregate OpenAI activity imported from official provider exports. These rows do not represent individual requests.';

comment on column public.ai_provider_activity_daily.calculated_estimated_cost_usd is
  'Calculated from exported token quantities and the reconciliation pricing schedule; never provider-billed actual cost.';

comment on table public.ai_provider_cost_daily is
  'Daily actual provider costs imported from official OpenAI Cost exports and kept separate from internal estimates.';

comment on column public.ai_provider_cost_daily.scope_verification is
  'How the otherwise nullable project scope in a provider Cost export was reconciled to a project.';
