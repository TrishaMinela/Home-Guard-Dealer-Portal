-- FORWARD RECOVERY, NOT APPLIED. Use only after the matching cutover.
-- Restores the five raw AI/provider read policies to their pre-cutover state.
-- Billing foundation data, billing-client policies, pricing, and audit policies
-- are intentionally unaffected.
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
