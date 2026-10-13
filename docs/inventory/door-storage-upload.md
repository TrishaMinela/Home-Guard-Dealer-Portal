# Door catalog Storage foundation and upload plan

Prepared for **HGI Portal Dev only** (`udbcnpjtwhmjzpjjhoph`). This step prepares—but does not apply—the Storage migration and runs the uploader in dry-run mode only. The catalog revision remains DRAFT.

## Bucket and read model

The pending migration `20261013000000_create_door_catalog_asset_storage.sql` creates a **private** `door-catalog-assets` bucket with:

- 10 MiB maximum object size
- PNG, JPEG, and WebP MIME types only
- revision-scoped object names from the verified manifest

Private is intentional. A public bucket would make staged DRAFT assets readable to anyone who learns an object URL. Instead, an anonymous or authenticated customer client may select/download an object only when its path names a `catalog_revisions` row whose status is `published`. The future customer Door Builder can use the normal publishable key for those reads; it never needs an admin session or service-role credential.

The read policy uses a fixed-`search_path`, `SECURITY DEFINER` boolean helper. This is necessary because catalog rows themselves remain Home Guard admin-only under RLS. The helper reveals only whether a supplied revision ID is published; it does not expose revision data or grant catalog-table access.

Authenticated Home Guard admins may select, insert, update, and delete bucket objects through RLS. Anonymous users have no write policy. The server-only service-role key is used only by the explicit local upload command and is never shipped to browser code.

## Active upload set

The uploader consumes only `docs/inventory/door-storage-manifest.json` and requires its verified SHA-256:

```text
ae1c3c8d284069750cf5de896f43f0552c8bfc2e88da36318f6885bdeb1454f8
```

The active set is exactly 159 `ready` bound files totaling **2,262,339 bytes**. The two `review` overlays and eight `unbound` Preview Slabs are excluded.

## Dry run

The default mode is dry-run and does not require Supabase credentials or network access:

```bash
node scripts/uploadDoorStorageManifest.mjs \
  --source-root /Users/trishaminela/Door-Builder
```

It verifies the overall manifest checksum, DEV project scope, DRAFT revision, source existence, byte sizes, per-file SHA-256 values, bucket names, statuses, and destination uniqueness. It then prints every planned object in the optional JSON report:

```bash
node scripts/uploadDoorStorageManifest.mjs \
  --source-root /Users/trishaminela/Door-Builder \
  --report /tmp/door-storage-dry-run.json
```

## Future real DEV upload

Only after the pending Storage migration has been reviewed and applied to HGI Portal Dev, load the server-only DEV environment variables in the shell and run:

```bash
node scripts/uploadDoorStorageManifest.mjs \
  --upload \
  --project-ref udbcnpjtwhmjzpjjhoph \
  --source-root /Users/trishaminela/Door-Builder \
  --report /tmp/door-storage-upload.json
```

Upload mode refuses any project reference or Supabase URL other than `udbcnpjtwhmjzpjjhoph`. It verifies that the manifest revision is still DRAFT before writing.

## Rerun, rollback, and verification behavior

- Uploads use `upsert: false`; an existing object is never silently overwritten.
- An existing object with the expected size and checksum is skipped as already complete.
- An existing object with different content stops the run as a conflict.
- Every newly uploaded object is downloaded immediately and checked against the manifest SHA-256 and size.
- A partial run is safe to rerun because verified objects are skipped.
- The script does not update `assets.current_path`, catalog bindings, or any database record.
- Because object paths are revision-scoped, rollback is removal of only that revision prefix after an independently reviewed object list. No automated delete command is included.

After upload, the offline verifier can also compare a downloaded bucket tree against the same source and manifest:

```bash
node scripts/verifyDoorStorageManifest.mjs \
  --source-root /Users/trishaminela/Door-Builder \
  --storage-root /path/to/downloaded/door-catalog-assets
```

Catalog publication, database path updates, customer runtime changes, reviewed-overlay approval, and unbound-file activation remain separate future steps.

## Step 4B DEV upload result

Completed October 13, 2026 against HGI Portal Dev (`udbcnpjtwhmjzpjjhoph`) using manifest checksum `ae1c3c8d284069750cf5de896f43f0552c8bfc2e88da36318f6885bdeb1454f8`.

| Check | First pass | Idempotency rerun |
| --- | ---: | ---: |
| Scheduled and checksum-verified | 159 | 159 |
| Uploaded | 159 | 0 |
| Existing identical objects skipped | 0 | 159 |
| Conflicts / failures | 0 | 0 |
| Scheduled bytes | 2,262,339 | 2,262,339 |

Final live verification found exactly **159 objects** totaling **2,262,339 bytes** in `door-catalog-assets`. Because the rerun successfully downloaded and checksum-matched every expected object, and the bucket contains exactly the same number of objects, there are no missing or unexpected objects.

The two review-status overlays and eight unbound Preview Slabs remain excluded. The catalog remains DRAFT. The `assets` table still contains 919 rows, and its ordered `id:current_path` checksum remains `1de2ff818ea10dbc703687ecd4ebbbed`, confirming that no database asset reference changed.

The uploader reports are retained outside the repository at `/tmp/door-storage-upload.json` and `/tmp/door-storage-upload-rerun.json`. No service-role credential was written to either report or project files.
