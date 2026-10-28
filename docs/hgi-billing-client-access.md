# HGI billing-client access

The Portal resolves `billing_client` as a dedicated application account type from an explicit `billing_account_users` membership. It is not a Home Guard admin, dealer, global administrator, or internal billing administrator role.

## Approved-user activation procedure

Do not run this procedure until HGI approves the client email and intended role.

1. In HGI Portal Dev Supabase, create or invite the approved email under **Authentication → Users**. Do not copy a Production password or create a shared credential.
2. Record the new Auth user UUID after the user exists.
3. Confirm the UUID has no row in `home_guard_admins`, `billing_internal_admins`, or `dealer_users`. Those roles are intentionally incompatible with billing-client access.
4. Insert one membership in `billing_account_users` using:

   ```sql
   insert into public.billing_account_users (billing_account_id, user_id, role)
   values (
     '7791a715-da6b-40bb-8795-4148cecff204',
     'APPROVED_AUTH_USER_UUID',
     'viewer'
   );
   ```

5. Sign in through the normal Portal login. The authenticated user will be routed to `/billing`, not `/admin` or dealer routes.
6. Verify Billing Overview, AI Usage Charges, and Billing History. Confirm `/admin`, dealer pages, raw AI telemetry, pricing, provider costs, audit data, and diagnostics remain inaccessible.
7. Verify sign-out and a fresh login. Refreshing any billing route must preserve the billing-client layout.

If the user later needs a different Portal role, remove the billing membership before granting that role. Do not combine role assignments.

## Client-safe data contract

The client UI reads only `billing_accounts`, `billing_client_usage_daily`, `billing_charge_summaries`, and `billing_invoices` through membership-scoped RLS. It never queries provider costs, pricing versions, provider reconciliation, raw AI telemetry, internal audits, or Stripe identifier tables.
