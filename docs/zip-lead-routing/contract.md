# Door Builder contract for ZIP lead routing

No Door Builder change is required. The Portal routes from rows that `POST /api/submit-door-builder` already inserts. This matches the unmerged Door Builder note in [Door-Builder-HGI-Assets PR 14](https://github.com/TrishaMinela/Door-Builder-HGI-Assets/pull/14).

## Where the lead arrives

Door Builder `api/submit-door-builder.ts` inserts with the Supabase service role:

`POST {SUPABASE_URL}/rest/v1/leads?on_conflict=submission_id`

It does not call `submit_public_lead`. The same request then forwards the allowlisted payload to Zapier. The Portal does not participate in that HTTP request.

Columns written today:

| Column | Main HGI site (`/`) | Dealer page (`/{slug}`, including `/uhr`, America's Best, and WDM) |
| --- | --- | --- |
| `submission_id` | request UUID | request UUID |
| `dealer_id` | `null` | that dealer's id |
| `source` | `door_builder` | `door_builder` |
| `zip` | 5-digit ZIP after PR 14; older rows may still be ZIP+4 | trimmed customer ZIP, which may be ZIP+4 |
| `first_name`, `last_name`, `email`, `phone` | contact form | contact form |
| `comments` | notes, or null | notes, or null |
| `status` | `new` | `new` |
| `door_configuration` | `{ schemaVersion: 1, configuration }` | same |

There is no street address, city, or state on this submission. `lead_source`, `dealer_name`, and `dealer_slug` are Zapier fields only. They are not `leads` columns. Main HGI versus a dealer page is `dealer_id`.

## What the Portal routes

A lead enters ZIP routing only when all of these are true:

- `source = 'door_builder'`
- `dealer_id is null`
- `lead_routing_settings.routing_enabled` is true

Dealer-slug leads, including `/uhr`, America's Best, and WDM, keep their existing dealer assignment and are not placed in the round-robin. The database trigger returns immediately for them and does not create a routing case.

The trigger lives in the Portal migration. Door Builder does not need a new call, column, or preview flag. While `routing_enabled` stays false, an insert from the Door Builder production site or from a Door Builder preview changes nothing in the routing tables.

## ZIP

The Portal normalizes `leads.zip` again when it routes:

- `46204` stays `46204`
- `46204-1234` and `462041234` become `46204`
- `00501` and `501` become `00501`

PR 14 already stores five digits for new main-HGI leads, including leading zeros. That normalization is compatible and optional. The Portal still accepts ZIP+4 so older main-HGI rows route if routing is later enabled. An invalid ZIP becomes an unassigned queue item. It does not pick a dealer.

## Review link

The salesperson link is `/sales/leads/{leadId}` on the Portal origin. It has no access token. The signed-in user must be the active assigned salesperson or a Home Guard admin. Anyone else, including someone who was forwarded the URL, gets an access-denied page and no customer details.

## What must not change

Do not add a column to the Door Builder insert. PostgREST rejects unknown columns and that would fail every submission. Do not call Personify, Opta, or a dealer email from the Door Builder request. Automatic Opta delivery stays off in the Portal.
