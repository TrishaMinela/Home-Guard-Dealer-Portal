# Opta credential setup for America's Best

This is the manual setup for `CRM_CREDENTIAL_ENCRYPTION_KEY` on Vercel project `home-guard-dealer-portal` (team `door-builder`). Do not commit the key, print it, or paste it into git, logs, or frontend code. This setup does not turn on Opta delivery.

## What the server requires

`api/dealer-crm-integrations.ts` reads `process.env.CRM_CREDENTIAL_ENCRYPTION_KEY` only when an authorized admin saves CRM credentials. `isCrmCredentialEncryptionConfigured` accepts the value only when `Buffer.from(value, 'base64')` is exactly 32 bytes. That is the AES-256-GCM key used by `encryptCrmCredentials` / `decryptCrmCredentials`. The stored row keeps ciphertext, IV, auth tag, and key version `1`.

A correct value is standard base64 for 32 random bytes, normally 44 characters with `=` padding. Node's base64 decoder ignores whitespace, including one trailing newline. Do not wrap the value in quotes. Do not use a `VITE_` or `NEXT_PUBLIC_` name. Those prefixes are browser-exposed, and the Vercel CLI will not store a `VITE_` variable as a Secret.

The settings API also refuses to run unless `SUPABASE_URL` points at project ref `udbcnpjtwhmjzpjjhoph` (HGI Portal Dev). Adding this key does not remove that guard and does not enable Test or Live mode.

## Generate the key

Run this from a private shell. It writes the key to a mode `600` file and does not print it.

```bash
node -e "const {writeFileSync}=require('fs'); const {randomBytes}=require('crypto'); writeFileSync('crm-credential-key.txt', randomBytes(32).toString('base64'), {mode:0o600})"
```

## Vercel CLI

Link the Dealer Portal project, then store the key as a Secret. Use the file redirect so the value is not a shell argument.

```bash
vercel link --yes --project home-guard-dealer-portal --scope door-builder
vercel env add CRM_CREDENTIAL_ENCRYPTION_KEY production --type secret < crm-credential-key.txt
vercel env add CRM_CREDENTIAL_ENCRYPTION_KEY preview --type secret < crm-credential-key.txt
vercel env add CRM_CREDENTIAL_ENCRYPTION_KEY development --type secret < crm-credential-key.txt
rm -f crm-credential-key.txt
```

`--type secret` requires Vercel CLI 59.6 or later. A non-interactive add to production, preview, or development is stored as a Secret by default. Confirm the name with `vercel env ls`. Secret values are hidden there and are not returned by `vercel env pull` for Production or Preview.

If the team policy **Separate Production Secret Values** is on, the production value must differ from preview and development. Generate a second file and use it for the non-production commands. Credentials encrypted with one key cannot be decrypted with another. Preview and development must share a key when they use the same dev database. Keep the production key for the production database only.

Changing the key later does not re-encrypt existing rows. Save credentials only after the key you intend to keep is deployed.

## Dashboard

1. Open `https://vercel.com/door-builder/home-guard-dealer-portal/settings/environment-variables`.
2. Add `CRM_CREDENTIAL_ENCRYPTION_KEY`.
3. Paste the base64 value with no quotes.
4. Set the type to Secret.
5. Select Production, Preview, and Development, subject to the separate-production-secret rule above.
6. Save, delete the local key file, and redeploy the target environment so the serverless function receives the variable.

## Check that saved Opta credentials decrypt

This command reads the America's Best Opta row and prints only true/false field flags. It does not send a lead. Vercel will not return a Secret-type `CRM_CREDENTIAL_ENCRYPTION_KEY` from `vercel env pull`. Put that key, `SUPABASE_URL` (`https://udbcnpjtwhmjzpjjhoph.supabase.co`), and `SUPABASE_SERVICE_ROLE_KEY` in a mode `600` file named `.env.opta-verify.local`, which is already gitignored. Delete the file when finished. Do not pass the values as shell arguments.

```bash
node --env-file=.env.opta-verify.local --experimental-strip-types scripts/opta-synthetic-test.ts --verify-credentials
```

Sending one test lead uses the same saved row and the same env file, plus `OPTA_SYNTHETIC_POST_ENABLED=true` in that file, and is a separate explicit command:

```bash
node --env-file=.env.opta-verify.local --experimental-strip-types scripts/opta-synthetic-test.ts --send --confirm=send-americas-best-synthetic-test
```

Do not run the send command until the endpoint and auth field are confirmed.

## Delivery dedupe, not applied

`dealer_crm_lead_deliveries` already has `unique (integration_id, lead_id)` and `unique (idempotency_key)`. Those constraints are enough to stop a second delivery row for a real lead. No migration is required for that.

A synthetic test lead is not a row in `public.leads`. The delivery table's `lead_id` is `NOT NULL` and has a composite foreign key to `leads(id, dealer_id)`, so a synthetic attempt cannot be inserted. Do not apply a migration for that unless Opta testing must be audited in this table. One possible shape, left unapplied:

```sql
-- PROPOSAL ONLY. Do not apply.
-- alter table public.dealer_crm_lead_deliveries
--   add column delivery_kind text not null default 'lead'
--   check (delivery_kind in ('lead', 'synthetic_test'));
-- alter table public.dealer_crm_lead_deliveries alter column lead_id drop not null;
-- Then allow a null lead_id only when delivery_kind = 'synthetic_test',
-- and keep one synthetic attempt per integration.
```
