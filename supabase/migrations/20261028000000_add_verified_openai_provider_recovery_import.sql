create or replace function public.apply_verified_openai_provider_recovery(
  p_activity jsonb,
  p_costs jsonb,
  p_start date,
  p_end date
)
returns table(inserted_activity integer, inserted_costs integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expected_requests integer;
  v_expected_cost numeric(16,10);
  v_expected_activity_rows integer;
  v_expected_cost_rows integer;
begin
  if not exists (
    select 1 from public.home_guard_admins
    where user_id = (select auth.uid())
  ) then
    raise exception 'Home Guard administrator access required';
  end if;

  if p_start = date '2026-10-01' and p_end = date '2026-10-05' then
    v_expected_requests := 103;
    v_expected_cost := 3.99489145;
    v_expected_activity_rows := 6;
    v_expected_cost_rows := 4;
  elsif p_start = date '2026-10-23' and p_end = date '2026-10-29' then
    v_expected_requests := 50;
    v_expected_cost := 4.20780675;
    v_expected_activity_rows := 6;
    v_expected_cost_rows := 6;
  else
    raise exception 'Recovery window is not approved';
  end if;

  if jsonb_typeof(p_activity) <> 'array' or jsonb_typeof(p_costs) <> 'array' then
    raise exception 'Recovery payload must contain arrays';
  end if;
  if jsonb_array_length(p_activity) <> v_expected_activity_rows
     or jsonb_array_length(p_costs) <> v_expected_cost_rows then
    raise exception 'Recovery payload row count differs from approved totals';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_activity) as r(
      provider text, provider_project_id text, usage_date date,
      period_start_at timestamptz, period_end_at timestamptz,
      provider_model text, telemetry_model text, operation_type text,
      request_count integer, input_tokens bigint, output_tokens bigint,
      cached_input_tokens bigint, text_input_tokens bigint,
      text_output_tokens bigint, image_input_tokens bigint,
      image_output_tokens bigint, calculated_estimated_cost_usd numeric,
      source_file_name text, source_file_sha256 text, source_row_sha256 text
    )
    where r.provider <> 'openai'
       or r.provider_project_id <> 'proj_haRRNxvf4CVwa2jHugJ762SM'
       or r.usage_date < p_start or r.usage_date >= p_end
       or r.period_start_at::date <> r.usage_date
       or r.period_end_at <> r.period_start_at + interval '1 day'
       or r.operation_type not in ('image_generation','entrance_analysis','unclassified')
       or r.source_file_name is null or r.source_file_sha256 is null or r.source_row_sha256 is null
  ) then
    raise exception 'Recovery activity payload failed project, date, or provenance validation';
  end if;

  if (select coalesce(sum((value->>'request_count')::integer),0) from jsonb_array_elements(p_activity)) <> v_expected_requests then
    raise exception 'Recovery request total differs from approved value';
  end if;
  if (
    select count(*) from (
      select value->>'usage_date', value->>'provider_model'
      from jsonb_array_elements(p_activity)
      group by 1,2
    ) distinct_activity
  ) <> v_expected_activity_rows then
    raise exception 'Recovery activity payload contains duplicate natural keys';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_costs) as r(
      provider text, reconciled_project_id text, export_project_id text,
      usage_date date, period_start_at timestamptz, period_end_at timestamptz,
      actual_cost_usd numeric, currency text, scope_verification text,
      source_file_name text, source_file_sha256 text, source_row_sha256 text
    )
    where r.provider <> 'openai'
       or r.reconciled_project_id <> 'proj_haRRNxvf4CVwa2jHugJ762SM'
       or r.export_project_id <> 'proj_haRRNxvf4CVwa2jHugJ762SM'
       or r.currency <> 'usd'
       or r.scope_verification <> 'export_project_id'
       or r.usage_date < p_start or r.usage_date >= p_end
       or r.period_start_at::date <> r.usage_date
       or r.period_end_at <> r.period_start_at + interval '1 day'
       or r.source_file_name is null or r.source_file_sha256 is null or r.source_row_sha256 is null
  ) then
    raise exception 'Recovery cost payload failed project, date, scope, or provenance validation';
  end if;
  if abs((select coalesce(sum((value->>'actual_cost_usd')::numeric),0) from jsonb_array_elements(p_costs)) - v_expected_cost) > 0.000000001 then
    raise exception 'Recovery provider cost differs from approved value';
  end if;
  if (select count(distinct value->>'usage_date') from jsonb_array_elements(p_costs)) <> v_expected_cost_rows then
    raise exception 'Recovery cost payload contains duplicate or missing UTC dates';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_activity) as r(
      provider text, provider_project_id text, usage_date date, provider_model text,
      request_count integer, source_row_sha256 text
    )
    join public.ai_provider_activity_daily e
      on e.provider=r.provider and e.provider_project_id=r.provider_project_id
     and e.usage_date=r.usage_date and e.provider_model=r.provider_model
    where e.request_count <> r.request_count or e.source_row_sha256 <> r.source_row_sha256
  ) then
    raise exception 'Recovery activity conflicts with an existing verified row';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_costs) as r(
      provider text, reconciled_project_id text, usage_date date, currency text,
      actual_cost_usd numeric, source_row_sha256 text
    )
    join public.ai_provider_cost_daily e
      on e.provider=r.provider and e.reconciled_project_id=r.reconciled_project_id
     and e.usage_date=r.usage_date and e.currency=r.currency
    where abs(e.actual_cost_usd-r.actual_cost_usd) > 0.000000001
       or e.source_row_sha256 <> r.source_row_sha256
  ) then
    raise exception 'Recovery cost conflicts with an existing verified row';
  end if;

  insert into public.ai_provider_activity_daily(
    provider,provider_project_id,usage_date,period_start_at,period_end_at,
    provider_model,telemetry_model,operation_type,request_count,input_tokens,
    output_tokens,cached_input_tokens,text_input_tokens,text_output_tokens,
    image_input_tokens,image_output_tokens,calculated_estimated_cost_usd,
    source_file_name,source_file_sha256,source_row_sha256
  )
  select provider,provider_project_id,usage_date,period_start_at,period_end_at,
    provider_model,telemetry_model,operation_type,request_count,input_tokens,
    output_tokens,cached_input_tokens,text_input_tokens,text_output_tokens,
    image_input_tokens,image_output_tokens,calculated_estimated_cost_usd,
    source_file_name,source_file_sha256,source_row_sha256
  from jsonb_to_recordset(p_activity) as r(
    provider text, provider_project_id text, usage_date date,
    period_start_at timestamptz, period_end_at timestamptz,
    provider_model text, telemetry_model text, operation_type text,
    request_count integer, input_tokens bigint, output_tokens bigint,
    cached_input_tokens bigint, text_input_tokens bigint,
    text_output_tokens bigint, image_input_tokens bigint,
    image_output_tokens bigint, calculated_estimated_cost_usd numeric,
    source_file_name text, source_file_sha256 text, source_row_sha256 text
  )
  on conflict (provider,provider_project_id,usage_date,provider_model) do nothing;
  get diagnostics inserted_activity = row_count;

  insert into public.ai_provider_cost_daily(
    provider,reconciled_project_id,export_project_id,usage_date,
    period_start_at,period_end_at,actual_cost_usd,currency,scope_verification,
    source_file_name,source_file_sha256,source_row_sha256
  )
  select provider,reconciled_project_id,export_project_id,usage_date,
    period_start_at,period_end_at,actual_cost_usd,currency,scope_verification,
    source_file_name,source_file_sha256,source_row_sha256
  from jsonb_to_recordset(p_costs) as r(
    provider text, reconciled_project_id text, export_project_id text,
    usage_date date, period_start_at timestamptz, period_end_at timestamptz,
    actual_cost_usd numeric, currency text, scope_verification text,
    source_file_name text, source_file_sha256 text, source_row_sha256 text
  )
  on conflict (provider,reconciled_project_id,usage_date,currency) do nothing;
  get diagnostics inserted_costs = row_count;

  return next;
end
$$;

revoke all on function public.apply_verified_openai_provider_recovery(jsonb,jsonb,date,date) from public, anon;
grant execute on function public.apply_verified_openai_provider_recovery(jsonb,jsonb,date,date) to authenticated;

comment on function public.apply_verified_openai_provider_recovery(jsonb,jsonb,date,date) is
  'Transactional, allowlisted bootstrap import for the verified October 2026 HGI OpenAI provider recovery windows.';
