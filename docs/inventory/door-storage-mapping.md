# Door asset Storage reference mapping

Completed October 13, 2026 against **HGI Portal Dev** (`udbcnpjtwhmjzpjjhoph`) using verified manifest checksum `ae1c3c8d284069750cf5de896f43f0552c8bfc2e88da36318f6885bdeb1454f8`.

## Schema decision

The existing `assets` table already preserves the original runtime/source path in `current_path`, along with revision, MIME type, byte size, checksum, content version, provenance, and source metadata. Asset roles and door style/variant relationships remain in `door_variant_assets`.

Migration `20261013000100_map_door_assets_to_storage.sql` adds only:

- `storage_bucket text null`
- `storage_object_path text null`
- a constraint requiring both Storage fields to be null or both populated
- a partial unique index preventing two asset rows from claiming the same hosted object

No `current_path`, role, variant binding, checksum, or provenance value is replaced.

## Mapping safeguards

The migration embeds the exact 159 manifest mappings and aborts transactionally unless:

- all 159 asset IDs, original paths, checksums, and byte sizes match DEV
- every target object exists in `door-catalog-assets`
- every target object's stored size matches the manifest
- no asset is already ambiguously mapped
- the catalog revision remains DRAFT

The migration was first checked with `supabase db push --dry-run`, then executed inside an explicit rollback transaction, and only then applied to DEV.

## Applied result

| Verification | Result |
| --- | ---: |
| Active bound assets | 159 |
| Active bound assets with Storage references | 159 |
| Active bound assets missing Storage references | 0 |
| Original paths preserved | 159 |
| Unrelated assets mapped | 0 |
| Duplicate Storage references | 0 |
| Storage objects without asset mappings | 0 |
| Missing or size-mismatched objects | 0 |
| Review overlays mapped | 0 |
| Unbound Preview Slab asset records created | 0 |
| Bucket objects | 159 |
| Bucket bytes | 2,262,339 |

A dedicated read-only verifier downloaded and SHA-256 checked all 159 hosted objects after mapping. All 159 passed against the manifest. The catalog remains DRAFT and the customer Door Builder continues using its existing hardcoded/local runtime paths.

## Rollback plan

If the reference mapping must be reverted before any runtime switch, clear `storage_bucket` and `storage_object_path` only for the 159 manifest asset IDs. The uploaded objects and original `current_path` values do not need to change. Schema removal, if ever desired, should be handled by a new forward migration rather than editing applied history.

## Next recommended step

Perform read-only shadow resolution in the Portal: resolve each mapped asset through Supabase Storage alongside its preserved local path, compare representative thumbnails/renders/masks visually, and record parity without changing customer runtime authority or publishing the catalog.
