# Production deployment and rollback

Do not apply the migration, set the flags, or edit Zapier or Personify as part of merging this pull request. Vercel preview and production environment variables stay unchanged.

## Enable later, in this order

1. Review the migration and apply `supabase/migrations/20261117160000_add_zip_lead_routing.sql` to the shared project only after a separate approval. The settings row keeps routing and both notification modes off, so Door Builder inserts still do not create cases.
2. Create salesperson rows for existing auth users. Do not send invitation email from this feature.
3. Enter ZIP assignments and dealer coverage while notification modes stay `disabled`. The API still refuses those writes until `LEAD_ROUTING_ENABLED=true` and `routing_enabled` is true. Set the database flag first only when an operator is ready for the trigger to classify new main-HGI leads. That still does not email anyone.
4. Approve the HGI Master Zap filter described in `personify-zapier-setup.md` before dealers should stop receiving the current submission-time zap.
5. Set `DEALER_NOTIFICATIONS_MODE=dry_run` and the matching database value. Exercise Send Notification with a synthetic lead. Confirm one attempt, no network call, and no pointer movement.
6. Set `PERSONIFY_NOTIFICATIONS_MODE=dry_run` the same way. Confirm the stored link is `/sales/leads/{leadId}` and that a second user cannot open it.
7. Live mode is a later approval. It needs `PORTAL_URL`, a non-Zapier `DEALER_NOTIFICATION_WEBHOOK_URL`, and Personify token, location id, and salesperson contact ids. Missing values fail closed with no request.

## Rollback

1. Set `LEAD_ROUTING_ENABLED` empty and both notification modes to `disabled` or remove them. Set `lead_routing_settings.routing_enabled` false and both database modes to `disabled`. New inserts stop creating cases. The API stops claiming sends.
2. If the tables themselves must go away, run `supabase/rollbacks/20261117160000_add_zip_lead_routing_rollback.sql`. That removes the trigger and the new tables. Existing `leads` rows, dealer routing, Opta, and the Door Builder insert stay.
3. Redeploy the previous Portal build if the salesperson pages should disappear. Door Builder does not need a rollback for this Portal change, because its insert contract is unchanged.

In-flight `notification_sending` rows, if any exist after a crash, stay on that dealer. A second success call does not advance the pointer again. A failed attempt can be retried with the same idempotency key.
