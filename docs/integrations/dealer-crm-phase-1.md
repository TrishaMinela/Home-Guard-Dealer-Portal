# Dealer CRM integration foundation — Phase 1

Prepared on 2026-11-06. The foundation migration was applied to HGI Portal DEV only after approval, and every integration defaults to `disabled`. There is no delivery trigger, worker, cron, webhook request, or other outbound delivery path in this foundation.

## Reused architecture

- The Customer Door Builder validates a slug and resolves it server-side through `server/dealerResolution.ts` to exactly one active `dealers.id` before saving a lead.
- `/api/submit-door-builder` persists the verified `dealer_id`, unique `submission_id`, normalized contact fields, and complete versioned `door_configuration` snapshot in `public.leads`.
- Portal lead RLS already scopes dealer users by `leads.dealer_id`; Home Guard admins have the existing all-leads read policy.
- The complete configuration snapshot already contains the product choices needed for future configurable field mapping. Phase 1 does not change the customer request or duplicate those fields.
- A separate, unapplied Google Sheets outbox exists in the dirty Customer Door Builder checkout. It is not a general CRM system and was not modified or made a dependency of this foundation.

## Data model

`dealer_crm_integrations` stores one disabled/test/live configuration per dealer and provider (`opta`, `gohighlevel`, or `custom_webhook`). `field_mapping` is deliberately configurable. Credentials are AES-256-GCM ciphertext, IV, authentication tag, and key version. The encryption key is a future server-only environment variable and never belongs in a `VITE_` variable or database row.

`dealer_crm_lead_deliveries` stores one idempotent delivery record per integration and lead, including provider, status, attempt count/time, provider request reference, HTTP status, sanitized response metadata, and sanitized error details. It does not store another customer payload.

Dealer isolation is enforced twice: `(integration_id, dealer_id, provider)` must match the integration and `(lead_id, dealer_id)` must match the persisted lead. A caller cannot pair one dealer’s credentials with another dealer’s lead even if it controls request parameters.

`dealer_crm_integration_audit_log` is credential-free configuration history. Authenticated Home Guard admins can read safe configuration metadata and delivery/audit status through column grants plus RLS. Credential columns have no authenticated grant. All writes remain service-role-only until a reviewed server endpoint is added.

## Standard mapping vocabulary

The server helper exposes a provider-neutral source vocabulary for customer name, email, phone, address, dealer ID, lead ID/source, door style, finish/color, glass, sidelites, hardware, the complete configuration summary, and an optional PDF quote URL. A provider mapping chooses which of those fields are sent. No Opta custom-field names are assumed.

## Phase 2 prerequisites

1. `20261106000000_create_dealer_crm_integration_foundation.sql` has been applied and verified in HGI Portal DEV only.
2. Add a dedicated 32-byte base64 `CRM_CREDENTIAL_ENCRYPTION_KEY` to server environments; document rotation and recovery before saving credentials.
3. Confirm Opta authentication, endpoint, accepted fields, rate limits, idempotency support, test mode, and response format with authoritative provider documentation.
4. Build an authenticated Home Guard admin API/UI that encrypts credentials server-side, never returns them, records audit events, and requires explicit Test/Live transitions.
5. Add a bounded delivery worker with leases, retries, sanitized diagnostics, and transactional/idempotent claim logic. Do not run provider HTTP calls in the customer request.
6. Perform controlled DEV tests with approved non-production provider credentials and synthetic leads before any Live state is allowed.
7. Decide how the existing Zapier lead delivery and the proposed CRM worker coexist so a lead is not duplicated across destinations.

No Opta account, credentials, endpoint, field contract, or connection is represented by this Phase 1 work.
