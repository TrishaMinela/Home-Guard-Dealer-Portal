# HGI invoice rules

- An invoice may be issued only from one finalized billing period and its immutable finalized charge summary.
- Issue date is the UTC calendar date when the finalized period is converted to an invoice.
- Terms are Net 15; due date is the issue date plus 15 calendar days.
- Invoice numbers use the database-generated, race-safe yearly sequence `HGI-YYYY-NNNN`.
- Currency is USD and all client amounts are snapshotted in cents. Invoice creation does not recalculate pricing.
- The single client-facing line item is `AI Usage Charges`, quantity 1, using the finalized monthly charge as unit and line total.
- Tax is explicitly `not_configured`; no tax determination or calculation is applied and invoices do not display a misleading tax rate.
- Issued invoice identity, dates, currency, line item, and financial fields are immutable. Corrections require void/replacement or a future explicit adjustment workflow.
- Supported statuses are draft, issued, paid, and void. Paid is reserved for future payment integration; void preserves history.
- Stripe, payment collection, and real invoice creation remain disabled until separately approved.
