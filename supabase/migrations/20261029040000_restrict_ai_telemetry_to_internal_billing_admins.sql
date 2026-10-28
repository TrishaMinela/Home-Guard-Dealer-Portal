-- Restrict raw AI telemetry and provider reconciliation to School Radius/internal
-- billing administrators. Privacy-safe operational AI issues remain available to
-- Home Guard admins under their existing policy and resolve function.
drop policy if exists "Home Guard admins can read AI generation usage" on public.ai_generation_usage;
create policy "Internal billing admins can read AI generation usage"
on public.ai_generation_usage for select to authenticated
using (public.is_billing_internal_admin());

drop policy if exists "Home Guard admins can read AI entrance detection usage" on public.ai_entrance_detection_usage;
create policy "Internal billing admins can read AI entrance detection usage"
on public.ai_entrance_detection_usage for select to authenticated
using (public.is_billing_internal_admin());

drop policy if exists "Home Guard admins can read AI visualization workflows" on public.ai_visualization_workflows;
create policy "Internal billing admins can read AI visualization workflows"
on public.ai_visualization_workflows for select to authenticated
using (public.is_billing_internal_admin());

drop policy if exists "Home Guard admins can read provider activity reconciliation" on public.ai_provider_activity_daily;
create policy "Internal billing admins can read provider activity reconciliation"
on public.ai_provider_activity_daily for select to authenticated
using (public.is_billing_internal_admin());

drop policy if exists "Home Guard admins can read provider cost reconciliation" on public.ai_provider_cost_daily;
create policy "Internal billing admins can read provider cost reconciliation"
on public.ai_provider_cost_daily for select to authenticated
using (public.is_billing_internal_admin());

comment on policy "Internal billing admins can read provider cost reconciliation"
on public.ai_provider_cost_daily is
  'Provider actual cost is restricted to approved internal billing administrators.';
