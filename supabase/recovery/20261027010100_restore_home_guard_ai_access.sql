-- FORWARD RECOVERY TEMPLATE, NOT APPLIED. Use only after the matching cutover.
drop policy if exists "Internal billing admins can read AI generation usage" on public.ai_generation_usage;
create policy "Home Guard admins can read AI generation usage" on public.ai_generation_usage for select to authenticated using (exists(select 1 from public.home_guard_admins where user_id=(select auth.uid())));
drop policy if exists "Internal billing admins can read AI entrance detection usage" on public.ai_entrance_detection_usage;
create policy "Home Guard admins can read AI entrance detection usage" on public.ai_entrance_detection_usage for select to authenticated using (exists(select 1 from public.home_guard_admins where user_id=(select auth.uid())));
drop policy if exists "Internal billing admins can read AI visualization workflows" on public.ai_visualization_workflows;
create policy "Home Guard admins can read AI visualization workflows" on public.ai_visualization_workflows for select to authenticated using (exists(select 1 from public.home_guard_admins where user_id=(select auth.uid())));
drop policy if exists "Internal billing admins can read provider activity reconciliation" on public.ai_provider_activity_daily;
create policy "Home Guard admins can read provider activity reconciliation" on public.ai_provider_activity_daily for select to authenticated using (exists(select 1 from public.home_guard_admins where user_id=(select auth.uid())));
drop policy if exists "Internal billing admins can read provider cost reconciliation" on public.ai_provider_cost_daily;
create policy "Home Guard admins can read provider cost reconciliation" on public.ai_provider_cost_daily for select to authenticated using (exists(select 1 from public.home_guard_admins where user_id=(select auth.uid())));
drop policy if exists "Internal billing admins can read AI admin issues" on public.ai_admin_issues;
create policy "Home Guard admins can read AI admin issues" on public.ai_admin_issues for select to authenticated using (exists(select 1 from public.home_guard_admins where user_id=(select auth.uid())));

create or replace function public.resolve_ai_admin_issue(p_issue_id uuid) returns public.ai_admin_issues
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user_id uuid:=auth.uid(); v_issue public.ai_admin_issues;
begin
  if v_user_id is null or not exists(select 1 from public.home_guard_admins where user_id=v_user_id) then raise exception 'Home Guard administrator access required'; end if;
  update public.ai_admin_issues set status='resolved',resolved_at=now(),resolved_by=v_user_id,updated_at=now()
  where id=p_issue_id and status='unresolved' returning * into v_issue;
  if v_issue.id is null then raise exception 'Unresolved AI issue not found'; end if;
  return v_issue;
end $$;
revoke all on function public.resolve_ai_admin_issue(uuid) from public,anon;
grant execute on function public.resolve_ai_admin_issue(uuid) to authenticated;
