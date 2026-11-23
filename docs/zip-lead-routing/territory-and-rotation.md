# Territory and rotation

Rotation is per ZIP, not per larger territory. Two ZIPs with the same dealers rotate independently.

## Territory

`zip_territory_assignments` maps one 5-digit ZIP to one salesperson. A missing row, an inactive row, a null salesperson, or an inactive salesperson sends the lead to the admin unassigned queue:

| Condition | `unassigned_reason` |
| --- | --- |
| ZIP blank or not a US ZIP / ZIP+4 | `missing_or_invalid_zip` |
| No assignment row | `unknown_zip` |
| Assignment row is inactive | `inactive_assignment` |
| Salesperson missing or inactive at insert | `inactive_salesperson` |

Unassigned cases have no proposed dealer. Send Notification cannot choose one. No dealer email is created.

If a salesperson is deactivated later, their open cases (`awaiting_approval`, `notification_failed`, `blocked_dealer_inactive`, `no_eligible_dealer`) move to the unassigned queue and clear the salesperson and proposal. Cases already `notified` or `notification_sending` stay as history. The inactive person no longer matches the read policy.

An inactive salesperson who is also a dealer user falls through to the dealer portal instead of seeing an empty queue. An active salesperson is shown the salesperson queue even if they also have a dealer membership. Admins keep the admin shell.

## Coverage

`dealer_zip_coverage` lists which dealers may receive leads for a ZIP. A dealer is eligible only when the coverage row is active and `dealers.is_active` is true. Dealers are ordered by `dealers.id`, which is the same order as canonical UUID text.

## Pointer

`zip_rotation_state.last_dealer_id` is the last dealer who received a successful live notification for that ZIP. The next proposal is the next eligible id after that pointer, wrapping to the first. The pointer does not move when a lead is inserted, when a dealer is proposed, when delivery fails, or during a dry run.

If the proposed dealer is inactive or loses coverage before Send Notification, the send is blocked and the case shows `blocked_dealer_inactive`. The salesperson or an admin must click Re-propose dealer. That recalculates the next eligible dealer and does not send. Re-propose is refused while the current proposal is still eligible, so a salesperson cannot skip a dealer.

One send goes to one dealer. The idempotency key includes that dealer id. A retry after a failed delivery uses the same key and the same dealer.
