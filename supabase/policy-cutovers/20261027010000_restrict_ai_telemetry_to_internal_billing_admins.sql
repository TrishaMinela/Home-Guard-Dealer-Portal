-- Reviewed cutover source. Applied through the matching timestamped migration.
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
-- ai_admin_issues intentionally remains readable/resolvable by Home Guard admins.
-- It is a privacy-safe operational incident table and contains no provider cost,
-- pricing, prompt, image, key, or raw provider payload data.
