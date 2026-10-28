# AI Usage & Billing foundation

Status: Phase A foundation prepared for HGI Portal Dev. Stripe is **not enabled**, no invoice exists, and the AI-policy cutover remains deliberately unapplied.

## Existing architecture audit

- The Portal is a React/Vite single-page application using Supabase Auth and the browser-safe publishable key.
- `home_guard_admins` currently grants one undifferentiated Home Guard administrator role. It supports multiple users, but does not distinguish HGI client administrators from School Radius/internal billing administrators.
- The existing `/admin/ai-usage` page reads request telemetry, workflow telemetry, official provider activity aggregates, and actual provider cost aggregates directly under RLS.
- Official OpenAI reconciliation is scoped to `proj_haRRNxvf4CVwa2jHugJ762SM`. The validated October 5–22 baseline remains 300 requests and $16.41474045 in actual provider cost.
- No Stripe SDK, Stripe variables, billing account, invoice, or payment tables existed at the start of this work.
- Existing `home_guard_admins` RLS currently permits every Home Guard administrator to read provider costs. This must be split before client billing access is activated.

## Local client dashboard

`/admin/billing` provides the client-safe AI Usage & Billing experience:

- current-month AI Usage Charges, clearly marked provisional until finalized;
- outstanding balance, most recent invoice, and optional next billing date;
- daily charge trend and last-update timestamp;
- invoice history with only real database rows and optional hosted/PDF links;
- loading, no-access, empty, and error states;
- responsive desktop, tablet, and mobile layouts.

The browser query contract intentionally excludes provider cost, markup, profit, and internal estimates. The client sees only final charge amounts denominated as **AI Usage Charges**.

## Proposed authorization and data model

The foundation migration `20261027000000_create_ai_billing_foundation.sql` adds:

- `billing_internal_admins`: explicit internal billing permission;
- `billing_accounts` and `billing_account_users`: tenant-aware client access;
- `billing_pricing_versions`: confidential, effective-dated pricing;
- `billing_periods`: completeness and finalization state;
- `billing_provider_period_costs`: confidential verified provider inputs;
- `billing_client_usage_daily` and `billing_charge_summaries`: client-safe charges only;
- `billing_invoices` and `billing_invoice_items`: immutable invoice snapshots;
- `billing_payment_references`: Stripe/payment reconciliation;
- `billing_audit_log`: auditable internal actions and corrections.

RLS separates internal cost/pricing tables from client-safe tables. Browser roles are read-only. All calculation, invoice creation/finalization, corrections, Stripe calls, and webhook mutations must run in authenticated server functions; no service-role credential may enter browser code.

No real user assignments are included. `billing_client` is resolved only from explicit `billing_account_users` membership and receives a dedicated `/billing` layout. The future telemetry-policy cutover and its forward recovery SQL are held outside `supabase/migrations`, so a normal migration push cannot apply them accidentally.

Billing periods use UTC half-open calendar ranges: the first day of a month at 00:00 UTC through (but excluding) the first day of the next month. Client labels should display both inclusive calendar dates. Proposed invoice terms are Net 15 after finalization, subject to approval.

## Pricing and invoice safeguards

- Store verified provider cost in integer micro-dollars and client charges in integer cents.
- Calculate with an effective-dated pricing version. The initial proposed rule is 1500 basis points, configured as data rather than hard-coded into client code.
- Round once, half-up, when converting the final period charge to cents.
- Require provider coverage completeness before finalization.
- Snapshot the pricing version and charge on the billing period/invoice. Later pricing or provider adjustments never silently change a finalized invoice.
- Use an audit entry and explicit credit/debit adjustment for an authorized correction.
- Enforce one billing period and one invoice per account/period in Postgres, plus a deterministic Stripe idempotency key.
- Never create charges for missing provider data; leave the period provisional/incomplete.

## Stripe implementation plan

No Stripe API calls or objects are created in this phase.

1. Add server-only `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`; never use a `VITE_` prefix.
2. Create one Stripe Customer for the billing account in test mode after approval.
3. Prepare a local draft from a complete, verified billing period. Create one Stripe line item named `AI Usage Charges` with the billing period; do not put provider cost, markup, or margin in descriptions or metadata.
4. Create a Stripe draft invoice with `collection_method=send_invoice` and `auto_advance=false`. Stripe documents that draft invoices remain editable, while finalized monetary values become uneditable.
5. Approve, then finalize through a separate internal action. Persist the Stripe invoice ID, hosted invoice URL, PDF URL, status, and request ID.
6. Use a deterministic period idempotency key for each POST. Stripe documents idempotency keys as the mechanism for safely retrying writes without duplicate objects.
7. Verify the raw webhook body with the endpoint signing secret before processing `invoice.finalized`, `invoice.paid`, `invoice.payment_failed`, `invoice.voided`, and relevant payment events. Store processed event IDs uniquely.
8. Reconcile Stripe state to the invoice snapshot; Stripe never becomes the source for provider usage or pricing.

At the time of review, Stripe's public US pricing lists Starter Invoicing at 0.4% per paid invoice and standard domestic online card payments at 2.9% + 30¢. Stripe Billing pay-as-you-go is separately listed at 0.7% of Billing volume and excludes one-off invoices. Confirm the account's actual contract and product selection before forecasting fees. Processing fees remain an internal planning cost and are not automatically added to HGI.

## Remaining decisions and approvals

1. Approve the schema and RLS migration after a Supabase dry run.
2. Assign explicit internal billing admins and HGI billing-account users.
3. Decide billing timezone (UTC is proposed), invoice cadence, due terms, and next billing date.
4. Decide whether image-generation counts should appear only when provider reconciliation can support them accurately.
5. Approve server-only billing preparation/finalization endpoints and audit workflow.
6. Provide Stripe test-mode credentials and webhook secret only when Stripe Phase 2 is approved.
7. Restrict the existing raw AI Usage page/provider tables to internal billing administrators before granting HGI client access.

## Verification scope

Automated tests cover exact integer pricing, rounding, invalid pricing, deterministic invoice idempotency, and the absence of confidential field names from client billing code. TypeScript, lint, production build, tests, and `git diff --check` are required before review.
