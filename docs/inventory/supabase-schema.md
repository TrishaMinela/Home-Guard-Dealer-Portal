# HGI Door Builder Inventory — Supabase Foundation

This document describes the Phase 2 database foundation. The customer-facing Door Builder is **not connected** to these tables. The migration creates empty tables only; it does not import products, move assets, publish a catalog, or change existing production behavior.

## Catalog revisions

`catalog_revisions` groups one coherent catalog snapshot. A revision can be:

- `draft`: safe to populate and review without affecting customers.
- `published`: the one coherent revision a future customer API may expose.
- `retired`: preserved for history and old saved configurations.

The database allows only one revision with `published` status at a time. This phase does not add a publish function or automatically change revision statuses.

## Tables

### Core products

- `materials`: major door materials.
- `series`: named product series, optionally scoped to a material.
- `grains`: surface/grain choices.
- `door_line_groups`: groups used to organize door lines.
- `door_lines`: material and series-specific product lines.
- `door_line_group_members`: explicit membership of lines in groups.
- `door_styles`: stable style/product identities.
- `door_variants`: the actual material, line, grain, product-code, and opening-code variants used by configurations.

UUIDs are the database identity. `legacy_id`, `internal_code`, `product_code`, and `opening_code` preserve identifiers already used by the Door Builder and HGI data. Display names are never primary identity.

### Finishes and frames

- `finishes`: paint and stain facts, including color and ProMatch/internal codes.
- `door_variant_finishes`: explicit finish compatibility per door variant.
- `frame_materials`: frame/jamb material concepts; `timber` and `clad` are distinct values.
- `frame_material_finishes`: explicit allowed finishes per frame material.
- `door_variant_frame_materials`: explicit frame materials supported by a door variant.

Frame options default to not customer-selectable. Creating these facts does not expose hidden jamb controls in the Door Builder.

### Glass

- `glass_families`: broad glass collections.
- `glass_designs`: named designs within a family.
- `glass_options`: scoped door, sidelite, transom, or other variants of a design.
- `door_variant_glass_options`: explicit door-variant-to-glass compatibility.

`renderable` and `customer_selectable` are separate. A historical option such as Linen can remain resolvable and renderable while being unavailable for new customer selection. Names are deliberately not globally unique. Legacy identifiers are scoped by revision, glass design, option scope, and opening code.

### Sidelites

- `sidelite_styles`: stable sidelite style identities and current asset-family aliases.
- `sidelite_variants`: material, grain, product/opening code, and asset-family variants.
- `door_variant_sidelites`: explicit door-to-sidelite compatibility.
- `sidelite_variant_glass_options`: explicit glass compatibility for sidelites.

The schema stores product facts and asset-family aliases. Hinge-side and lock-side translation remains application behavior; SQL does not encode handing.

### Hardware

- `hardware_brands`: manufacturers.
- `hardware_styles`: sellable styles within a brand.
- `hardware_finishes`: hardware finish facts.
- `hardware_variants`: the sellable style-and-finish combination with legacy/product codes.

Artwork views and handing are represented through typed asset bindings and `view_key`; they are not separate sellable hardware products. No door-style-to-hardware restrictions were invented.

### Grids and coatings

- `grid_profiles`
- `grid_patterns`
- `grid_colors`
- `grid_widths`
- `glass_coatings`
- `allowed_grid_combinations`

`allowed_grid_combinations` stores only explicitly valid combinations. Missing rows mean unavailable. `width_selection_mode` distinguishes a valid combination with no width choice from one requiring a specific `grid_width_id`. The migration does not create a Cartesian product.

### Assets

- `assets`: metadata for current asset paths, MIME type, dimensions, size, checksum, transparency, content version, and provenance.
- `door_variant_assets`
- `glass_option_assets`
- `sidelite_variant_assets`
- `hardware_variant_assets`
- `finish_assets`
- `grid_combination_assets`

These typed binding tables retain real foreign keys. They avoid an unsafe generic `product_type + product_id` relationship. Roles include thumbnail, slab render, glass overlay, mask, hardware card, exterior/interior hardware, finish swatch, and grid overlay.

No files move to Supabase Storage in Phase 2. `assets.current_path` continues to point to existing `/public/assets/...` paths.

### Change history

`catalog_change_log` is a basic future-facing audit log containing the revision, actor, affected table/row, action, summary, and optional JSON before/after snapshots. This phase does not add automatic auditing triggers or an inventory administration interface.

