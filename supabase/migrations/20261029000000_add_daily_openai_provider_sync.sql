create extension if not exists pgcrypto with schema extensions;

create table if not exists public.ai_provider_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  range_start date not null,
  range_end_exclusive date not null,
  status text not null check (status in ('running','succeeded','conflict','failed')),
  days_checked integer not null default 0,
  activity_rows_inserted integer not null default 0,
  cost_rows_inserted integer not null default 0,
  activity_rows_noop integer not null default 0,
  cost_rows_noop integer not null default 0,
  conflict_count integer not null default 0,
  conflicts jsonb not null default '[]'::jsonb,
  provider_request_count integer not null default 0,
  provider_cost_usd numeric(16,10) not null default 0,
  error_category text,
  error_message text,
  created_at timestamptz not null default now(),
  constraint ai_provider_sync_runs_valid_range check (range_start < range_end_exclusive),
  constraint ai_provider_sync_runs_safe_error check (
    error_message is null or length(error_message) <= 300
  )
);

alter table public.ai_provider_sync_runs enable row level security;

create policy "Internal billing admins can read provider sync runs"
on public.ai_provider_sync_runs for select to authenticated
using (
  exists (
    select 1 from public.billing_internal_admins
    where user_id = (select auth.uid())
  )
);

revoke all on public.ai_provider_sync_runs from public, anon, authenticated;
grant select on public.ai_provider_sync_runs to authenticated;

create or replace function public.openai_provider_sync_secret_valid(p_secret text)
returns boolean
language sql
immutable
security definer
set search_path = public, extensions, pg_temp
as $$
  select p_secret is not null
    and length(p_secret) >= 48
    and encode(extensions.digest(convert_to(p_secret, 'UTF8'), 'sha256'), 'hex')
      = 'f43b0a323df273a372a31cd6b37398e15b97b88604100d32b6a254949dbdf8e1'
$$;

revoke all on function public.openai_provider_sync_secret_valid(text) from public, anon, authenticated;

