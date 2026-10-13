# Door Storage migration manifest

Prepared October 13, 2026 for **HGI Portal Dev only** (`udbcnpjtwhmjzpjjhoph`). The target catalog revision is `1af5506c-c723-5d6d-a341-93815d0205e2`, remains **draft**, and records Door Builder source commit `e06efe7ea936e20a38fa85c674c2e73697f67dc7`.

No Storage bucket was created. No upload, database write, path replacement, relationship change, publication, Production access, or customer Door Builder modification occurred.

## Files

- Machine-readable manifest: `docs/inventory/door-storage-manifest.json`
- Offline verification: `scripts/verifyDoorStorageManifest.mjs`
- Step 1 source architecture and per-style audit: `docs/inventory/door-asset-migration.md`

## Manifest totals

| Group | Files | Bytes | Status |
| --- | ---: | ---: | --- |
| Bound physical files | 159 | 2,262,339 | `ready` |
| Reviewed runtime overlays | 2 | 9,602 | `review` |
| Unbound Preview Slabs | 8 | 225,484 | `unbound`, excluded |
| Bound files plus overlays if approved | 161 | 2,271,941 | Estimated upload set |

Role counts overlap intentionally because every selection thumbnail is also retained as a final render fallback:

- 42 files have `thumbnail` use.
- 131 files have `render` use: 89 dedicated slab renders plus 42 thumbnail fallbacks.
- 28 files have `mask` use.
- 2 separate review entries have `overlay` use.

The 874 `door_variant_assets` rows normalize to 159 physical source files. The manifest creates one object path per physical file and preserves every database asset ID, binding ID, variant ID, style, material, series, grain/surface, and opening-code context. Intentional reuse is represented by `reused` and `reuseCount`; it does not create duplicate uploads.

## Deterministic object paths

The future bucket is `door-catalog-assets`. Object paths include the draft revision ID, typed scope, content version, the first 12 characters of the SHA-256 digest, and a normalized filename.

```text
revisions/[catalog-revision-id]/
  styles/[door-style-code]/
    thumbnails/v[content-version]/[checksum-prefix]-[filename]
    renders/[source-surface]/v[content-version]/[checksum-prefix]-[filename]
  openings/[opening-code-or-shared]/
    masks/v[content-version]/[checksum-prefix]-[filename]
    overlays/v[content-version]/[checksum-prefix]-[filename]
```

Assets with both thumbnail and render-fallback roles receive one thumbnail object path. Their render bindings can later reference the same uploaded object. Shared masks receive one object under the opening scope. There are no duplicate proposed object paths.

## Checksums

Every bound, overlay, and unbound-review entry contains:

- source-relative filename
- exact byte size
- source SHA-256
- imported database asset ID and checksum where applicable
- deterministic proposed object path where applicable

Overall manifest SHA-256:

```text
ae1c3c8d284069750cf5de896f43f0552c8bfc2e88da36318f6885bdeb1454f8
```

The overall checksum is calculated from canonical JSON excluding only `manifestChecksum` and `manifestChecksumAlgorithm`. Any content or mapping change alters the checksum.

Run the offline source verification:

```bash
node scripts/verifyDoorStorageManifest.mjs \
  --source-root /Users/trishaminela/Door-Builder
```

After a future upload, download the bucket/object tree into a temporary directory preserving the manifest object paths and run:

```bash
node scripts/verifyDoorStorageManifest.mjs \
  --source-root /Users/trishaminela/Door-Builder \
  --storage-root /path/to/downloaded/door-catalog-assets
```

That comparison verifies manifest integrity, local source bytes, imported database checksums, unique object paths, and downloaded Storage object bytes. It does not require or expose a service-role key.

## Reviewed overlays

The following source files are represented separately with `migrationStatus: review` because current runtime helpers reference them but `door_variant_assets` does not:

- `/assets/hgi-assets/Glass/RETRO/5LTCLE.webp` — `5LT`
- `/assets/hgi-assets/Glass/RETRO/F764CLE.webp` — `F764`

They are not silently treated as active door bindings. Approval should decide whether they move with door opening overlays or the later glass asset migration.

## Unbound Preview Slabs

These eight files are documented in `unboundReview`, have `activeUploadCandidate: false`, receive no Storage object path, and are excluded from the estimated active upload set.

| File | Likely relationship | Assessment |
| --- | --- | --- |
| `Cherry/Half Lite - Smooth.webp` | S / Cherry-Smooth alternate | Folder and surface name disagree. Current Cherry and Smooth S mappings use other files. No byte-identical duplicate. |
| `Oak/Full Lite - Mahogany.webp` | F / Oak-Mahogany alternate | Folder and grain name disagree. Current Oak F uses `Full Lite - Oak.webp`. Likely obsolete or mislabeled. |
| `Smooth/3_4 Lite - Smooth.webp` | F48 | Current F48 and F482 use more specific files. Potential alternate geometry. |
| `Smooth/Craftsman 1_4 Rectangle - Smooth.webp` | CR14 | Current CR14 uses `Craftsman 14 Rectangle - Smooth.webp`. Likely naming or geometry alternate. |
| `Smooth/Half Round Top - Smooth.webp` | HRT | Current HRT uses `Half Round Top Glass - Smooth.webp`. Likely older alternate. |
| `Textured/Half Arch Top - Textured.webp` | SAT | Current SAT uses `SAT - Textured.webp`. Potential descriptive-name predecessor. |
| `Textured/Half Round Top - Textured.webp` | HRT | Current HRT uses `Half Round Top Glass - Textured.webp`. Potential older alternate. |
| `Textured/Two 8_ x 48_ Lites, 3_4 Lite - Textured.webp` | F848 | Current F848 uses `34 Lite - Textured.webp`. Potential more specific alternate. |

None is byte-identical to another Preview Slab file, so visual/product review—not hash deduplication—is required.

## Step 3 Storage preparation

The pending DEV-only Storage migration, security model, manifest-driven uploader, dry-run and later upload commands are documented in `docs/inventory/door-storage-upload.md`. The Step 3 dry run schedules only the 159 bound `ready` files. Overlay approval, unbound-file activation, database path updates, publication, and customer runtime changes remain out of scope.
