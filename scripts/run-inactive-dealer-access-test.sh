#!/usr/bin/env bash
# Builds a throwaway database and runs the inactive-dealer access proof.
# Never point this at the live Supabase project.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
db_name="inactive_dealer_access_test"
log="/tmp/${db_name}.log"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is not installed. Install PostgreSQL locally before running this isolated test." >&2
  exit 1
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 -c "drop database if exists ${db_name} with (force);" >/dev/null
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "create database ${db_name};" >/dev/null

sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$db_name" \
  -f "$root/supabase/tests/inactive_dealer_access_fixture.sql" \
  -f "$root/supabase/tests/inactive_dealer_access.test.sql" \
  >"$log"

sudo -u postgres psql -d "$db_name" -c "select name from test_results order by name;"
echo "Isolated inactive-dealer access test passed. Log: $log"
