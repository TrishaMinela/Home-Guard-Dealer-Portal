# Door asset migration audit

Verified October 13, 2026 against HGI Portal Dev (`udbcnpjtwhmjzpjjhoph`) and the read-only customer Door Builder repository at current HEAD `21e491d28aacf003917f5a40ef239cd92f93b618`. The DEV revision records source commit `e06efe7ea936e20a38fa85c674c2e73697f67dc7`; Git comparison confirmed that the door thumbnail, slab-render, and mask maps and their referenced door asset directories have not changed between that source commit and current HEAD. The catalog revision `1af5506c-c723-5d6d-a341-93815d0205e2` remains **draft**. No Storage upload, catalog write, publication, runtime change, or customer-repository change was made.

## Executive summary

- **42** distinct door styles and **127** material/line/grain variants are present.
- **127/127 variants** have a selection-thumbnail binding.
- **127/127 variants** have at least one slab-render candidate.
- **42** distinct selection-thumbnail paths are used; the source thumbnail directory contains 43 files because the catalog also retains separate code aliases and one shared image mapping.
- **131** distinct slab-render candidate paths are bound: **89** dedicated Preview Slab files plus **42** selection thumbnails used intentionally as last-resort render fallbacks.
- **28** distinct mask files cover **95** glass-bearing variants. Masks are supplemental renderer assets and are not required for no-glass variants.
- Across thumbnail, slab-render and mask roles there are **159 distinct bound files**. Every bound path exists in the customer repository and has imported checksum/metadata.
- The runtime also declares two door-specific clear-glass overlay helpers for `5LT` and `F764`. These remain renderer/glass assets and are not selection thumbnails.
- **30** styles span both Steel and Fiberglass; **36** styles span multiple series. All 42 styles have more than one render candidate because material/grain-specific art and deterministic fallbacks are preserved.

## Asset roles and migration intent

| Purpose | Current source | Distinct bound paths | Future action |
| --- | --- | ---: | --- |
| Selection thumbnails | `/public/assets/doors/` | 42 | Upload as style-card media; retain stable style/code association. |
| Dedicated slab renders | `/public/assets/hgi-assets/Preview Slabs/` | 89 | Upload with material/series/grain context from `door_variant_assets`. |
| Thumbnail render fallbacks | Same thumbnail files | 42 | Reuse the same stored object; do not duplicate bytes. |
| Glass/opening masks | Current HGI mask directories | 28 | Upload as typed mask assets keyed by opening/view context. |
| Door-specific clear overlays | Glass renderer assets for `5LT` and `F764` | 2 runtime declarations | Keep with glass/overlay media and preserve renderer lookup behavior. |

The database currently contains **874 door-variant asset bindings**. Multiple bindings intentionally reuse the same asset across material/series variants. Storage migration must preserve binding context rather than creating one file per database row.

## Missing and review items

- No active imported door style or variant is missing its required thumbnail or slab-render mapping.
- No bound door asset path is missing from the current customer repository.
- Eight files exist in the Preview Slabs directory but are not selected by the current deterministic runtime/import bindings. Do not upload them as active catalog media until HGI confirms whether they are alternates, superseded files, or filename duplicates:
  - `Cherry/Half Lite - Smooth.webp`
  - `Oak/Full Lite - Mahogany.webp`
  - `Smooth/3_4 Lite - Smooth.webp`
  - `Smooth/Craftsman 1_4 Rectangle - Smooth.webp`
  - `Smooth/Half Round Top - Smooth.webp`
  - `Textured/Half Arch Top - Textured.webp`
  - `Textured/Half Round Top - Textured.webp`
  - `Textured/Two 8_ x 48_ Lites, 3_4 Lite - Textured.webp`
- Some filenames describe a different source texture than their containing folder, notably Oak mappings that deliberately reuse Mahogany artwork. These are current runtime facts, not corrected guesses; HGI should approve any future replacement artwork.
- `3PNG`/`3PNGSS` and `S1`/`S1NGSS` code aliases reuse physical artwork intentionally. Preserve aliases as catalog relationships, not copied files.

