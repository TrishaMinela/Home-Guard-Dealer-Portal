create table public.ai_admin_issues (
  id uuid primary key default gen_random_uuid(),
  workflow_request_id text not null,
  related_workflow_id uuid references public.ai_visualization_workflows(id) on delete set null,
  issue_type text not null,
  grouping_key text not null,
  severity text not null,
  title text not null,
  admin_summary text not null,
  recommended_action text not null,
  failure_stage text not null,
  failure_category text not null,
  environment text not null,
  provider_request_id text,
  occurred_at timestamptz not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  occurrence_count integer not null default 1,
  status text not null default 'unresolved',
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_admin_issues_severity_check check (severity in ('critical', 'warning')),
  constraint ai_admin_issues_status_check check (status in ('unresolved', 'resolved')),
  constraint ai_admin_issues_occurrence_count_check check (occurrence_count > 0),
  constraint ai_admin_issues_resolution_check check (
    (status = 'unresolved' and resolved_at is null and resolved_by is null)
    or (status = 'resolved' and resolved_at is not null and resolved_by is not null)
  )
);

create unique index ai_admin_issues_one_unresolved_group_idx
  on public.ai_admin_issues (grouping_key)
  where status = 'unresolved';

create index ai_admin_issues_status_last_seen_idx
  on public.ai_admin_issues (status, last_seen_at desc);

alter table public.ai_admin_issues enable row level security;

create policy "Home Guard admins can read AI admin issues"
on public.ai_admin_issues for select to authenticated
using (exists (
  select 1 from public.home_guard_admins
  where home_guard_admins.user_id = (select auth.uid())
));

grant select on public.ai_admin_issues to authenticated;

create or replace function public.capture_ai_admin_issue()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_category text := lower(trim(new.failure_category));
  v_issue_type text;
  v_severity text;
  v_title text;
  v_summary text;
  v_action text;
  v_threshold integer := 1;
  v_recent_count integer := 1;
  v_first_seen timestamptz := new.started_at;
  v_grouping_key text;
begin
  if new.status <> 'failed' or old.status = 'failed' then return new; end if;

  -- Customer-correctable photo/input problems remain telemetry only.
  if v_category ~ '(photo|low.?confidence|incompatib|invalid.?image|image.?decode|unsupported.?image|payload.?too.?large|missing.?image)' then
    return new;
  end if;

  if v_category ~ '(billing|credit|spend.?limit|insufficient.?quota|invalid.?api.?key|token.?invalid|revoked.?key|account.?disabled|server.?configuration|supabase.?not.?configured)' then
    v_issue_type := 'ai_service_unavailable';
    v_severity := 'critical';
    v_title := 'AI Visualizer unavailable';
    v_summary := 'A billing, credential, or server configuration problem is preventing AI visualization.';
    v_action := 'Verify the OpenAI project billing limits and the server-only API and Supabase configuration, then run a controlled visualization test.';
  elsif new.failure_stage = 'application_infrastructure' then
    v_issue_type := 'infrastructure_failure';
    v_severity := 'critical';
    v_title := 'AI Visualizer infrastructure failures';
    v_summary := 'Repeated application or infrastructure failures are interrupting AI visualization workflows.';
    v_action := 'Review the workflow and deployment logs for this category, verify server configuration, and run a controlled visualization test.';
    v_threshold := 3;
  elsif v_category ~ '(rate.?limit|too.?many.?requests)' then
    v_issue_type := 'rate_limiting';
    v_severity := 'warning';
    v_title := 'AI Visualizer rate limiting';
    v_summary := 'Repeated provider rate limits are delaying AI visualization requests.';
    v_action := 'Review request volume and provider rate limits. Retry a controlled visualization after the limit window clears.';
    v_threshold := 3;
  elsif v_category ~ '(timeout|provider|service.?unavailable|network|upstream)' then
    v_issue_type := 'provider_failure';
    v_severity := 'warning';
    v_title := 'AI Visualizer provider failures';
    v_summary := 'Repeated provider, network, or timeout failures are affecting AI visualization.';
    v_action := 'Review provider status and server logs for the referenced workflows, then retry a controlled visualization.';
    v_threshold := 3;
  else
    return new;
  end if;

  if v_threshold > 1 then
    select count(*), min(started_at)
      into v_recent_count, v_first_seen
    from public.ai_visualization_workflows
    where status = 'failed'
      and environment = new.environment
      and failure_stage = new.failure_stage
      and lower(trim(failure_category)) = v_category
      and started_at >= new.started_at - interval '15 minutes'
      and started_at <= new.started_at;
    if v_recent_count < v_threshold then return new; end if;
  end if;

  v_grouping_key := concat_ws(':', new.environment, v_issue_type, new.failure_stage, v_category);

  insert into public.ai_admin_issues (
    workflow_request_id, related_workflow_id, issue_type, grouping_key, severity,
    title, admin_summary, recommended_action, failure_stage, failure_category,
    environment, provider_request_id, occurred_at, first_seen_at, last_seen_at,
    occurrence_count
  ) values (
    new.workflow_request_id, new.id, v_issue_type, v_grouping_key, v_severity,
    v_title, v_summary, v_action, new.failure_stage, v_category,
    new.environment, coalesce(new.generation_provider_request_id, new.analysis_provider_request_id),
    new.started_at, v_first_seen, new.started_at, v_recent_count
  )
  on conflict (grouping_key) where status = 'unresolved'
  do update set
    workflow_request_id = excluded.workflow_request_id,
    related_workflow_id = excluded.related_workflow_id,
    provider_request_id = excluded.provider_request_id,
    occurred_at = excluded.occurred_at,
    last_seen_at = excluded.last_seen_at,
    occurrence_count = public.ai_admin_issues.occurrence_count + 1,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.capture_ai_admin_issue() from public;

create trigger capture_ai_admin_issue_after_workflow_failure
after update of status on public.ai_visualization_workflows
for each row execute function public.capture_ai_admin_issue();

create or replace function public.resolve_ai_admin_issue(p_issue_id uuid)
returns public.ai_admin_issues
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_issue public.ai_admin_issues;
begin
  if v_user_id is null or not exists (
    select 1 from public.home_guard_admins where user_id = v_user_id
  ) then
    raise exception 'Home Guard administrator access required';
  end if;

  update public.ai_admin_issues
  set status = 'resolved', resolved_at = now(), resolved_by = v_user_id, updated_at = now()
  where id = p_issue_id and status = 'unresolved'
  returning * into v_issue;

  if v_issue.id is null then raise exception 'Unresolved AI issue not found'; end if;
  return v_issue;
end;
$$;

revoke all on function public.resolve_ai_admin_issue(uuid) from public;
grant execute on function public.resolve_ai_admin_issue(uuid) to authenticated;

comment on table public.ai_admin_issues is
  'Persistent, privacy-safe HGI admin incidents derived from qualifying AI workflow failures. Contains no prompts, images, keys, or raw provider payloads.';
