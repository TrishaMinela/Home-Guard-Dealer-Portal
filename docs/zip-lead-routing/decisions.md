# Decisions that need confirmation

These are the choices implemented here. They can be changed before routing is enabled. None of them have been turned on in Personify, Zapier, Vercel, or the shared Supabase project.

1. Rotation is per 5-digit ZIP. A salesperson can cover many ZIPs, but each ZIP has its own pointer.
2. Eligible dealers are ordered by dealer id. The pointer stores the last dealer whose live notification succeeded.
3. Main HGI means `source = 'door_builder'` and `dealer_id is null`. Dealer pages stay out of the rotation even when their ZIP would match a territory.
4. No new Door Builder column. PR 14's 5-digit main-HGI ZIP is compatible and not required for the Portal to normalize ZIP+4.
5. The review link is a normal Portal path. Possession of the URL is not authorization.
6. An active salesperson account opens the salesperson queue before a dealer or billing membership. Admins stay in the admin shell. An inactive salesperson falls through to any other role they already have.
7. Deactivating a salesperson returns their open leads to the unassigned queue. In-flight or already notified cases are not reassigned.
8. Re-propose is allowed only when the current dealer is no longer eligible. The salesperson does not pick a different dealer while the proposal is still valid.
9. Dry run records an attempt and does not advance rotation or mark the lead notified. Live success is the only advance.
10. Personify messages omit homeowner contact details. The dealer payload includes name, email, phone, ZIP, notes, and the stored door configuration. It does not include a street address because the Door Builder form does not collect one.
11. The dealer transport refuses `hooks.zapier.com` so this path cannot call the existing master, AB, or WDM zaps.
12. Door Builder previews share the production Supabase project and have no preview switch. The insert trigger never sends. Portal notification code stays inert unless the environment flags and the database switches are both set, which this change does not do.