## Procedural behavior that should remain code

Do not upload or model these as additional products/assets:

- finish/color tinting and stain/paint application
- candidate priority and fallback selection
- glass/frame compositing geometry
- handing, swing, French/Savannah leaf behavior, and active-leaf transforms
- responsive preview layout and PDF rendering geometry
- warnings and fallback behavior for unavailable media

Only source raster/vector files should move to Storage later. Existing algorithms should continue consuming typed asset URLs.

## Proposed Supabase Storage structure

Use a private administrative source bucket initially, exposed later only through a reviewed customer-safe delivery path. Preserve revision/content versioning and avoid filename identity as the database key.

```text
door-catalog-assets/
  revisions/[catalog-revision-id]/
    styles/[door-style-code]/
      thumbnails/[content-version]/[filename]
      renders/[material-or-series]/[grain-or-surface]/[content-version]/[filename]
    openings/[opening-code]/
      masks/[content-version]/[filename]
      overlays/[content-version]/[filename]
```

The existing `assets` rows and typed `door_variant_assets` bindings should remain authoritative. A later migration should add a hosted object path/version without overwriting `current_path` until upload checksums, previews, and shadow rendering all pass.

## Per-style asset map

Each list below is deduplicated. “Render fallbacks” are selection thumbnails intentionally included at the end of the runtime candidate chain; they are not substitutes for the dedicated material-specific render files.

### 2PHD — 2PHD - 2P HD FLAT TOP

- Selection thumbnail: `/assets/doors/2PHD.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/2P HD Flat Top - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/2P HD Flat Top - Textured.webp`
- Render fallbacks: `/assets/doors/2PHD.webp`
- Masks: —

### 2PNGSS — 2PNGSS - 2 PANEL NO GLASS

- Selection thumbnail: `/assets/doors/2PNGSS.png`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Cherry/2 Panel No Glass - Textured.webp`
- Render fallbacks: `/assets/doors/2PNGSS.png`
- Masks: —

### 2PPLSS — 2PPLSS - 2 PANEL PLANK NO GLASS

- Selection thumbnail: `/assets/doors/2PPLSS.png`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Cherry/2 Panel Plank No Glass - Cherry.webp`
- Render fallbacks: `/assets/doors/2PPLSS.png`
- Masks: —

### 3LT — 3LT - STACKED 3 LITE

- Selection thumbnail: `/assets/doors/3LT.png`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Stacked 3 Lite - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/3LT - Textured.webp`
- Render fallbacks: `/assets/doors/3LT.png`
- Masks: `/assets/masks/3LT.png`

### 3PNG — 3PNG - 3 PANEL NO GLASS

- Selection thumbnail: `/assets/doors/3PNG.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Mahogany/3 Panel No Glass - Mahogany.webp`<br>`/assets/hgi-assets/Preview Slabs/Smooth/3 Panel No Glass - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/3 Panel No Glass - Textured.webp`
- Render fallbacks: `/assets/doors/3PNG.webp`
- Masks: —

### 3STEP — 3STEP - THREE LITE STEPPING DOWN FROM LOCK SIDE

- Selection thumbnail: `/assets/doors/3STEP.png`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Three Lite Stepping Down From Lock Side - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/3STEP - Textured.webp`
- Render fallbacks: `/assets/doors/3STEP.png`
- Masks: `/assets/masks/3STEP.png`

### 4LT — 4LT - STACKED 4 LITE

- Selection thumbnail: `/assets/doors/4LT.png`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Stacked 4 Lite - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/4LT - Textured.webp`
- Render fallbacks: `/assets/doors/4LT.png`
- Masks: `/assets/masks/4LT.png`

### 5LT — 5LT - FIVE LITE STACK

- Selection thumbnail: `/assets/doors/5LT.png`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Five Lite Stack - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/5LT - Textured.webp`
- Render fallbacks: `/assets/doors/5LT.png`
- Masks: `/assets/masks/5LT.png`

