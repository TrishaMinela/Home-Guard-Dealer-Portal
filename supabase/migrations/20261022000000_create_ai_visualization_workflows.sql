create table public.ai_visualization_workflows (
  id uuid primary key default gen_random_uuid(),
  workflow_request_id text not null unique,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  environment text not null,
  status text not null default 'started',
  failure_stage text,
  failure_category text,
  analysis_request_id text,
  analysis_provider_request_id text,
  generation_request_id text,
  generation_provider_request_id text,
  estimated_total_cost_usd numeric(12, 6),
  duration_ms integer,
  completion_token_hash text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_visualization_workflows_environment_check
    check (environment in ('production', 'preview', 'development')),
  constraint ai_visualization_workflows_status_check
    check (status in ('started', 'succeeded', 'failed')),
  constraint ai_visualization_workflows_failure_stage_check
    check (failure_stage is null or failure_stage in ('entrance_analysis', 'image_generation', 'application_infrastructure')),
  constraint ai_visualization_workflows_cost_check
    check (estimated_total_cost_usd is null or estimated_total_cost_usd >= 0),
  constraint ai_visualization_workflows_duration_check
    check (duration_ms is null or duration_ms >= 0),
  constraint ai_visualization_workflows_completion_check
    check (
      (status = 'started' and completed_at is null and failure_stage is null and failure_category is null and duration_ms is null)
      or
      (status = 'succeeded' and completed_at is not null and failure_stage is null and failure_category is null and duration_ms is not null)
      or
      (status = 'failed' and completed_at is not null and failure_stage is not null and failure_category is not null and duration_ms is not null)
    )
);

create index ai_visualization_workflows_started_at_idx
  on public.ai_visualization_workflows (started_at desc);

create index ai_visualization_workflows_environment_started_at_idx
  on public.ai_visualization_workflows (environment, started_at desc);

create index ai_visualization_workflows_status_started_at_idx
  on public.ai_visualization_workflows (status, started_at desc);

alter table public.ai_visualization_workflows enable row level security;

create policy "Home Guard admins can read AI visualization workflows"
on public.ai_visualization_workflows
for select
to authenticated
using (
  exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

comment on table public.ai_visualization_workflows is
  'One privacy-safe lifecycle record per AI Visualizer attempt. Images, prompts, and customer payloads are never stored here.';

create or replace function public.sync_ai_visualization_workflow_usage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_workflow_request_id text;
begin
  target_workflow_request_id := coalesce(new.workflow_request_id, old.workflow_request_id);
  if target_workflow_request_id is null then
    return coalesce(new, old);
  end if;

  update public.ai_visualization_workflows as workflow
  set
    analysis_request_id = coalesce(
      workflow.analysis_request_id,
      (select request_id from public.ai_entrance_detection_usage where workflow_request_id = target_workflow_request_id order by created_at asc limit 1)
    ),
    analysis_provider_request_id = coalesce(
      workflow.analysis_provider_request_id,
      (select provider_request_id from public.ai_entrance_detection_usage where workflow_request_id = target_workflow_request_id and provider_request_id is not null order by created_at asc limit 1)
    ),
    generation_request_id = coalesce(
      workflow.generation_request_id,
      (select request_id from public.ai_generation_usage where workflow_request_id = target_workflow_request_id order by created_at asc limit 1)
    ),
    generation_provider_request_id = coalesce(
      workflow.generation_provider_request_id,
      (select provider_request_id from public.ai_generation_usage where workflow_request_id = target_workflow_request_id and provider_request_id is not null order by created_at asc limit 1)
    ),
    estimated_total_cost_usd = case
      when exists (select 1 from public.ai_entrance_detection_usage where workflow_request_id = target_workflow_request_id and estimated_cost_usd is not null)
        or exists (select 1 from public.ai_generation_usage where workflow_request_id = target_workflow_request_id and estimated_cost_usd is not null)
      then coalesce((select sum(estimated_cost_usd) from public.ai_entrance_detection_usage where workflow_request_id = target_workflow_request_id), 0)
         + coalesce((select sum(estimated_cost_usd) from public.ai_generation_usage where workflow_request_id = target_workflow_request_id), 0)
      else null
    end,
    updated_at = now()
  where workflow.workflow_request_id = target_workflow_request_id;

  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_ai_visualization_workflow_usage() from public;

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
    and status = 'started'
    and (p_completion_token_hash is null or completion_token_hash = p_completion_token_hash);

  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end;
$$;

revoke all on function public.complete_ai_visualization_workflow(text, text, text, text, text, text) from public;
grant execute on function public.complete_ai_visualization_workflow(text, text, text, text, text, text) to service_role;

create trigger sync_ai_visualization_workflow_from_entrance_usage
after insert or update or delete on public.ai_entrance_detection_usage
for each row execute function public.sync_ai_visualization_workflow_usage();

create trigger sync_ai_visualization_workflow_from_generation_usage
after insert or update or delete on public.ai_generation_usage
for each row execute function public.sync_ai_visualization_workflow_usage();