create or replace function public.get_openai_provider_sync_context(
  p_secret text,
  p_start date,
  p_end date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  if not public.openai_provider_sync_secret_valid(p_secret) then
    raise exception 'Provider sync authorization failed';
  end if;
  if p_end <> v_today or p_start <> p_end - 3 then
    raise exception 'Provider sync range must be the previous three completed UTC dates';
  end if;

  return jsonb_build_object(
    'activity_window', coalesce((
      select jsonb_agg(to_jsonb(a) order by usage_date, provider_model)
      from public.ai_provider_activity_daily a
      where provider_project_id = 'proj_haRRNxvf4CVwa2jHugJ762SM'
        and usage_date >= p_start and usage_date < p_end
    ), '[]'::jsonb),
    'cost_window', coalesce((
      select jsonb_agg(to_jsonb(c) order by usage_date)
      from public.ai_provider_cost_daily c
      where reconciled_project_id = 'proj_haRRNxvf4CVwa2jHugJ762SM'
        and usage_date >= p_start and usage_date < p_end
    ), '[]'::jsonb),
    'october_activity', coalesce((
      select jsonb_agg(to_jsonb(a) order by usage_date, provider_model)
      from public.ai_provider_activity_daily a
      where provider_project_id = 'proj_haRRNxvf4CVwa2jHugJ762SM'
        and usage_date >= date '2026-10-01' and usage_date < date '2026-10-29'
    ), '[]'::jsonb),
    'october_cost', coalesce((
      select jsonb_agg(to_jsonb(c) order by usage_date)
      from public.ai_provider_cost_daily c
      where reconciled_project_id = 'proj_haRRNxvf4CVwa2jHugJ762SM'
        and usage_date >= date '2026-10-01' and usage_date < date '2026-10-29'
    ), '[]'::jsonb),
    'markup_basis_points', (
      select markup_basis_points
      from public.billing_pricing_versions
      where billing_account_id = '7791a715-da6b-40bb-8795-4148cecff204'
        and pricing_scope = 'ai_visualizer' and currency = 'usd'
        and effective_from <= p_start
        and (effective_until is null or effective_until > p_start)
      order by effective_from desc limit 1
    )
  );
end
$$;

revoke all on function public.get_openai_provider_sync_context(text,date,date) from public, authenticated;
grant execute on function public.get_openai_provider_sync_context(text,date,date) to anon;

create or replace function public.record_openai_provider_sync_failure(
  p_secret text,
  p_start date,
  p_end date,
  p_category text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not public.openai_provider_sync_secret_valid(p_secret) then
    raise exception 'Provider sync authorization failed';
  end if;
  insert into public.ai_provider_sync_runs(
    range_start, range_end_exclusive, status, days_checked, completed_at,
    error_category, error_message
  ) values (
    p_start, p_end, 'failed', greatest(0, p_end - p_start), now(),
    left(coalesce(p_category, 'provider_sync_failed'), 80),
    left(coalesce(p_message, 'Provider synchronization failed.'), 300)
  ) returning id into v_id;
  return v_id;
end
$$;

revoke all on function public.record_openai_provider_sync_failure(text,date,date,text,text) from public, authenticated;
grant execute on function public.record_openai_provider_sync_failure(text,date,date,text,text) to anon;

create or replace function public.apply_daily_openai_provider_sync(
  p_secret text,
  p_activity jsonb,
  p_costs jsonb,
  p_start date,
  p_end date,
  p_provider_request_count integer,
  p_provider_cost_usd numeric
)
returns table(
  run_id uuid,
  run_status text,
  inserted_activity integer,
  inserted_costs integer,
  noop_activity integer,
  noop_costs integer,
  conflict_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_conflicts jsonb := '[]'::jsonb;
begin
  if not public.openai_provider_sync_secret_valid(p_secret) then
    raise exception 'Provider sync authorization failed';
  end if;
  if p_end <> v_today or p_start <> p_end - 3 then
    raise exception 'Provider sync range must be the previous three completed UTC dates';
  end if;
  if jsonb_typeof(p_activity) <> 'array' or jsonb_typeof(p_costs) <> 'array' then
    raise exception 'Provider sync payload must contain arrays';
  end if;
  if jsonb_array_length(p_costs) <> 3 then
    raise exception 'Provider sync requires one explicit provider-cost row for every completed UTC date';
  end if;
  if p_provider_request_count <> coalesce((select sum((value->>'request_count')::integer) from jsonb_array_elements(p_activity)), 0)
     or abs(p_provider_cost_usd - coalesce((select sum((value->>'actual_cost_usd')::numeric) from jsonb_array_elements(p_costs)), 0)) > 0.000000001 then
    raise exception 'Provider sync summary does not match its payload';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_activity) as r(
      provider text, provider_project_id text, usage_date date, period_start_at timestamptz,
      period_end_at timestamptz, provider_model text, telemetry_model text,
      operation_type text, request_count integer, source_file_name text,
      source_file_sha256 text, source_row_sha256 text
    ) where r.provider <> 'openai'
      or r.provider_project_id <> 'proj_haRRNxvf4CVwa2jHugJ762SM'
      or r.usage_date < p_start or r.usage_date >= p_end
      or r.period_start_at::date <> r.usage_date
      or r.period_end_at <> r.period_start_at + interval '1 day'
      or r.telemetry_model not in ('gpt-image-2.5-sunburst','gpt-5.4-mini','gpt-4o-mini')
      or r.operation_type not in ('image_generation','entrance_analysis','unclassified')
      or r.source_file_name is null or r.source_file_sha256 is null or r.source_row_sha256 is null
  ) then raise exception 'Provider activity payload failed validation'; end if;

  if exists (
    select 1 from jsonb_to_recordset(p_costs) as r(
      provider text, reconciled_project_id text, export_project_id text,
      usage_date date, period_start_at timestamptz, period_end_at timestamptz,
      actual_cost_usd numeric, currency text, scope_verification text,
      source_file_name text, source_file_sha256 text, source_row_sha256 text
    ) where r.provider <> 'openai'
      or r.reconciled_project_id <> 'proj_haRRNxvf4CVwa2jHugJ762SM'
      or r.export_project_id <> 'proj_haRRNxvf4CVwa2jHugJ762SM'
      or r.usage_date < p_start or r.usage_date >= p_end
      or r.period_start_at::date <> r.usage_date
      or r.period_end_at <> r.period_start_at + interval '1 day'
      or r.currency <> 'usd' or r.scope_verification <> 'export_project_id'
      or r.source_file_name is null or r.source_file_sha256 is null or r.source_row_sha256 is null
  ) then raise exception 'Provider cost payload failed validation'; end if;

  select coalesce(jsonb_agg(conflict_key order by conflict_key), '[]'::jsonb)
  into v_conflicts from (
    select to_jsonb('activity:' || r.usage_date || ':' || r.provider_model) conflict_key
    from jsonb_to_recordset(p_activity) as r(
      provider text, provider_project_id text, usage_date date, provider_model text,
      request_count integer, input_tokens bigint, output_tokens bigint,
      cached_input_tokens bigint, text_input_tokens bigint, text_output_tokens bigint,
      image_input_tokens bigint, image_output_tokens bigint
    ) join public.ai_provider_activity_daily e
      on e.provider=r.provider and e.provider_project_id=r.provider_project_id
      and e.usage_date=r.usage_date and e.provider_model=r.provider_model
    where e.request_count is distinct from r.request_count
       or e.input_tokens is distinct from r.input_tokens
       or e.output_tokens is distinct from r.output_tokens
       or e.cached_input_tokens is distinct from r.cached_input_tokens
       or e.text_input_tokens is distinct from r.text_input_tokens
       or e.text_output_tokens is distinct from r.text_output_tokens
       or e.image_input_tokens is distinct from r.image_input_tokens
       or e.image_output_tokens is distinct from r.image_output_tokens
    union all
    select to_jsonb('cost:' || r.usage_date)
    from jsonb_to_recordset(p_costs) as r(
      provider text, reconciled_project_id text, usage_date date, currency text, actual_cost_usd numeric
    ) join public.ai_provider_cost_daily e
      on e.provider=r.provider and e.reconciled_project_id=r.reconciled_project_id
      and e.usage_date=r.usage_date and e.currency=r.currency
    where abs(e.actual_cost_usd-r.actual_cost_usd) > 0.000000001
  ) conflicts_found;

  conflict_count := jsonb_array_length(v_conflicts);
  if conflict_count > 0 then
    insert into public.ai_provider_sync_runs(
      range_start,range_end_exclusive,status,days_checked,completed_at,
      conflict_count,conflicts,provider_request_count,provider_cost_usd
    ) values (p_start,p_end,'conflict',3,now(),conflict_count,v_conflicts,p_provider_request_count,p_provider_cost_usd)
    returning id into run_id;
    run_status := 'conflict'; inserted_activity := 0; inserted_costs := 0;
    noop_activity := 0; noop_costs := 0;
    return next; return;
  end if;

  select count(*) into noop_activity
  from jsonb_to_recordset(p_activity) as r(provider text,provider_project_id text,usage_date date,provider_model text)
  join public.ai_provider_activity_daily e on e.provider=r.provider and e.provider_project_id=r.provider_project_id and e.usage_date=r.usage_date and e.provider_model=r.provider_model;
  select count(*) into noop_costs
  from jsonb_to_recordset(p_costs) as r(provider text,reconciled_project_id text,usage_date date,currency text)
  join public.ai_provider_cost_daily e on e.provider=r.provider and e.reconciled_project_id=r.reconciled_project_id and e.usage_date=r.usage_date and e.currency=r.currency;

  insert into public.ai_provider_activity_daily(
    provider,provider_project_id,usage_date,period_start_at,period_end_at,
    provider_model,telemetry_model,operation_type,request_count,input_tokens,
    output_tokens,cached_input_tokens,text_input_tokens,text_output_tokens,
    image_input_tokens,image_output_tokens,calculated_estimated_cost_usd,
    source_file_name,source_file_sha256,source_row_sha256
  ) select * from jsonb_to_recordset(p_activity) as r(
    provider text,provider_project_id text,usage_date date,period_start_at timestamptz,period_end_at timestamptz,
    provider_model text,telemetry_model text,operation_type text,request_count integer,input_tokens bigint,
    output_tokens bigint,cached_input_tokens bigint,text_input_tokens bigint,text_output_tokens bigint,
    image_input_tokens bigint,image_output_tokens bigint,calculated_estimated_cost_usd numeric,
    source_file_name text,source_file_sha256 text,source_row_sha256 text
  ) on conflict (provider,provider_project_id,usage_date,provider_model) do nothing;
  get diagnostics inserted_activity = row_count;

  insert into public.ai_provider_cost_daily(
    provider,reconciled_project_id,export_project_id,usage_date,period_start_at,
    period_end_at,actual_cost_usd,currency,scope_verification,source_file_name,
    source_file_sha256,source_row_sha256
  ) select * from jsonb_to_recordset(p_costs) as r(
    provider text,reconciled_project_id text,export_project_id text,usage_date date,period_start_at timestamptz,
    period_end_at timestamptz,actual_cost_usd numeric,currency text,scope_verification text,source_file_name text,
    source_file_sha256 text,source_row_sha256 text
  ) on conflict (provider,reconciled_project_id,usage_date,currency) do nothing;
  get diagnostics inserted_costs = row_count;

  insert into public.ai_provider_sync_runs(
    range_start,range_end_exclusive,status,days_checked,completed_at,
    activity_rows_inserted,cost_rows_inserted,activity_rows_noop,cost_rows_noop,
    provider_request_count,provider_cost_usd
  ) values (p_start,p_end,'succeeded',3,now(),inserted_activity,inserted_costs,
    noop_activity,noop_costs,p_provider_request_count,p_provider_cost_usd)
  returning id into run_id;
  run_status := 'succeeded'; conflict_count := 0;
  return next;
end
$$;

revoke all on function public.apply_daily_openai_provider_sync(text,jsonb,jsonb,date,date,integer,numeric) from public, authenticated;
grant execute on function public.apply_daily_openai_provider_sync(text,jsonb,jsonb,date,date,integer,numeric) to anon;

comment on table public.ai_provider_sync_runs is
  'Internal operational history for the server-only daily HGI OpenAI provider reconciliation.';
