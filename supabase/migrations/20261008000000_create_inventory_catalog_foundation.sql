-- HGI inventory catalog foundation.
-- This migration creates revisioned catalog facts, compatibility relationships,
-- typed asset bindings, and conservative Home Guard Admin-only RLS.

create table public.catalog_revisions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  source_commit text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  check ((status = 'published' and published_at is not null) or status <> 'published')
);

create unique index catalog_revisions_one_published_idx
  on public.catalog_revisions (status)
  where status = 'published';

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  legacy_id text,
  internal_code text,
  display_name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.series (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  material_id uuid references public.materials(id) on delete restrict,
  legacy_id text,
  internal_code text,
  display_name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.grains (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  legacy_id text,
  internal_code text,
  display_name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.door_line_groups (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  legacy_id text,
  internal_code text,
  display_name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.door_lines (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  series_id uuid references public.series(id) on delete restrict,
  legacy_id text,
  internal_code text,
  display_name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.door_line_group_members (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  door_line_group_id uuid not null references public.door_line_groups(id) on delete restrict,
  door_line_id uuid not null references public.door_lines(id) on delete restrict,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (catalog_revision_id, door_line_group_id, door_line_id)
);

create table public.door_styles (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  legacy_id text,
  internal_code text,
  product_code text,
  display_name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.door_variants (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  door_style_id uuid not null references public.door_styles(id) on delete restrict,
  door_line_id uuid not null references public.door_lines(id) on delete restrict,
  grain_id uuid references public.grains(id) on delete restrict,
  legacy_id text,
  internal_code text,
  product_code text,
  opening_code text,
  display_name text not null,
  description text,
  supports_glass boolean not null default false,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.finishes (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  legacy_id text,
  internal_code text,
  promatch_code text,
  finish_type text not null check (finish_type in ('paint', 'stain')),
  display_name text not null,
  description text,
  hex_color text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hex_color is null or hex_color ~ '^#[0-9A-Fa-f]{6}$')
);

create table public.door_variant_finishes (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  door_variant_id uuid not null references public.door_variants(id) on delete restrict,
  finish_id uuid not null references public.finishes(id) on delete restrict,
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique (catalog_revision_id, door_variant_id, finish_id)
);

create table public.frame_materials (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  legacy_id text,
  internal_code text,
  display_name text not null,
  frame_kind text not null check (frame_kind in ('timber', 'clad', 'other')),
  description text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default false,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.frame_material_finishes (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  frame_material_id uuid not null references public.frame_materials(id) on delete restrict,
  finish_id uuid not null references public.finishes(id) on delete restrict,
  customer_selectable boolean not null default false,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique (catalog_revision_id, frame_material_id, finish_id)
);

create table public.door_variant_frame_materials (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  door_variant_id uuid not null references public.door_variants(id) on delete restrict,
  frame_material_id uuid not null references public.frame_materials(id) on delete restrict,
  customer_selectable boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  unique (catalog_revision_id, door_variant_id, frame_material_id)
);

create table public.glass_families (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  legacy_id text,
  internal_code text,
  display_name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.glass_designs (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  glass_family_id uuid references public.glass_families(id) on delete restrict,
  legacy_id text,
  internal_code text,
  display_name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  renderable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.glass_options (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  glass_design_id uuid not null references public.glass_designs(id) on delete restrict,
  legacy_id text,
  internal_code text,
  opening_code text,
  scope text not null default 'door' check (scope in ('door', 'sidelite', 'transom', 'other')),
  display_name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  renderable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.door_variant_glass_options (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  door_variant_id uuid not null references public.door_variants(id) on delete restrict,
  glass_option_id uuid not null references public.glass_options(id) on delete restrict,
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique (catalog_revision_id, door_variant_id, glass_option_id)
);

create table public.sidelite_styles (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  legacy_id text,
  internal_code text,
  display_name text not null,
  description text,
  asset_family_alias text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sidelite_variants (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  sidelite_style_id uuid not null references public.sidelite_styles(id) on delete restrict,
  material_id uuid references public.materials(id) on delete restrict,
  grain_id uuid references public.grains(id) on delete restrict,
  legacy_id text,
  internal_code text,
  product_code text,
  opening_code text,
  display_name text not null,
  description text,
  asset_family_alias text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.door_variant_sidelites (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  door_variant_id uuid not null references public.door_variants(id) on delete restrict,
  sidelite_variant_id uuid not null references public.sidelite_variants(id) on delete restrict,
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique (catalog_revision_id, door_variant_id, sidelite_variant_id)
);

create table public.sidelite_variant_glass_options (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  sidelite_variant_id uuid not null references public.sidelite_variants(id) on delete restrict,
  glass_option_id uuid not null references public.glass_options(id) on delete restrict,
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique (catalog_revision_id, sidelite_variant_id, glass_option_id)
);

create table public.hardware_brands (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  legacy_id text,
  internal_code text,
  display_name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hardware_styles (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  hardware_brand_id uuid not null references public.hardware_brands(id) on delete restrict,
  legacy_id text,
  internal_code text,
  display_name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hardware_finishes (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  hardware_brand_id uuid references public.hardware_brands(id) on delete restrict,
  legacy_id text,
  internal_code text,
  display_name text not null,
  description text,
  hex_color text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hex_color is null or hex_color ~ '^#[0-9A-Fa-f]{6}$')
);

create table public.hardware_variants (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  hardware_style_id uuid not null references public.hardware_styles(id) on delete restrict,
  hardware_finish_id uuid not null references public.hardware_finishes(id) on delete restrict,
  legacy_id text,
  internal_code text,
  product_code text,
  display_name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.grid_profiles (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  legacy_id text,
  internal_code text,
  display_name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.grid_patterns (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  legacy_id text,
  internal_code text,
  display_name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.grid_colors (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  legacy_id text,
  internal_code text,
  display_name text not null,
  hex_color text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hex_color is null or hex_color ~ '^#[0-9A-Fa-f]{6}$')
);

create table public.grid_widths (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  legacy_id text,
  internal_code text,
  display_name text not null,
  width_inches numeric(8, 4),
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (width_inches is null or width_inches > 0)
);

create table public.glass_coatings (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  legacy_id text,
  internal_code text,
  display_name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'legacy_only', 'discontinued')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.allowed_grid_combinations (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  glass_option_id uuid not null references public.glass_options(id) on delete restrict,
  grid_profile_id uuid not null references public.grid_profiles(id) on delete restrict,
  grid_pattern_id uuid not null references public.grid_patterns(id) on delete restrict,
  grid_color_id uuid not null references public.grid_colors(id) on delete restrict,
  grid_width_id uuid references public.grid_widths(id) on delete restrict,
  glass_coating_id uuid references public.glass_coatings(id) on delete restrict,
  width_selection_mode text not null default 'specific' check (width_selection_mode in ('none', 'specific')),
  customer_selectable boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  check (
    (width_selection_mode = 'none' and grid_width_id is null)
    or (width_selection_mode = 'specific' and grid_width_id is not null)
  )
);

create unique index allowed_grid_combinations_unique_idx
  on public.allowed_grid_combinations (
    catalog_revision_id, glass_option_id, grid_profile_id, grid_pattern_id,
    grid_color_id, coalesce(grid_width_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(glass_coating_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  current_path text not null,
  mime_type text,
  width integer,
  height integer,
  byte_size bigint,
  checksum text,
  has_transparency boolean,
  content_version integer not null default 1,
  provenance text,
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_revision_id, current_path, content_version),
  check (width is null or width > 0),
  check (height is null or height > 0),
  check (byte_size is null or byte_size >= 0),
  check (content_version > 0)
);

create table public.door_variant_assets (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  door_variant_id uuid not null references public.door_variants(id) on delete restrict,
  asset_id uuid not null references public.assets(id) on delete restrict,
  role text not null check (role in ('thumbnail', 'slab_render', 'glass_overlay', 'mask')),
  view_key text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (catalog_revision_id, door_variant_id, role, view_key, asset_id)
);

create table public.glass_option_assets (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  glass_option_id uuid not null references public.glass_options(id) on delete restrict,
  asset_id uuid not null references public.assets(id) on delete restrict,
  role text not null check (role in ('thumbnail', 'glass_overlay', 'mask')),
  view_key text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (catalog_revision_id, glass_option_id, role, view_key, asset_id)
);

create table public.sidelite_variant_assets (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  sidelite_variant_id uuid not null references public.sidelite_variants(id) on delete restrict,
  asset_id uuid not null references public.assets(id) on delete restrict,
  role text not null check (role in ('thumbnail', 'slab_render', 'glass_overlay', 'mask')),
  view_key text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (catalog_revision_id, sidelite_variant_id, role, view_key, asset_id)
);

create table public.hardware_variant_assets (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  hardware_variant_id uuid not null references public.hardware_variants(id) on delete restrict,
  asset_id uuid not null references public.assets(id) on delete restrict,
  role text not null check (role in ('hardware_card', 'exterior_hardware', 'interior_hardware')),
  view_key text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (catalog_revision_id, hardware_variant_id, role, view_key, asset_id)
);

create table public.finish_assets (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  finish_id uuid not null references public.finishes(id) on delete restrict,
  asset_id uuid not null references public.assets(id) on delete restrict,
  role text not null default 'finish_swatch' check (role = 'finish_swatch'),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (catalog_revision_id, finish_id, role, asset_id)
);

create table public.grid_combination_assets (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  grid_combination_id uuid not null references public.allowed_grid_combinations(id) on delete restrict,
  asset_id uuid not null references public.assets(id) on delete restrict,
  role text not null default 'grid_overlay' check (role = 'grid_overlay'),
  view_key text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (catalog_revision_id, grid_combination_id, role, view_key, asset_id)
);

create table public.catalog_change_log (
  id uuid primary key default gen_random_uuid(),
  catalog_revision_id uuid not null references public.catalog_revisions(id) on delete restrict,
  changed_by uuid references auth.users(id) on delete set null,
  entity_table text not null,
  entity_id uuid,
  action text not null check (action in ('insert', 'update', 'publish', 'retire', 'import')),
  change_summary text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

-- Legacy and internal identifiers are scoped to a catalog revision. Null values
-- are permitted during staged imports; customer-facing labels are intentionally
-- not unique because valid labels repeat across product scopes.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'materials', 'series', 'grains', 'door_line_groups',
    'door_styles', 'finishes', 'frame_materials',
    'glass_families', 'glass_designs', 'sidelite_styles',
    'hardware_brands', 'hardware_styles',
    'hardware_finishes', 'grid_profiles', 'grid_patterns',
    'grid_colors', 'grid_widths', 'glass_coatings'
  ] loop
    execute format(
      'create unique index %I on public.%I (catalog_revision_id, legacy_id) where legacy_id is not null',
      table_name || '_revision_legacy_id_idx', table_name
    );
    execute format(
      'create unique index %I on public.%I (catalog_revision_id, internal_code) where internal_code is not null',
      table_name || '_revision_internal_code_idx', table_name
    );
  end loop;
end $$;

create unique index door_lines_revision_legacy_id_idx
  on public.door_lines (catalog_revision_id, material_id, legacy_id)
  where legacy_id is not null;
create unique index door_lines_revision_internal_code_idx
  on public.door_lines (catalog_revision_id, material_id, internal_code)
  where internal_code is not null;
create unique index door_variants_revision_legacy_id_idx
  on public.door_variants (catalog_revision_id, door_line_id, legacy_id)
  where legacy_id is not null;
create unique index door_variants_revision_internal_code_idx
  on public.door_variants (catalog_revision_id, door_line_id, internal_code)
  where internal_code is not null;
create unique index glass_options_revision_legacy_id_idx
  on public.glass_options (
    catalog_revision_id, scope, glass_design_id, legacy_id,
    coalesce(opening_code, '')
  ) where legacy_id is not null;
create unique index glass_options_revision_internal_code_idx
  on public.glass_options (
    catalog_revision_id, scope, glass_design_id, internal_code,
    coalesce(opening_code, '')
  ) where internal_code is not null;
create unique index sidelite_variants_revision_legacy_id_idx
  on public.sidelite_variants (catalog_revision_id, sidelite_style_id, legacy_id)
  where legacy_id is not null;
create unique index sidelite_variants_revision_internal_code_idx
  on public.sidelite_variants (catalog_revision_id, sidelite_style_id, internal_code)
  where internal_code is not null;
create unique index hardware_variants_revision_legacy_id_idx
  on public.hardware_variants (
    catalog_revision_id, hardware_style_id, hardware_finish_id, legacy_id
  ) where legacy_id is not null;
create unique index hardware_variants_revision_internal_code_idx
  on public.hardware_variants (
    catalog_revision_id, hardware_style_id, hardware_finish_id, internal_code
  ) where internal_code is not null;

-- Prevent accidental cross-revision relationships while keeping UUID primary
-- keys simple. Standard foreign keys still provide existence/delete checks.
create function public.enforce_catalog_revision_fk()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  referenced_id uuid;
  referenced_revision_id uuid;
begin
  referenced_id := nullif(to_jsonb(new) ->> tg_argv[1], '')::uuid;
  if referenced_id is null then
    return new;
  end if;
  execute format(
    'select catalog_revision_id from public.%I where id = $1',
    tg_argv[0]
  ) into referenced_revision_id using referenced_id;
  if referenced_revision_id is distinct from new.catalog_revision_id then
    raise exception 'Catalog relationship must remain within one revision';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_catalog_revision_fk() from public;

create trigger series_material_revision before insert or update on public.series for each row execute function public.enforce_catalog_revision_fk('materials', 'material_id');
create trigger door_lines_material_revision before insert or update on public.door_lines for each row execute function public.enforce_catalog_revision_fk('materials', 'material_id');
create trigger door_lines_series_revision before insert or update on public.door_lines for each row execute function public.enforce_catalog_revision_fk('series', 'series_id');
create trigger door_line_group_members_group_revision before insert or update on public.door_line_group_members for each row execute function public.enforce_catalog_revision_fk('door_line_groups', 'door_line_group_id');
create trigger door_line_group_members_line_revision before insert or update on public.door_line_group_members for each row execute function public.enforce_catalog_revision_fk('door_lines', 'door_line_id');
create trigger door_variants_style_revision before insert or update on public.door_variants for each row execute function public.enforce_catalog_revision_fk('door_styles', 'door_style_id');
create trigger door_variants_line_revision before insert or update on public.door_variants for each row execute function public.enforce_catalog_revision_fk('door_lines', 'door_line_id');
create trigger door_variants_grain_revision before insert or update on public.door_variants for each row execute function public.enforce_catalog_revision_fk('grains', 'grain_id');
create trigger door_variant_finishes_variant_revision before insert or update on public.door_variant_finishes for each row execute function public.enforce_catalog_revision_fk('door_variants', 'door_variant_id');
create trigger door_variant_finishes_finish_revision before insert or update on public.door_variant_finishes for each row execute function public.enforce_catalog_revision_fk('finishes', 'finish_id');
create trigger frame_material_finishes_material_revision before insert or update on public.frame_material_finishes for each row execute function public.enforce_catalog_revision_fk('frame_materials', 'frame_material_id');
create trigger frame_material_finishes_finish_revision before insert or update on public.frame_material_finishes for each row execute function public.enforce_catalog_revision_fk('finishes', 'finish_id');
create trigger door_variant_frame_materials_variant_revision before insert or update on public.door_variant_frame_materials for each row execute function public.enforce_catalog_revision_fk('door_variants', 'door_variant_id');
create trigger door_variant_frame_materials_material_revision before insert or update on public.door_variant_frame_materials for each row execute function public.enforce_catalog_revision_fk('frame_materials', 'frame_material_id');
create trigger glass_designs_family_revision before insert or update on public.glass_designs for each row execute function public.enforce_catalog_revision_fk('glass_families', 'glass_family_id');
create trigger glass_options_design_revision before insert or update on public.glass_options for each row execute function public.enforce_catalog_revision_fk('glass_designs', 'glass_design_id');
create trigger door_variant_glass_options_variant_revision before insert or update on public.door_variant_glass_options for each row execute function public.enforce_catalog_revision_fk('door_variants', 'door_variant_id');
create trigger door_variant_glass_options_glass_revision before insert or update on public.door_variant_glass_options for each row execute function public.enforce_catalog_revision_fk('glass_options', 'glass_option_id');
create trigger sidelite_variants_style_revision before insert or update on public.sidelite_variants for each row execute function public.enforce_catalog_revision_fk('sidelite_styles', 'sidelite_style_id');
create trigger sidelite_variants_material_revision before insert or update on public.sidelite_variants for each row execute function public.enforce_catalog_revision_fk('materials', 'material_id');
create trigger sidelite_variants_grain_revision before insert or update on public.sidelite_variants for each row execute function public.enforce_catalog_revision_fk('grains', 'grain_id');
create trigger door_variant_sidelites_variant_revision before insert or update on public.door_variant_sidelites for each row execute function public.enforce_catalog_revision_fk('door_variants', 'door_variant_id');
create trigger door_variant_sidelites_sidelite_revision before insert or update on public.door_variant_sidelites for each row execute function public.enforce_catalog_revision_fk('sidelite_variants', 'sidelite_variant_id');
create trigger sidelite_variant_glass_variant_revision before insert or update on public.sidelite_variant_glass_options for each row execute function public.enforce_catalog_revision_fk('sidelite_variants', 'sidelite_variant_id');
create trigger sidelite_variant_glass_option_revision before insert or update on public.sidelite_variant_glass_options for each row execute function public.enforce_catalog_revision_fk('glass_options', 'glass_option_id');
create trigger hardware_styles_brand_revision before insert or update on public.hardware_styles for each row execute function public.enforce_catalog_revision_fk('hardware_brands', 'hardware_brand_id');
create trigger hardware_finishes_brand_revision before insert or update on public.hardware_finishes for each row execute function public.enforce_catalog_revision_fk('hardware_brands', 'hardware_brand_id');
create trigger hardware_variants_style_revision before insert or update on public.hardware_variants for each row execute function public.enforce_catalog_revision_fk('hardware_styles', 'hardware_style_id');
create trigger hardware_variants_finish_revision before insert or update on public.hardware_variants for each row execute function public.enforce_catalog_revision_fk('hardware_finishes', 'hardware_finish_id');
create trigger allowed_grid_glass_revision before insert or update on public.allowed_grid_combinations for each row execute function public.enforce_catalog_revision_fk('glass_options', 'glass_option_id');
create trigger allowed_grid_profile_revision before insert or update on public.allowed_grid_combinations for each row execute function public.enforce_catalog_revision_fk('grid_profiles', 'grid_profile_id');
create trigger allowed_grid_pattern_revision before insert or update on public.allowed_grid_combinations for each row execute function public.enforce_catalog_revision_fk('grid_patterns', 'grid_pattern_id');
create trigger allowed_grid_color_revision before insert or update on public.allowed_grid_combinations for each row execute function public.enforce_catalog_revision_fk('grid_colors', 'grid_color_id');
create trigger allowed_grid_width_revision before insert or update on public.allowed_grid_combinations for each row execute function public.enforce_catalog_revision_fk('grid_widths', 'grid_width_id');
create trigger allowed_grid_coating_revision before insert or update on public.allowed_grid_combinations for each row execute function public.enforce_catalog_revision_fk('glass_coatings', 'glass_coating_id');
create trigger door_variant_assets_variant_revision before insert or update on public.door_variant_assets for each row execute function public.enforce_catalog_revision_fk('door_variants', 'door_variant_id');
create trigger door_variant_assets_asset_revision before insert or update on public.door_variant_assets for each row execute function public.enforce_catalog_revision_fk('assets', 'asset_id');
create trigger glass_option_assets_option_revision before insert or update on public.glass_option_assets for each row execute function public.enforce_catalog_revision_fk('glass_options', 'glass_option_id');
create trigger glass_option_assets_asset_revision before insert or update on public.glass_option_assets for each row execute function public.enforce_catalog_revision_fk('assets', 'asset_id');
create trigger sidelite_variant_assets_variant_revision before insert or update on public.sidelite_variant_assets for each row execute function public.enforce_catalog_revision_fk('sidelite_variants', 'sidelite_variant_id');
create trigger sidelite_variant_assets_asset_revision before insert or update on public.sidelite_variant_assets for each row execute function public.enforce_catalog_revision_fk('assets', 'asset_id');
create trigger hardware_variant_assets_variant_revision before insert or update on public.hardware_variant_assets for each row execute function public.enforce_catalog_revision_fk('hardware_variants', 'hardware_variant_id');
create trigger hardware_variant_assets_asset_revision before insert or update on public.hardware_variant_assets for each row execute function public.enforce_catalog_revision_fk('assets', 'asset_id');
create trigger finish_assets_finish_revision before insert or update on public.finish_assets for each row execute function public.enforce_catalog_revision_fk('finishes', 'finish_id');
create trigger finish_assets_asset_revision before insert or update on public.finish_assets for each row execute function public.enforce_catalog_revision_fk('assets', 'asset_id');
create trigger grid_combination_assets_combination_revision before insert or update on public.grid_combination_assets for each row execute function public.enforce_catalog_revision_fk('allowed_grid_combinations', 'grid_combination_id');
create trigger grid_combination_assets_asset_revision before insert or update on public.grid_combination_assets for each row execute function public.enforce_catalog_revision_fk('assets', 'asset_id');

-- Index every foreign-key lookup used by catalog navigation and compatibility.
create index series_material_id_idx on public.series (material_id);
create index door_lines_material_id_idx on public.door_lines (material_id);
create index door_lines_series_id_idx on public.door_lines (series_id);
create index door_line_group_members_group_idx on public.door_line_group_members (door_line_group_id);
create index door_line_group_members_line_idx on public.door_line_group_members (door_line_id);
create index door_variants_style_idx on public.door_variants (door_style_id);
create index door_variants_line_idx on public.door_variants (door_line_id);
create index door_variants_grain_idx on public.door_variants (grain_id);
create index door_variant_finishes_variant_idx on public.door_variant_finishes (door_variant_id);
create index door_variant_finishes_finish_idx on public.door_variant_finishes (finish_id);
create index frame_material_finishes_material_idx on public.frame_material_finishes (frame_material_id);
create index frame_material_finishes_finish_idx on public.frame_material_finishes (finish_id);
create index door_variant_frame_materials_variant_idx on public.door_variant_frame_materials (door_variant_id);
create index glass_designs_family_idx on public.glass_designs (glass_family_id);
create index glass_options_design_idx on public.glass_options (glass_design_id);
create index door_variant_glass_options_variant_idx on public.door_variant_glass_options (door_variant_id);
create index door_variant_glass_options_glass_idx on public.door_variant_glass_options (glass_option_id);
create index sidelite_variants_style_idx on public.sidelite_variants (sidelite_style_id);
create index door_variant_sidelites_variant_idx on public.door_variant_sidelites (door_variant_id);
create index sidelite_variant_glass_variant_idx on public.sidelite_variant_glass_options (sidelite_variant_id);
create index sidelite_variant_glass_option_idx on public.sidelite_variant_glass_options (glass_option_id);
create index hardware_styles_brand_idx on public.hardware_styles (hardware_brand_id);
create index hardware_finishes_brand_idx on public.hardware_finishes (hardware_brand_id);
create index hardware_variants_style_idx on public.hardware_variants (hardware_style_id);
create index hardware_variants_finish_idx on public.hardware_variants (hardware_finish_id);
create index allowed_grid_combinations_glass_idx on public.allowed_grid_combinations (glass_option_id);
create index door_variant_assets_variant_idx on public.door_variant_assets (door_variant_id);
create index door_variant_assets_asset_idx on public.door_variant_assets (asset_id);
create index glass_option_assets_option_idx on public.glass_option_assets (glass_option_id);
create index sidelite_variant_assets_variant_idx on public.sidelite_variant_assets (sidelite_variant_id);
create index hardware_variant_assets_variant_idx on public.hardware_variant_assets (hardware_variant_id);
create index finish_assets_finish_idx on public.finish_assets (finish_id);
create index grid_combination_assets_combination_idx on public.grid_combination_assets (grid_combination_id);
create index catalog_change_log_revision_created_idx on public.catalog_change_log (catalog_revision_id, created_at desc);
create index catalog_change_log_entity_idx on public.catalog_change_log (entity_table, entity_id);

-- Conservative security foundation: base inventory tables remain completely
-- unavailable to anonymous users. Existing Home Guard Admin membership is the
-- only authenticated authority. Customer-safe published views are deliberately
-- deferred until the Door Builder is connected in Phase 3.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'catalog_revisions', 'materials', 'series', 'grains', 'door_line_groups',
    'door_lines', 'door_line_group_members', 'door_styles', 'door_variants',
    'finishes', 'door_variant_finishes', 'frame_materials',
    'frame_material_finishes', 'door_variant_frame_materials', 'glass_families',
    'glass_designs', 'glass_options', 'door_variant_glass_options',
    'sidelite_styles', 'sidelite_variants', 'door_variant_sidelites',
    'sidelite_variant_glass_options', 'hardware_brands', 'hardware_styles',
    'hardware_finishes', 'hardware_variants', 'grid_profiles', 'grid_patterns',
    'grid_colors', 'grid_widths', 'glass_coatings', 'allowed_grid_combinations',
    'assets', 'door_variant_assets', 'glass_option_assets',
    'sidelite_variant_assets', 'hardware_variant_assets', 'finish_assets',
    'grid_combination_assets', 'catalog_change_log'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('revoke all on table public.%I from authenticated', table_name);
    execute format('grant select, insert, update on table public.%I to authenticated', table_name);
    execute format(
      'create policy "Home Guard admins can read %1$s" on public.%1$I for select to authenticated using (exists (select 1 from public.home_guard_admins where home_guard_admins.user_id = (select auth.uid())))',
      table_name
    );
    execute format(
      'create policy "Home Guard admins can create %1$s" on public.%1$I for insert to authenticated with check (exists (select 1 from public.home_guard_admins where home_guard_admins.user_id = (select auth.uid())))',
      table_name
    );
    execute format(
      'create policy "Home Guard admins can update %1$s" on public.%1$I for update to authenticated using (exists (select 1 from public.home_guard_admins where home_guard_admins.user_id = (select auth.uid()))) with check (exists (select 1 from public.home_guard_admins where home_guard_admins.user_id = (select auth.uid())))',
      table_name
    );
  end loop;
end $$;

comment on table public.catalog_revisions is
  'Coherent draft, published, or retired inventory snapshots. Publishing behavior is intentionally deferred.';
comment on table public.assets is
  'Metadata for existing inventory assets. current_path continues to reference application /public/assets paths; no files are moved by this migration.';
comment on table public.allowed_grid_combinations is
  'Explicit valid glass/grid combinations. Absence means unavailable; width_selection_mode distinguishes no width from a required specific width.';
comment on table public.catalog_change_log is
  'Basic append-oriented catalog audit history for future inventory administration.';
