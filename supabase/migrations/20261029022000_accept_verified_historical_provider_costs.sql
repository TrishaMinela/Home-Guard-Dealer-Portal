do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.billing_month_end_readiness(uuid,date)'::regprocedure)
  into v_definition;

  v_updated := replace(
    v_definition,
    'and c.export_project_id=''proj_haRRNxvf4CVwa2jHugJ762SM''
      and c.currency=''usd'' and c.scope_verification=''export_project_id''',
    'and c.currency=''usd''
      and ((c.scope_verification=''export_project_id'' and c.export_project_id=''proj_haRRNxvf4CVwa2jHugJ762SM'')
        or c.scope_verification=''daily_activity_exact_match'')'
  );
  v_updated := replace(
    v_updated,
    'and export_project_id=''proj_haRRNxvf4CVwa2jHugJ762SM''
    and currency=''usd'' and scope_verification=''export_project_id''',
    'and currency=''usd''
    and ((scope_verification=''export_project_id'' and export_project_id=''proj_haRRNxvf4CVwa2jHugJ762SM'')
      or scope_verification=''daily_activity_exact_match'')'
  );

  if v_updated = v_definition then
    raise exception 'Expected provider attribution predicates were not found';
  end if;
  execute v_updated;
end
$$;

do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.finalize_month_end_billing(uuid,date)'::regprocedure)
  into v_definition;
  v_updated := replace(
    v_definition,
    'and export_project_id=''proj_haRRNxvf4CVwa2jHugJ762SM''
    and currency=''usd'' and scope_verification=''export_project_id''',
    'and currency=''usd''
    and ((scope_verification=''export_project_id'' and export_project_id=''proj_haRRNxvf4CVwa2jHugJ762SM'')
      or scope_verification=''daily_activity_exact_match'')'
  );
  if v_updated = v_definition then
    raise exception 'Expected finalization attribution predicate was not found';
  end if;
  execute v_updated;
end
$$;

comment on function public.billing_month_end_readiness(uuid,date) is
  'Internal-only month readiness report. Accepts only directly attributed or previously reconciled exact-match HGI provider costs.';
