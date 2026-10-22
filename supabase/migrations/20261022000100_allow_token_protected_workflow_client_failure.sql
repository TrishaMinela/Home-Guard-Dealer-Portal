create or replace function public.complete_ai_visualization_workflow(
  p_workflow_request_id text,
  p_status text,
  p_failure_stage text default null,
  p_failure_category text default null,
  p_generation_request_id text default null,
  p_completion_token_hash text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed_rows integer;
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'Unsupported workflow status';
  end if;
  if p_status = 'succeeded' and (p_failure_stage is not null or p_failure_category is not null) then
    raise exception 'Successful workflows cannot have failure details';
  end if;
  if p_status = 'failed' and (
    p_failure_stage not in ('entrance_analysis', 'image_generation', 'application_infrastructure')
    or nullif(trim(p_failure_category), '') is null
  ) then
    raise exception 'Failed workflows require safe failure details';
  end if;

  update public.ai_visualization_workflows
  set
    status = p_status,
    completed_at = now(),
    duration_ms = greatest(0, floor(extract(epoch from (now() - started_at)) * 1000)::integer),
    failure_stage = case when p_status = 'failed' then p_failure_stage else null end,
    failure_category = case when p_status = 'failed' then left(trim(p_failure_category), 120) else null end,
    generation_request_id = coalesce(generation_request_id, p_generation_request_id),
    updated_at = now()
  where workflow_request_id = p_workflow_request_id
    and (
      status = 'started'
      or (
        status = 'succeeded'
        and p_status = 'failed'
        and p_failure_stage = 'application_infrastructure'
        and p_completion_token_hash is not null
        and completion_token_hash = p_completion_token_hash
      )
    )
    and (p_completion_token_hash is null or completion_token_hash = p_completion_token_hash);

  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end;
$$;

revoke all on function public.complete_ai_visualization_workflow(text, text, text, text, text, text) from public;
grant execute on function public.complete_ai_visualization_workflow(text, text, text, text, text, text) to service_role;