### CA — CA - FIBERGLASS CENTER ARCH 8 PANEL

- Selection thumbnail: `/assets/doors/CA.png`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Cherry/Fiberglass Center Arch 8 Panel - Cherry.webp`
- Render fallbacks: `/assets/doors/CA.png`
- Masks: `/assets/masks/CA.png`

### CANGSS — CANGSS - CENTER ARCH NO GLASS

- Selection thumbnail: `/assets/doors/CANGSS.png`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Cherry/Center Arch No Glass - Cherry.webp`
- Render fallbacks: `/assets/doors/CANGSS.png`
- Masks: —

### CR14 — CR14 - CRAFTSMAN 1/4 RECTANGLE

- Selection thumbnail: `/assets/doors/CR14.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Fir/CR14 - Fir.webp`<br>`/assets/hgi-assets/Preview Slabs/Smooth/Craftsman 14 Rectangle - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/CR14 - Textured.webp`
- Render fallbacks: `/assets/doors/CR14.webp`
- Masks: `/assets/masks/CR14.png`

### CR14PL — CR14PL - CRAFTSMAN 1/4 COTTAGE

- Selection thumbnail: `/assets/doors/CR14PL.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/CR14PL - Smooth.webp`
- Render fallbacks: `/assets/doors/CR14PL.webp`
- Masks: `/assets/masks/CR14PL.png`

### E1 — E1 - EIGHT PANEL NO GLASS

- Selection thumbnail: `/assets/doors/E1.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Eight Panel No Glass - Smooth.webp`
- Render fallbacks: `/assets/doors/E1.webp`
- Masks: —

### F — F - FULL LITE

- Selection thumbnail: `/assets/doors/FULL LITE.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Cherry/Full Lite - Cherry.webp`<br>`/assets/hgi-assets/Preview Slabs/Fir/Full Lite - Fir.webp`<br>`/assets/hgi-assets/Preview Slabs/Mahogany/Full Lite - Mahogany.webp`<br>`/assets/hgi-assets/Preview Slabs/Oak/Full Lite - Oak.webp`<br>`/assets/hgi-assets/Preview Slabs/Smooth/Full Lite - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/Full Lite - Textured.webp`
- Render fallbacks: `/assets/doors/FULL LITE.webp`
- Masks: `/assets/masks/F.png`

### F1 — F1 - FLUSH NO GLASS

- Selection thumbnail: `/assets/doors/F1.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Flush No Glass - Smooth.webp`
- Render fallbacks: `/assets/doors/F1.webp`
- Masks: —

### F2 — F2 - DIAMOND

- Selection thumbnail: `/assets/doors/F2.png`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Diamond - Smooth.webp`
- Render fallbacks: `/assets/doors/F2.png`
- Masks: `/assets/masks/F2.png`

### F3 — F3 - SQUARE

- Selection thumbnail: `/assets/doors/F3.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Square - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/F3 - Textured.webp`
- Render fallbacks: `/assets/doors/F3.webp`
- Masks: `/assets/masks/F3.png`

### F4 — F4 - THREE LITES STEPPING UP FROM LOCK SIDE

- Selection thumbnail: `/assets/doors/F4.png`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Three Lites Stepping Up From Lock Side - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/Three Lite Stepping Down From Lock Side - Textured.webp`
- Render fallbacks: `/assets/doors/F4.png`
- Masks: `/assets/masks/F4.png`

### F48 — F48 - 3/4 LITE

- Selection thumbnail: `/assets/doors/F48.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Mahogany/3_4 Lite - Mahogany.webp`<br>`/assets/hgi-assets/Preview Slabs/Oak/3_4 Lite - Mahogany.webp`<br>`/assets/hgi-assets/Preview Slabs/Smooth/34 Lite - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/3_4 Lite - Textured.webp`
- Render fallbacks: `/assets/doors/F48.webp`
- Masks: `/assets/masks/F48.png`

### F482 — F482 - 3/4 LITE 2 PANEL

