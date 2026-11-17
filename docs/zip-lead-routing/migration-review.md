# Migration review

File: `supabase/migrations/20261117160000_add_zip_lead_routing.sql`

Rollback: `supabase/rollbacks/20261117160000_add_zip_lead_routing_rollback.sql`

This migration was applied only to a local Postgres database for tests. It was not applied to `udbcnpjtwhmjzpjjhoph` (HGI Portal Dev) or to the inactive HGI Portal Production project.

## What it adds

New tables: `lead_routing_settings`, `salespeople`, `zip_territory_assignments`, `dealer_zip_coverage`, `zip_rotation_state`, `lead_routing_cases`, `lead_routing_audit_log`, `lead_notification_attempts`.

It also adds select policies so assigned salespeople can read their lead, their proposed dealer, and their routing history. Home Guard admins already read all leads; new policies let them read the routing tables. RLS is enabled on every new table. Authenticated and anonymous roles cannot insert, update, or delete them.

The settings row is inserted with routing off and both notification modes disabled. `service_role` can read settings and cannot update them. Turning routing on is an operator SQL change, not an API action.

## What it does not change

It does not alter `submit_public_lead`, `leads` columns, dealer CRM tables, Opta, billing, inventory, logos, banners, or Personify credentials. The new trigger is `AFTER INSERT` on `public.leads`. With the default settings row, the trigger returns the new lead without writing a routing case and without writing a notification attempt.

Rollback drops the trigger, the new functions, the two new read policies on `leads` and `dealers`, and the new tables. It does not drop `leads` or `dealers`.

## Functions

The mutating functions are `security invoker` in `public` and executable only by `service_role`. The Portal API calls them with the service role after it has checked the signed-in user and the environment flags. A browser JWT cannot execute them. The trigger function is also granted to `service_role` because Door Builder inserts as that role. The function owner can execute it as well, which covers `submit_public_lead` if that security-definer path inserts a lead later.

`lead_routing_claim_dealer_send` locks the case, then the attempt, and uses the idempotency key as a second guard. `lead_routing_complete_dealer_send` locks in the same order. `succeeded` is stored only when `dealer_notifications_mode` is `live`. A repeated success returns `already_complete`.
