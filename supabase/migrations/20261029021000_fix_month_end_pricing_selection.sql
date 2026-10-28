do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.billing_month_end_readiness(uuid,date)'::regprocedure)
  into v_definition;

  if position('min(id)' in v_definition) = 0 then
    raise exception 'Expected month-end readiness pricing selector was not found';
  end if;

  execute replace(
    v_definition,
    'min(id)',
    '(array_agg(id order by effective_from))[1]'
  );
end
$$;

comment on function public.billing_month_end_readiness(uuid,date) is
  'Internal-only month readiness report. Provider cost and margin must never be exposed to billing clients.';
