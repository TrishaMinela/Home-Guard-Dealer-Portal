# AI Workflow Historical Correction Audit

- Target: HGI Portal Dev (`udbcnpjtwhmjzpjjhoph`)
- Prepared SQL: `scripts/database-corrections/link-confirmed-ai-workflow-3b840aa7.sql`
- Before snapshot captured: `2026-10-23T13:43:42.149Z`
- Transaction applied: `2026-10-23T13:43:50.1213Z`
- After snapshot captured: `2026-10-23T13:44:06.575Z`
- Result: committed successfully; all guards and postconditions passed

## Corrected records

Workflow `3b840aa7-5957-49d3-bd69-507114cdef51`:

| Field | Before | After |
| --- | --- | --- |
| `status` | `started` | `succeeded` |
| `completed_at` | `NULL` | `2026-10-22T17:40:30.702+00:00` |
| `duration_ms` | `NULL` | `54586` |
| `generation_request_id` | `NULL` | `1ca8ac6c-ea6a-48cf-b3cb-281ad6980c1d` |
| `generation_provider_request_id` | `NULL` | `req_25fb671f088c4e87bc7d82983f5f5f0e` |
| `estimated_total_cost_usd` | `0.002366` | `0.129448` |
| `updated_at` | `2026-10-22T17:39:39.003066+00:00` | `2026-10-23T13:43:50.1213+00:00` |

Generation request `1ca8ac6c-ea6a-48cf-b3cb-281ad6980c1d`:

| Field | Before | After |
| --- | --- | --- |
| `workflow_request_id` | `NULL` | `3b840aa7-5957-49d3-bd69-507114cdef51` |

All other generation fields remained unchanged.

## Protected record

Workflow `e1128029-beae-42af-90da-5a94db0b3f7b` remained unchanged:

- `status = started`
- `generation_request_id = NULL`
- `updated_at = 2026-10-22T17:33:08.585328+00:00`

## Dashboard summary

| Metric | Before | After |
| --- | ---: | ---: |
| Attempts | 12 | 12 |
| Successful | 4 | 5 |
| Failed | 6 | 6 |
| Unfinished | 2 | 1 |
| Completed-workflow success rate | 40.0% | 45.45% |

## Unchanged usage and reconciliation totals

- Generation usage rows: 68
- Entrance-analysis usage rows: 105
- Generation tokens: 589,462
- Entrance-analysis tokens: 202,809
- Generation estimated request cost: `$7.850550`
- Entrance-analysis estimated request cost: `$0.249411`
- Reconciled provider requests: 300
- Provider tokens: 1,597,236
- Actual provider cost: `$16.41474045`

No reconciliation rows, inventory records, customer behavior, or unrelated workflow records were changed.