- Selection thumbnail: `/assets/doors/F482.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Cherry/3_4 Lite 2 Panel - Cherry.webp`<br>`/assets/hgi-assets/Preview Slabs/Smooth/3_4 Lite 2 Panel - Smooth.webp`
- Render fallbacks: `/assets/doors/F482.webp`
- Masks: `/assets/masks/F482.png`

### F764 — F764 - FULL TWIN LITE

- Selection thumbnail: `/assets/doors/F764.png`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Full Twin Lite - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/Full Twin Lite - Textured.webp`
- Render fallbacks: `/assets/doors/F764.png`
- Masks: `/assets/masks/F764.png`

### F848 — F848 - TWO 8" X 48" LITES (3/4 LITE)

- Selection thumbnail: `/assets/doors/F848.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Two 8_ x 48_ Lites, 3_4 Lite - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/34 Lite - Textured.webp`
- Render fallbacks: `/assets/doors/F848.webp`
- Masks: `/assets/masks/F848.png`

### FO — FO - FULL OVAL

- Selection thumbnail: `/assets/doors/FO.png`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Full Oval - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/FO - Textured.webp`
- Render fallbacks: `/assets/doors/FO.png`
- Masks: `/assets/masks/FO.png`

### FRT — FRT - FULL ROUND TOP GLASS CUT OUT

- Selection thumbnail: `/assets/doors/FRT.png`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Full Round Top - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/FRT - Textured.webp`
- Render fallbacks: `/assets/doors/FRT.png`
- Masks: `/assets/masks/FRT.png`

### HDAT1 — HDAT1 - HD ARCH TOP

- Selection thumbnail: `/assets/doors/HDAT.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/HD Arch Top - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/HD Arch Top - Textured.webp`
- Render fallbacks: `/assets/doors/HDAT.webp`
- Masks: —

### HRT — HRT - HALF ROUND TOP GLASS CUT OUT

- Selection thumbnail: `/assets/doors/HRT.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Half Round Top Glass - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/Half Round Top Glass - Textured.webp`
- Render fallbacks: `/assets/doors/HRT.webp`
- Masks: `/assets/masks/HRT.png`

### N — N - N PANEL

- Selection thumbnail: `/assets/doors/N.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/N Panel - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/N Panel - Textured.webp`
- Render fallbacks: `/assets/doors/N.webp`
- Masks: `/assets/masks/N.png`

### N1 — N1 - NINE PANEL NO GLASS

- Selection thumbnail: `/assets/doors/N1.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Nine Panel No Glass - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/Nine Panel - Textured.webp`
- Render fallbacks: `/assets/doors/N1.webp`
- Masks: —

### QA — QA - 648 QUARTER HEIGHT EYE BROW

- Selection thumbnail: `/assets/doors/QA.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/648 Quarter Height Eye Brow - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/648 Quarter Height Eye Brow - Textured.webp`
- Render fallbacks: `/assets/doors/QA.webp`
- Masks: `/assets/masks/QA.png`

### S — S - HALF LITE

- Selection thumbnail: `/assets/doors/S.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Cherry/Half Lite - Cherry.webp`<br>`/assets/hgi-assets/Preview Slabs/Mahogany/Half Lite - Mahogany.webp`<br>`/assets/hgi-assets/Preview Slabs/Oak/Half Lite - Oak.webp`<br>`/assets/hgi-assets/Preview Slabs/Smooth/Half Lite - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/S - Textured.webp`
- Render fallbacks: `/assets/doors/S.webp`
- Masks: `/assets/masks/S.png`

### S1NGSS — S1 - SIX PANEL NO GLASS

- Selection thumbnail: `/assets/doors/S1NGSS.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Cherry/S1 6-Panel No Glass - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Mahogany/S1 6-Panel No Glass - Mahogany.webp`<br>`/assets/hgi-assets/Preview Slabs/Oak/S1 6-Panel No Glass - Mahogany.webp`<br>`/assets/hgi-assets/Preview Slabs/Smooth/S1 6-Panel No Glass - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/S1 6-Panel No Glass - Textured.webp`
- Render fallbacks: `/assets/doors/S1NGSS.webp`
- Masks: —

### S2 — S2 - TWO LIGHTS TOP OF 6 PANEL DOOR

- Selection thumbnail: `/assets/doors/S2.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Two Lights Top of 6 Panel Door - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/Two Lights Top of 6 Panel Door - Textured.webp`
- Render fallbacks: `/assets/doors/S2.webp`
- Masks: `/assets/masks/S2.png`

### S3 — S3 - FOUR LITE RECTANGLE

- Selection thumbnail: `/assets/doors/S3.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Four Lite Rectangle - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/Four Lite Rectangle - Textured.webp`
- Render fallbacks: `/assets/doors/S3.webp`
- Masks: `/assets/masks/S3.png`

### S4 — S4 - FOUR LITES TOGETHER EACH WITH AN ARCH AT TOP

- Selection thumbnail: `/assets/doors/S4.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Four Lites Together Each With An Arch At Top - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/Four Lites Together Each With An Arch At Top - Textured.webp`
- Render fallbacks: `/assets/doors/S4.webp`
- Masks: `/assets/masks/S4.png`

### S836 — S836 - TWO 8" X 36" LITES

- Selection thumbnail: `/assets/doors/S836.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Two 8_ x 36_ Lites - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/S836 - Textured.webp`
- Render fallbacks: `/assets/doors/S836.webp`
- Masks: `/assets/masks/S836.png`

### SAT — SAT - HALF ARCH TOP

- Selection thumbnail: `/assets/doors/SAT.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Half Arch Top - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/SAT - Textured.webp`
- Render fallbacks: `/assets/doors/SAT.webp`
- Masks: `/assets/masks/SAT.png`

### SHAK1 — SHAK1 - 1-PANEL SHAKER

- Selection thumbnail: `/assets/doors/SHAK1.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/1 Panel Shaker - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/Shak1 - Textured.webp`
- Render fallbacks: `/assets/doors/SHAK1.webp`
- Masks: —

### SHAK2 — SHAK2 - 2-PANEL SHAKER

- Selection thumbnail: `/assets/doors/SHAK2.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/2 Panel Shaker - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/Shak2 - Textured.webp`
- Render fallbacks: `/assets/doors/SHAK2.webp`
- Masks: —

### SHAK3 — SHAK3 - 3-PANEL SHAKER

- Selection thumbnail: `/assets/doors/SHAK3.webp`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/3 Panel Shaker - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/Shak3 - Textured.webp`
- Render fallbacks: `/assets/doors/SHAK3.webp`
- Masks: —

