-- Rolls back 20261117160000_add_zip_lead_routing.sql.
-- Does not modify leads, dealers, Door Builder ingestion, Opta, or billing.

drop trigger if exists lead_routing_after_lead_insert on public.leads;
drop trigger if exists lead_routing_salesperson_inactive on public.salespeople;

drop function if exists public.lead_routing_save_coverage(uuid, uuid, text, boolean);
drop function if exists public.lead_routing_save_territory(uuid, text, uuid, boolean);
drop function if exists public.lead_routing_save_salesperson(uuid, uuid, text, text, text, boolean);
drop function if exists public.lead_routing_require_admin(uuid);
drop function if exists public.lead_routing_complete_salesperson_notify(uuid, text, text, text);
drop function if exists public.lead_routing_claim_salesperson_notify(uuid, uuid);
drop function if exists public.lead_routing_repropose_dealer(uuid, uuid);
drop function if exists public.lead_routing_complete_dealer_send(uuid, text, text, text);
drop function if exists public.lead_routing_claim_dealer_send(uuid, uuid, uuid);
drop function if exists public.lead_routing_on_salesperson_inactive();
drop function if exists public.lead_routing_on_lead_insert();
drop function if exists public.lead_routing_audit(uuid, uuid, uuid, text, text, text, jsonb);
drop function if exists public.lead_routing_next_dealer(text);
drop function if exists public.lead_routing_actor_role(uuid, uuid);
drop function if exists public.lead_routing_normalize_zip(text);

drop policy if exists "Salespeople can read the dealer proposed on their lead" on public.dealers;
drop policy if exists "Salespeople can read leads assigned to them" on public.leads;

drop table if exists public.lead_notification_attempts;
drop table if exists public.lead_routing_audit_log;
drop table if exists public.lead_routing_cases;
drop table if exists public.zip_rotation_state;
drop table if exists public.dealer_zip_coverage;
drop table if exists public.zip_territory_assignments;
drop table if exists public.salespeople;
drop table if exists public.lead_routing_settings;
