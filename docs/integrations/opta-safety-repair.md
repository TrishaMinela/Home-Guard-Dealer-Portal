# Opta delivery safety and reconciliation

The live switch `OPTA_LIVE_DELIVERY_ENABLED` defaults off and must remain unset until separately approved. The Door Builder notification is disabled when `CRM_DELIVERY_TRIGGER_SECRET` is absent. Configure the same secret server-side in both projects only after the Portal trigger is deployed and verified; never use a VITE_ variable. The daily sweep remains the recovery path for missed notifications.

A successful live response requires HTTP 200, `leadStatus: true`, and `testLead: false`. Any missing or contradictory classification is unconfirmed and is dead-lettered. It is never automatically resent.

Bounded retries (1 minute, 5 minutes, 30 minutes, 2 hours, then 6 hours, and dead-letter on the sixth transient failure) apply only when Opta definitely did not accept the lead: a DNS failure or connection refused before the request was sent, HTTP 429, or HTTP 5xx. Permanent 4xx rejects, invalid or missing fields, and ineligible leads go straight to `dead_letter`.

Ambiguous outcomes are never automatically resent, because Opta may already have the lead: a timeout after the request was sent, an unparseable HTTP 200, and a `saveResult` failure after a send. Those are recorded as `dead_letter` when storage still accepts a write. If that write also fails, the row stays `attempting`. The sweep does not retry `attempting` rows. Dead letters are logged with the `OPTA_DEAD_LETTER` marker. This design does not guarantee exactly-once external delivery.

The sweep queries leads without an existing delivery row, ordered by creation time and ID, in batches of 20. A unique database constraint still decides the winner if the trigger and sweep race. No historical lead is eligible for live delivery unless it is newer than the integration's live-state audit cutoff.