### SO — SO - SMALL OVAL 3 PANEL

- Selection thumbnail: `/assets/doors/SO.png`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Small Oval 3 Panel - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/SO - Textured.webp`
- Render fallbacks: `/assets/doors/SO.png`
- Masks: `/assets/masks/SO.png`

### SO2 — SO2 - SMALL OVAL 2 PANEL

- Selection thumbnail: `/assets/doors/SO2.png`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Cherry/Small Oval 2 Panel - Cherry.webp`
- Render fallbacks: `/assets/doors/SO2.png`
- Masks: `/assets/masks/SO.png`

### SW — SW - WAGON WHEEL

- Selection thumbnail: `/assets/doors/SW.png`
- Dedicated renders: `/assets/hgi-assets/Preview Slabs/Smooth/Wagon Wheel - Smooth.webp`<br>`/assets/hgi-assets/Preview Slabs/Textured/Wagon Wheel - Textured.webp`
- Render fallbacks: `/assets/doors/SW.png`
- Masks: `/assets/masks/SW.png`

## Exact next step

Build a **DEV-only, checksum-verified Storage upload dry run** that reads only the 159 bound file paths plus the two explicitly reviewed overlay helpers, proposes their versioned object keys, and produces an old-path → Storage-object manifest. Review that manifest and the eight unbound Preview Slabs before creating a bucket or uploading anything. Do not change `assets.current_path`, publish the catalog, or switch the customer runtime during that step.
