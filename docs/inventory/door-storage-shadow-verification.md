# Door Storage shadow verification

Completed October 13, 2026 against **HGI Portal Dev** (`udbcnpjtwhmjzpjjhoph`). This was a read-only comparison. It did not upload, update, delete, remap, publish, or switch runtime authority.

## Scope and method

The verification used `docs/inventory/door-storage-manifest.json` with checksum:

```text
ae1c3c8d284069750cf5de896f43f0552c8bfc2e88da36318f6885bdeb1454f8
```

For every one of the 159 active manifest entries, `scripts/verifyDoorStorageShadow.mjs`:

1. Read the original file from `/Users/trishaminela/Door-Builder` without modifying it.
2. Downloaded the exact mapped object from the private DEV `door-catalog-assets` bucket.
3. Compared local, manifest, and Storage SHA-256 values and byte sizes.
4. Decoded both copies independently with macOS ImageIO.
5. Compared format, pixel width, pixel height, alpha presence, and aspect ratio.

Temporary downloaded copies and the machine-readable run report were written outside the repositories:

- `/tmp/hgi-door-storage-shadow`
- `/tmp/door-storage-shadow-verification.json`
- `/tmp/door-storage-shadow-contact-sheet.png`

## Exhaustive results

| Check | Passed | Failed |
| --- | ---: | ---: |
| Storage object resolves | 159 | 0 |
| Byte size matches | 159 | 0 |
| SHA-256 matches | 159 | 0 |
| Format matches | 159 | 0 |
| Pixel dimensions match | 159 | 0 |
| Alpha behavior matches | 159 | 0 |
| Aspect ratio matches | 159 | 0 |

The verified set totals **2,262,339 bytes** and contains 115 WebP files and 44 PNG files. Fifty-seven files contain alpha data. Dimensions range from 242–359 pixels wide and 549–792 pixels high. All local and hosted pairs decoded successfully.

Role coverage remained consistent with the manifest: 42 thumbnail uses, 131 render uses, and 28 mask uses. Role counts overlap where the same physical thumbnail is intentionally used as a render fallback.

## Representative visual review

A side-by-side contact sheet compared ten local/Storage pairs. Pixel-level comparison for every displayed pair was exact, and visual inspection found no corruption, cropping, substitution, or layout difference.

The visual set covered:

- a thumbnail reused as a render fallback (`2PHD`)
- Signature Series no-glass Cherry artwork (`2PNGSS`)
- Signature Series Full Lite glass artwork in Cherry
- Paintable/Stainable and Smooth Steel no-glass artwork (`F1`)
- Brushed Smooth Fiberglass glass artwork (`5LT`)
- Textured Fiberglass glass artwork (`F48`)
- a 3/4-lite opening mask (`F48`)
- a highly reused dedicated Full Lite Smooth render
- a single-door no-glass render (`E1`)
- the shared Full Lite slab used by configurations that may participate in French/Savannah composition

French and Savannah behavior does not have a separate active door-file class in this manifest. Leaf composition, handing, and active-leaf transforms remain procedural/runtime behavior; the underlying shared door artwork was verified, but those runtime transforms were not changed or reimplemented here.

## Mapping correctness and safety

The manifest asset ID, local path, mapped Storage object path, checksum, door-style context, material/series context, grain/surface context, and role were retained for each comparison. Because all hosted objects are byte-identical to their named local sources, no mapping points to different image content.

The catalog remains DRAFT. `assets.current_path` remains the runtime/source reference. The customer Door Builder remains hardcoded/local and was not modified. Production was not accessed.

## Conclusion and next step

The 159 hosted door assets are safe for a future controlled shadow-loading phase. This result validates asset parity only; it does not authorize publication or a customer runtime switch.

The recommended next step is to add a DEV-only runtime resolver behind an explicit shadow/feature flag, load both local and hosted sources for selected configurations, and compare complete rendered-door output—including French/Savannah composition—while continuing to display the existing local result to customers.
