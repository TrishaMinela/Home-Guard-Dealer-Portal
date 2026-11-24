# Opta delivery safety and reconciliation

The live switch `OPTA_LIVE_DELIVERY_ENABLED` defaults off and must remain unset until separately approved. The Door Builder notification is disabled when `CRM_DELIVERY_TRIGGER_SECRET` is absent. Configure the same secret server-side in both projects only after the Portal trigger is deployed and verified; never use a VITE_ variable. The daily sweep remains the recovery path for missed notifications.

A successful live response requires HTTP 200, `leadStatus: true`, and `testLead: false`. Any missing or contradictory classification is unconfirmed. Network errors, timeouts, unexpected responses, and interrupted attempts are not automatically resent: Opta might already have received the request. Reconcile these records with Opta before any manual remediation. A record left in `attempting` after an interruption is deliberately held for the same reason. This design does not guarantee exactly-once external delivery.

The sweep queries leads without an existing delivery row, ordered by creation time and ID, in batches of 20. A unique database constraint still decides the winner if the trigger and sweep race. No historical lead is eligible for live delivery unless it is newer than the integration's live-state audit cutoff.
