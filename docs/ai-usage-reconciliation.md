# OpenAI usage reconciliation: October 5–22, 2026

## Scope

This reconciliation covers the HGI Door Builder OpenAI project `proj_haRRNxvf4CVwa2jHugJ762SM` from `2026-10-05T00:00:00Z` through `2026-10-23T00:00:00Z` exclusive.

The official source exports are:

- `activity_2026-10-05_2026-10-22.csv`
- `cost_2026-10-05_2026-10-22.csv`

The importer is locked to HGI Portal Dev project `udbcnpjtwhmjzpjjhoph`. It verifies both source-file checksums, the OpenAI project ID, the Supabase project reference, expected request totals, and exact daily agreement between activity-derived costs and the Cost export.

## Accounting model

Individual request telemetry remains authoritative for request details. Official provider exports are stored in separate daily aggregate tables:

- `ai_provider_activity_daily`: request and token aggregates by UTC date and model
- `ai_provider_cost_daily`: provider-billed actual cost by UTC date

The two cost measures are deliberately separate:

- `actual_cost_usd` is imported from the official OpenAI Cost export.
- `calculated_estimated_cost_usd` is calculated from exported token quantities and the reconciliation pricing schedule.

Historical request totals use the provider aggregate as the control total for a covered UTC date and model. The unmatched historical component is `max(provider request count - recorded request rows, 0)`. This lets request-level telemetry and aggregate history coexist without counting the overlap twice.

## Dry run

```sh
node scripts/reconcileAiUsageHistory.mjs \
  --dry-run \
  --project-ref udbcnpjtwhmjzpjjhoph \
  --activity /Users/trishaminela/Downloads/activity_2026-10-05_2026-10-22.csv \
  --cost /Users/trishaminela/Downloads/cost_2026-10-05_2026-10-22.csv \
  --report /tmp/hgi-ai-usage-reconciliation-dry-run.json
```

Dry-run mode reads existing Supabase telemetry but performs no database writes.

## Applied DEV reconciliation

The migration and approved exports were applied to HGI Portal Dev on October 23, 2026. Verification confirmed:

- 23 activity aggregate rows representing 300 provider requests
- 18 daily provider cost rows totaling `$16.4147404500`
- 82 existing request-level rows preserved unchanged
- 218 recovered historical aggregate requests
- zero duplicate rows when the importer was rerun in verification mode

The apply mode uses natural unique keys and source-row SHA-256 values. A second identical import cannot create duplicate daily activity or cost rows. Conflicting source data must be investigated rather than overwriting the official record.

## Dashboard reporting plan

The Admin AI Usage page should report these measures independently:

- Actual provider cost: sum of `ai_provider_cost_daily.actual_cost_usd`
- Internal estimated cost: sum of request-level `estimated_cost_usd`
- Recorded request count: request-level generation and entrance telemetry rows
- Historical aggregate request count: provider count not represented by request-level rows
- Reconciled request count: recorded rows plus only the unmatched historical aggregate
- Reconciliation coverage: recorded request count divided by the provider activity count for covered buckets

The dashboard must not derive success rates, failed attempts, environment splits, workflow counts, or latency from aggregate history because the official exports do not contain those fields.
