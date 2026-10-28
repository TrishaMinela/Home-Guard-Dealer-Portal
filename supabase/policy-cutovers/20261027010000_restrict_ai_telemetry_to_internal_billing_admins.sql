-- PREPARED, NOT APPLIED. Move into supabase/migrations only after Phase B approval.
drop policy if exists "Home Guard admins can read AI generation usage" on public.ai_generation_usage;
create policy "Internal billing admins can read AI generation usage" on public.ai_generation_usage for select to authenticated using (public.is_billing_internal_admin());
drop policy if exists "Home Guard admins can read AI entrance detection usage" on public.ai_entrance_detection_usage;
create policy "Internal billing admins can read AI entrance detection usage" on public.ai_entrance_detection_usage for select to authenticated using (public.is_billing_internal_admin());
drop policy if exists "Home Guard admins can read AI visualization workflows" on public.ai_visualization_workflows;
create policy "Internal billing admins can read AI visualization workflows" on public.ai_visualization_workflows for select to authenticated using (public.is_billing_internal_admin());
drop policy if exists "Home Guard admins can read provider activity reconciliation" on public.ai_provider_activity_daily;
create policy "Internal billing admins can read provider activity reconciliation" on public.ai_provider_activity_daily for select to authenticated using (public.is_billing_internal_admin());
drop policy if exists "Home Guard admins can read provider cost reconciliation" on public.ai_provider_cost_daily;
create policy "Internal billing admins can read provider cost reconciliation" on public.ai_provider_cost_daily for select to authenticated using (public.is_billing_internal_admin());
drop policy if exists "Home Guard admins can read AI admin issues" on public.ai_admin_issues;
create policy "Internal billing admins can read AI admin issues" on public.ai_admin_issues for select to authenticated using (public.is_billing_internal_admin());

create or replace function public.resolve_ai_admin_issue(p_issue_id uuid) returns public.ai_admin_issues
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user_id uuid:=auth.uid(); v_issue public.ai_admin_issues;
begin
  if v_user_id is null or not public.is_billing_internal_admin() then raise exception 'Internal billing administrator access required'; end if;
  update public.ai_admin_issues set status='resolved',resolved_at=now(),resolved_by=v_user_id,updated_at=now()
  where id=p_issue_id and status='unresolved' returning * into v_issue;
  if v_issue.id is null then raise exception 'Unresolved AI issue not found'; end if;
  return v_issue;
end $$;
revoke all on function public.resolve_ai_admin_issue(uuid) from public,anon;
grant execute on function public.resolve_ai_admin_issue(uuid) to authenticated;