## Main relationships

```text
catalog_revisions
├── materials ──┬── series
│               ├── door_lines ── door_variants ──┬── door_variant_finishes ── finishes
│               │                                 ├── door_variant_glass_options ── glass_options
│               │                                 ├── door_variant_sidelites ── sidelite_variants
│               │                                 ├── door_variant_frame_materials ── frame_materials
│               │                                 └── door_variant_assets ── assets
│               └── sidelite_variants
├── door_line_groups ── door_line_group_members ── door_lines
├── door_styles ── door_variants
├── grains ── door_variants / sidelite_variants
├── glass_families ── glass_designs ── glass_options
│                                      ├── sidelite_variant_glass_options
│                                      ├── glass_option_assets ── assets
│                                      └── allowed_grid_combinations
│                                          ├── grid profile / pattern / color / width
│                                          ├── glass coating
│                                          └── grid_combination_assets ── assets
├── hardware_brands ── hardware_styles ── hardware_variants
│                                            ├── hardware_finishes
│                                            └── hardware_variant_assets ── assets
├── finishes ── finish_assets ── assets
└── catalog_change_log
```

Every relationship is protected from accidentally crossing catalog revisions. All deletes use `restrict` for catalog facts and compatibility rows, so catalog history cannot cascade away. Auth-user references use `set null` to preserve history if an account is removed.

## Lifecycle and availability

Catalog entities support:

- `active`: presently supported.
- `legacy_only`: retained for historical/rendering resolution but normally unavailable to new configurations.
- `discontinued`: no longer offered, but retained as a resolvable record.

`customer_selectable` controls availability for new customer choices. It never deletes the record and does not decide whether an old saved configuration can resolve. Glass also has an explicit `renderable` flag because rendering history and current customer selection are different concerns.

## Security and RLS

RLS is enabled on every new inventory table.

- Anonymous users have no base-table privileges or policies.
- Authenticated dealer users have no matching inventory policies.
- Existing `home_guard_admins` users may select, insert, and update inventory rows.
- No authenticated delete privilege or delete policy is created.
- The service-role key remains server-only and is not added to browser code.

The tables contain internal codes and notes, so granting anonymous table-level `SELECT` would expose administrative data. Phase 3 should create explicit customer-safe views or RPCs that select only approved columns and only rows belonging to the single published revision. Those public interfaces should filter by lifecycle/customer-selectable flags and must never expose `notes` or other internal administration fields.

## Deliberately not stored as database behavior

The schema stores product facts and explicit compatibility only. These remain application code:

- configuration step navigation and defaults
- sidelite hinge/lock translation
- door handing and active/inactive leaf behavior
- hardware placement
- rendering geometry, masks, glass/frame rendering, and fallbacks
- PDF layout
- submission serialization
- AI Visualizer and entrance detection
- A–E entrance compatibility
- prompts and image processing

No FeneVision API integration is included.

## Existing architecture and conflicts reviewed

The existing schema contains dealers, dealer memberships, leads/submissions, Home Guard admins/settings, notification read receipts, and AI-usage telemetry. None of those tables are changed.

Potential catalog-specific conflicts handled by this design:

- Repeated display names are allowed.
- Glass legacy IDs are scoped by design, scope, and opening code instead of globally unique.
- Product availability is separate from historical/renderable resolution.
- Timber and Clad remain separate facts.
- Grid combinations are explicit, including the distinction between no width and a required width.
- Assets remain at their current application paths.
- Cross-revision relationships are rejected.

## Phase 3

Phase 3 should:

1. Build a repeatable importer from the committed Phase 1 audit/current source data.
2. Create one draft revision and load catalog facts, compatibility rows, and asset metadata.
3. Validate row counts, legacy-ID mappings, duplicate labels, missing assets, and unresolved relationships.
4. Add customer-safe published catalog views/RPCs with focused anonymous read policies.
5. Add controlled publish/retire functions that change a complete revision atomically.
6. Build an HGI-admin inventory UI and automatic change-log recording.
7. Only after parity testing, add an opt-in Door Builder adapter. Keep the production code path unchanged until an explicit rollout phase.

Running the Phase 2 migration would create empty inventory tables, indexes, integrity checks, RLS policies, and the revision-integrity trigger function. It would not seed data, publish a catalog, move assets, connect the Door Builder, or modify any existing production table.
