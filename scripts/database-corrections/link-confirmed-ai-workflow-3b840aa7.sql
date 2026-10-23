-- EXECUTED ONCE against HGI Portal Dev on 2026-10-23. Historical audit artifact;
-- do not rerun. The guards intentionally abort after the successful correction.
-- Purpose: repair the single confirmed live-verification correlation loss from
-- 2026-10-22 without inferring or changing any other workflow.
begin;

do $$
declare
  v_workflow_id constant text := '3b840aa7-5957-49d3-bd69-507114cdef51';
  v_generation_request_id constant text := '1ca8ac6c-ea6a-48cf-b3cb-281ad6980c1d';
  v_workflow public.ai_visualization_workflows%rowtype;
  v_generation public.ai_generation_usage%rowtype;
  v_changed integer;
begin
  select * into strict v_workflow
  from public.ai_visualization_workflows
  where workflow_request_id = v_workflow_id
  for update;

  if v_workflow.status <> 'started'
    or v_workflow.environment <> 'production'
    or v_workflow.generation_request_id is not null
    or v_workflow.started_at <> timestamptz '2026-10-22 17:39:36.115461+00'
  then
    raise exception 'Workflow preconditions changed; correction aborted';
  end if;

  select * into strict v_generation
  from public.ai_generation_usage
  where request_id = v_generation_request_id
  for update;

  if v_generation.status <> 'succeeded'
    or v_generation.environment <> 'production'
    or v_generation.workflow_request_id is not null
    or v_generation.completed_at <> timestamptz '2026-10-22 17:40:30.702+00'
    or v_generation.completed_at < v_workflow.started_at
    or v_generation.completed_at > v_workflow.started_at + interval '2 minutes'
  then
    raise exception 'Generation preconditions changed; correction aborted';
  end if;

  if exists (
    select 1 from public.ai_generation_usage
    where workflow_request_id = v_workflow_id
  ) then
    raise exception 'Workflow already has generation usage; correction aborted';
  end if;

  update public.ai_generation_usage
  set workflow_request_id = v_workflow_id
  where id = v_generation.id
    and workflow_request_id is null;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception 'Expected to link exactly one generation row; correction aborted';
  end if;

  update public.ai_visualization_workflows
  set status = 'succeeded',
      completed_at = v_generation.completed_at,
      duration_ms = greatest(0, floor(extract(epoch from (v_generation.completed_at - started_at)) * 1000)::integer),
      failure_stage = null,
      failure_category = null,
      generation_request_id = v_generation.request_id,
      generation_provider_request_id = v_generation.provider_request_id,
      estimated_total_cost_usd =
        coalesce((select sum(estimated_cost_usd) from public.ai_entrance_detection_usage where workflow_request_id = v_workflow_id), 0)
        + coalesce(v_generation.estimated_cost_usd, 0),
      updated_at = now()
  where id = v_workflow.id
    and status = 'started';
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception 'Expected to complete exactly one workflow row; correction aborted';
  end if;

  if exists (
    select 1 from public.ai_visualization_workflows
    where workflow_request_id = 'e1128029-beae-42af-90da-5a94db0b3f7b'
      and updated_at >= transaction_timestamp()
  ) then
    raise exception 'Protected unrelated workflow was modified; correction aborted';
  end if;
end
$$;

-- Verification result set for the operator's audit log.
select workflow_request_id, status, started_at, completed_at, duration_ms,
       generation_request_id, generation_provider_request_id, estimated_total_cost_usd
from public.ai_visualization_workflows
where workflow_request_id in (
  '3b840aa7-5957-49d3-bd69-507114cdef51',
  'e1128029-beae-42af-90da-5a94db0b3f7b'
)
order by workflow_request_id;

select request_id, status, environment, workflow_request_id, completed_at,
       provider_request_id, estimated_cost_usd
from public.ai_generation_usage
where request_id = '1ca8ac6c-ea6a-48cf-b3cb-281ad6980c1d';

commit;
