create or replace function public.billing_month_end_readiness(
  p_billing_account_id uuid,
  p_period_start date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_period_end date := (p_period_start + interval '1 month')::date;
  v_today date := (now() at time zone 'utc')::date;
  v_account public.billing_accounts;
  v_pricing public.billing_pricing_versions;
  v_pricing_id uuid;
  v_pricing_count integer := 0;
  v_existing public.billing_periods;
  v_missing_dates jsonb := '[]'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_conflict_count integer := 0;
  v_request_count integer := 0;
  v_image_count integer := 0;
  v_provider_cost numeric(16,10) := 0;
  v_provider_cost_micros bigint := 0;
  v_client_charge_cents integer := 0;
  v_coverage_through date;
  v_activity_without_cost integer := 0;
  v_cost_without_activity integer := 0;
begin
  if not public.is_billing_internal_admin() then
    raise exception 'Internal billing administrator access required';
  end if;
  if p_period_start <> date_trunc('month', p_period_start)::date then
    raise exception 'Billing period must start on the first UTC calendar date of a month';
  end if;

  select * into v_account from public.billing_accounts where id=p_billing_account_id;
  if v_account.id is null then
    v_blockers := v_blockers || jsonb_build_array('billing_account_missing');
  elsif not v_account.is_active then
    v_blockers := v_blockers || jsonb_build_array('billing_account_inactive');
  end if;

  select count(*), min(id) into v_pricing_count, v_pricing_id
  from public.billing_pricing_versions
  where billing_account_id=p_billing_account_id and currency='usd' and pricing_scope='ai_visualizer'
    and effective_from <= p_period_start
    and (effective_until is null or effective_until >= v_period_end);
  if v_pricing_count = 1 then
    select * into v_pricing from public.billing_pricing_versions where id=v_pricing_id;
  elsif v_pricing_count = 0 then
    v_blockers := v_blockers || jsonb_build_array('pricing_missing');
  else
    v_blockers := v_blockers || jsonb_build_array('pricing_overlap');
  end if;

  select * into v_existing from public.billing_periods
  where billing_account_id=p_billing_account_id and period_start=p_period_start and period_end=v_period_end;
  if v_existing.id is not null then
    v_blockers := v_blockers || jsonb_build_array('billing_period_exists');
  end if;
  if v_period_end > v_today then
    v_blockers := v_blockers || jsonb_build_array('month_not_complete');
  end if;

  select coalesce(jsonb_agg(d::date order by d), '[]'::jsonb)
  into v_missing_dates
  from generate_series(p_period_start, v_period_end - 1, interval '1 day') day(d)
  where not exists (
    select 1 from public.ai_provider_cost_daily c
    where c.provider='openai'
      and c.reconciled_project_id='proj_haRRNxvf4CVwa2jHugJ762SM'
      and c.export_project_id='proj_haRRNxvf4CVwa2jHugJ762SM'
      and c.currency='usd' and c.scope_verification='export_project_id'
      and c.usage_date=day.d::date
  );
  if jsonb_array_length(v_missing_dates) > 0 then
    v_blockers := v_blockers || jsonb_build_array('provider_coverage_incomplete');
  end if;

  select max(usage_date), coalesce(sum(actual_cost_usd),0)
  into v_coverage_through, v_provider_cost
  from public.ai_provider_cost_daily
  where provider='openai' and reconciled_project_id='proj_haRRNxvf4CVwa2jHugJ762SM'
    and export_project_id='proj_haRRNxvf4CVwa2jHugJ762SM'
    and currency='usd' and scope_verification='export_project_id'
    and usage_date>=p_period_start and usage_date<v_period_end;

  select coalesce(sum(request_count),0),
    coalesce(sum(request_count) filter(where telemetry_model='gpt-image-2.5-sunburst'),0)
  into v_request_count, v_image_count
  from public.ai_provider_activity_daily
  where provider='openai' and provider_project_id='proj_haRRNxvf4CVwa2jHugJ762SM'
    and usage_date>=p_period_start and usage_date<v_period_end;

  select count(*) into v_activity_without_cost
  from public.ai_provider_activity_daily a
  where a.provider='openai' and a.provider_project_id='proj_haRRNxvf4CVwa2jHugJ762SM'
    and a.usage_date>=p_period_start and a.usage_date<v_period_end
    and not exists(select 1 from public.ai_provider_cost_daily c where c.provider='openai'
      and c.reconciled_project_id=a.provider_project_id and c.usage_date=a.usage_date and c.currency='usd');
  select count(*) into v_cost_without_activity
  from public.ai_provider_cost_daily c
  where c.provider='openai' and c.reconciled_project_id='proj_haRRNxvf4CVwa2jHugJ762SM'
    and c.usage_date>=p_period_start and c.usage_date<v_period_end and c.actual_cost_usd>0
    and not exists(select 1 from public.ai_provider_activity_daily a where a.provider='openai'
      and a.provider_project_id=c.reconciled_project_id and a.usage_date=c.usage_date and a.request_count>0);
  if v_activity_without_cost>0 or v_cost_without_activity>0 then
    v_blockers := v_blockers || jsonb_build_array('provider_data_inconsistent');
  end if;

  select count(*) into v_conflict_count
  from public.ai_provider_sync_runs conflicted
  where conflicted.status='conflict'
    and daterange(conflicted.range_start,conflicted.range_end_exclusive,'[)') && daterange(p_period_start,v_period_end,'[)')
    and not exists (
      select 1 from public.ai_provider_sync_runs resolved
      where resolved.status='succeeded' and resolved.created_at>conflicted.created_at
        and resolved.range_start<=conflicted.range_start and resolved.range_end_exclusive>=conflicted.range_end_exclusive
    );
  if v_conflict_count>0 then
    v_blockers := v_blockers || jsonb_build_array('provider_conflicts_unresolved');
  end if;

  v_provider_cost_micros := round(v_provider_cost * 1000000)::bigint;
  if v_pricing.id is not null then
    v_client_charge_cents := round(
      v_provider_cost_micros::numeric * (10000 + v_pricing.markup_basis_points) / 100000000
    )::integer;
  end if;

  return jsonb_build_object(
    'billingAccountId',p_billing_account_id,
    'periodStart',p_period_start,
    'periodEndExclusive',v_period_end,
    'status',case when v_existing.status='finalized' then 'finalized'
      when jsonb_array_length(v_blockers)=0 then 'ready' else 'incomplete' end,
    'ready',jsonb_array_length(v_blockers)=0,
    'blockers',v_blockers,
    'missingDates',v_missing_dates,
    'providerCoverageThrough',v_coverage_through,
    'unresolvedConflictCount',v_conflict_count,
    'providerRequestCount',v_request_count,
    'imageGenerationCount',v_image_count,
    'providerCostUsd',v_provider_cost,
    'providerCostMicros',v_provider_cost_micros,
    'pricingVersionId',v_pricing.id,
    'markupBasisPoints',v_pricing.markup_basis_points,
    'aiUsageChargeCents',v_client_charge_cents,
    'existingBillingPeriodId',v_existing.id
  );
end
$$;

revoke all on function public.billing_month_end_readiness(uuid,date) from public,anon;
grant execute on function public.billing_month_end_readiness(uuid,date) to authenticated;

create or replace function public.finalize_month_end_billing(
  p_billing_account_id uuid,
  p_period_start date
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_readiness jsonb;
  v_period_id uuid;
  v_summary_id uuid;
  v_period_end date := (p_period_start + interval '1 month')::date;
  v_fingerprint text;
begin
  if not public.is_billing_internal_admin() then
    raise exception 'Internal billing administrator access required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_billing_account_id::text || ':' || p_period_start::text,0));
  v_readiness := public.billing_month_end_readiness(p_billing_account_id,p_period_start);
  if not coalesce((v_readiness->>'ready')::boolean,false) then
    raise exception 'Month-end billing is not ready: %', v_readiness->'blockers';
  end if;

  select encode(extensions.digest(string_agg(source_row_sha256,',' order by usage_date),'sha256'),'hex')
  into v_fingerprint
  from public.ai_provider_cost_daily
  where provider='openai' and reconciled_project_id='proj_haRRNxvf4CVwa2jHugJ762SM'
    and export_project_id='proj_haRRNxvf4CVwa2jHugJ762SM'
    and currency='usd' and scope_verification='export_project_id'
    and usage_date>=p_period_start and usage_date<v_period_end;

  insert into public.billing_periods(
    billing_account_id,pricing_version_id,period_start,period_end,status,
    provider_data_complete,data_complete_through,finalized_at,finalized_by
  ) values (
    p_billing_account_id,(v_readiness->>'pricingVersionId')::uuid,p_period_start,v_period_end,'finalized',
    true,v_period_end-1,now(),auth.uid()
  ) returning id into v_period_id;

  insert into public.billing_provider_period_costs(
    billing_period_id,billing_account_id,provider,provider_project_id,
    provider_cost_micros,provider_request_count,source_fingerprint,reconciled_at
  ) values (
    v_period_id,p_billing_account_id,'openai','proj_haRRNxvf4CVwa2jHugJ762SM',
    (v_readiness->>'providerCostMicros')::bigint,(v_readiness->>'providerRequestCount')::integer,
    v_fingerprint,now()
  );

  insert into public.billing_charge_summaries(
    billing_period_id,billing_account_id,billing_period_start,billing_period_end,
    ai_usage_charge_cents,image_generation_count,status,data_complete_through
  ) values (
    v_period_id,p_billing_account_id,p_period_start,v_period_end,
    (v_readiness->>'aiUsageChargeCents')::integer,(v_readiness->>'imageGenerationCount')::integer,
    'finalized',v_period_end-1
  ) returning id into v_summary_id;

  insert into public.billing_audit_log(
    billing_account_id,billing_period_id,actor_user_id,action,reason,after_state
  ) values (
    p_billing_account_id,v_period_id,auth.uid(),'month_end_billing_finalized',
    'Full provider coverage and reconciliation readiness verified.',
    jsonb_build_object(
      'periodStart',p_period_start,'periodEndExclusive',v_period_end,
      'providerRequestCount',(v_readiness->>'providerRequestCount')::integer,
      'imageGenerationCount',(v_readiness->>'imageGenerationCount')::integer,
      'providerCostMicros',(v_readiness->>'providerCostMicros')::bigint,
      'pricingVersionId',v_readiness->>'pricingVersionId',
      'markupBasisPoints',(v_readiness->>'markupBasisPoints')::integer,
      'aiUsageChargeCents',(v_readiness->>'aiUsageChargeCents')::integer,
      'sourceFingerprint',v_fingerprint
    )
  );

  return jsonb_build_object(
    'billingPeriodId',v_period_id,'chargeSummaryId',v_summary_id,
    'status','finalized','periodStart',p_period_start,'periodEndExclusive',v_period_end,
    'aiUsageChargeCents',(v_readiness->>'aiUsageChargeCents')::integer
  );
end
$$;

revoke all on function public.finalize_month_end_billing(uuid,date) from public,anon;
grant execute on function public.finalize_month_end_billing(uuid,date) to authenticated;

comment on function public.billing_month_end_readiness(uuid,date) is
  'Internal-only month readiness report. Provider cost and margin must never be exposed to billing clients.';
comment on function public.finalize_month_end_billing(uuid,date) is
  'Atomically finalizes one fully reconciled UTC calendar month without creating an invoice or payment.';
