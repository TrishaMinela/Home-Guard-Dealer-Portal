# Billing access management

Internal billing access and access-management authority are separate privileges.

- `billing_internal_admins` grants protected billing administration access.
- `billing_access_managers` grants authority to invite, grant, list, and revoke internal billing admins.
- Only the approved School Radius identity is bootstrapped as an access manager.
- Granting billing access never grants Home Guard admin, dealer, billing-client, or access-manager membership.
- Revocation removes only `billing_internal_admins`; it preserves the Supabase Auth user and every unrelated legitimate role.
- Access-manager accounts cannot have billing access removed through this workflow, preventing self-lockout and loss of the final manager.

All Auth administration runs in the server-only Vercel function using `SUPABASE_SERVICE_ROLE_KEY`. The browser supplies its existing Supabase bearer token, which is verified against `is_billing_access_manager()` before any operation. Responses contain safe user fields only; UUIDs, tokens, invitation secrets, and service credentials are not returned.

Events are recorded in `billing_access_audit_log` with actor, target, normalized email, action, and timestamp. No passwords, access tokens, or invitation credentials are stored.

## HGI billing clients

Access managers can assign only the fixed Home Guard Industries billing account (`7791a715-da6b-40bb-8795-4148cecff204`) and the currently supported `viewer` role. Existing Auth identities are reused; otherwise, Supabase sends an invitation from the server. Home Guard admins, dealers, internal billing admins, access managers, and users assigned to another billing account are rejected as incompatible.

Removing access deletes only the HGI `billing_account_users` membership. The Auth identity, finalized summaries, invoices, and audit history remain intact. Pending invitations can be resent without exposing any invitation credential to the browser.
