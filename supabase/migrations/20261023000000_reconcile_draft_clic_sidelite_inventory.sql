-- Reconcile the current customer-runtime CLiC sidelite semantics into the
-- editable Draft catalog only. The Published baseline remains immutable.

do $$
declare
  draft_revision constant uuid := 'af9dd06f-019e-4a31-b44c-248c862ba7d3';
  published_revision constant uuid := '1af5506c-c723-5d6d-a341-93815d0205e2';
begin
  if not exists (
    select 1 from public.catalog_revisions
    where id = draft_revision and status = 'draft'
  ) then
    raise exception 'Expected CLiC target revision % to be the current Draft', draft_revision;
  end if;

  if not exists (
    select 1 from public.catalog_revisions
    where id = published_revision and status = 'published'
  ) then
    raise exception 'Expected immutable Published baseline % was not found', published_revision;
  end if;

  if (select count(*) from public.catalog_revisions where status = 'draft') <> 1 then
    raise exception 'CLiC reconciliation requires exactly one Draft revision';
  end if;

  if not exists (
    select 1 from public.glass_families
    where catalog_revision_id = draft_revision and legacy_id = 'clic'
  ) then
    raise exception 'Draft CLiC glass family is missing';
  end if;

  if (
    select count(*)
    from public.sidelite_variants sv
    join public.sidelite_styles ss on ss.id = sv.sidelite_style_id
    where sv.catalog_revision_id = draft_revision
      and sv.legacy_id in (
        '20-gauge-smooth-steel:f48sl', '22-gauge-steel:f48sl',
        'brushed-smooth-fiberglass:f48sl', 'signature-cherry:f48sl',
        'signature-mahogany:f48sl', 'signature-oak:f48sl',
        'textured-fiberglass:f48sl',
        '20-gauge-smooth-steel:fsl', '22-gauge-steel:fsl',
        'brushed-smooth-fiberglass:fsl', 'signature-cherry:fsl',
        'signature-fir:fsl', 'signature-mahogany:fsl',
        'textured-fiberglass:fsl',
        '20-gauge-smooth-steel:ssl', '22-gauge-steel:ssl',
        'signature-cherry:ssl', 'signature-mahogany:ssl',
        'signature-oak:ssl', 'textured-fiberglass:ssl'
      )
      and ss.legacy_id in ('f48sl', 'fsl', 'ssl')
  ) <> 20 then
    raise exception 'Expected 20 scoped Draft sidelite variants for CLiC reconciliation';
  end if;
end
$$;

insert into public.glass_designs (
  id, catalog_revision_id, glass_family_id, legacy_id, display_name,
  status, customer_selectable, renderable, display_order, notes
)
select values_to_insert.id,
       'af9dd06f-019e-4a31-b44c-248c862ba7d3'::uuid,
       gf.id,
       values_to_insert.legacy_id,
       'CLiC – No grids',
       'active', true, true,
       values_to_insert.display_order,
       jsonb_build_object(
         'slab', values_to_insert.slab,
         'source', jsonb_build_object(
           'id', 'clic-nogrid',
           'name', 'CLiC – No grids',
           'category', 'clic',
           'orderingCodes', jsonb_build_array('CLICS', 'NOGRID', 'NONSTOCKSLGL')
         ),
         'reconciliation', '2026-10-23 P0 CLiC Draft reconciliation',
         'rendering', 'No overlay asset; uses the existing sidelite slab and mask'
       )::text
from (
  values
    ('54eb2ad6-515c-48f6-88a4-9486718fab8e'::uuid, 'sidelite:f48sl:clic-nogrid', 'f48sl', 177),
    ('e4c1152f-a240-4ace-8d87-e4c186d22a51'::uuid, 'sidelite:fsl:clic-nogrid', 'fsl', 173),
    ('6023654b-f67a-4f08-ad84-b0e7971e7787'::uuid, 'sidelite:ssl:clic-nogrid', 'ssl', 199)
) as values_to_insert(id, legacy_id, slab, display_order)
join public.glass_families gf
  on gf.catalog_revision_id = 'af9dd06f-019e-4a31-b44c-248c862ba7d3'::uuid
 and gf.legacy_id = 'clic';

insert into public.glass_options (
  id, catalog_revision_id, glass_design_id, legacy_id, opening_code, scope,
  display_name, status, customer_selectable, renderable, display_order, notes
)
values
  (
    '10c62628-7026-4ee1-9da0-0f31ca64b1f3',
    'af9dd06f-019e-4a31-b44c-248c862ba7d3',
    '54eb2ad6-515c-48f6-88a4-9486718fab8e',
    'clic-nogrid', 'F48SL', 'sidelite', 'CLiC – No grids',
    'active', true, true, 2,
    '{"slab":"f48sl","source":{"id":"clic-nogrid","name":"CLiC – No grids","category":"clic","orderingCodes":["CLICS","NOGRID","NONSTOCKSLGL"]},"rendering":"No overlay asset; uses the existing sidelite slab and mask"}'
  ),
  (
    '818ab7b8-914e-4187-acc0-6c1af82584d7',
    'af9dd06f-019e-4a31-b44c-248c862ba7d3',
    'e4c1152f-a240-4ace-8d87-e4c186d22a51',
    'clic-nogrid', 'FSL', 'sidelite', 'CLiC – No grids',
    'active', true, true, 37,
    '{"slab":"fsl","source":{"id":"clic-nogrid","name":"CLiC – No grids","category":"clic","orderingCodes":["CLICS","NOGRID","NONSTOCKSLGL"]},"rendering":"No overlay asset; uses the existing sidelite slab and mask"}'
  ),
  (
    'd6bdd61b-2066-4fa9-9919-2625e5b89a37',
    'af9dd06f-019e-4a31-b44c-248c862ba7d3',
    '6023654b-f67a-4f08-ad84-b0e7971e7787',
    'clic-nogrid', 'SSL', 'sidelite', 'CLiC – No grids',
    'active', true, true, 2,
    '{"slab":"ssl","source":{"id":"clic-nogrid","name":"CLiC – No grids","category":"clic","orderingCodes":["CLICS","NOGRID","NONSTOCKSLGL"]},"rendering":"No overlay asset; uses the existing sidelite slab and mask"}'
  );

insert into public.sidelite_variant_glass_options (
  catalog_revision_id, sidelite_variant_id, glass_option_id,
  customer_selectable, display_order, notes
)
select
  'af9dd06f-019e-4a31-b44c-248c862ba7d3'::uuid,
  sv.id,
  go.id,
  true,
  go.display_order,
  'Added by 2026-10-23 P0 CLiC Draft reconciliation'
from public.sidelite_variants sv
join public.sidelite_styles ss on ss.id = sv.sidelite_style_id
join public.glass_options go
  on go.catalog_revision_id = sv.catalog_revision_id
 and go.scope = 'sidelite'
 and go.legacy_id = 'clic-nogrid'
 and lower(go.opening_code) = ss.legacy_id
where sv.catalog_revision_id = 'af9dd06f-019e-4a31-b44c-248c862ba7d3'::uuid
  and (
    (ss.legacy_id = 'f48sl' and sv.legacy_id in (
      '20-gauge-smooth-steel:f48sl', '22-gauge-steel:f48sl',
      'brushed-smooth-fiberglass:f48sl', 'signature-cherry:f48sl',
      'signature-mahogany:f48sl', 'signature-oak:f48sl',
      'textured-fiberglass:f48sl'
    ))
    or (ss.legacy_id = 'fsl' and sv.legacy_id in (
      '20-gauge-smooth-steel:fsl', '22-gauge-steel:fsl',
      'brushed-smooth-fiberglass:fsl', 'signature-cherry:fsl',
      'signature-fir:fsl', 'signature-mahogany:fsl',
      'textured-fiberglass:fsl'
    ))
    or (ss.legacy_id = 'ssl' and sv.legacy_id in (
      '20-gauge-smooth-steel:ssl', '22-gauge-steel:ssl',
      'signature-cherry:ssl', 'signature-mahogany:ssl',
      'signature-oak:ssl', 'textured-fiberglass:ssl'
    ))
  );

-- Preserve the obsolete artwork and records for historical rendering/audit,
-- while removing the old left/right choices from current customer selection.
insert into public.catalog_change_log (
  catalog_revision_id, entity_table, entity_id, action,
  change_summary, before_data
)
select catalog_revision_id, 'glass_options', id, 'retire',
       'Retire obsolete FSL CLiC left/right customer option', to_jsonb(go)
from public.glass_options go
where catalog_revision_id = 'af9dd06f-019e-4a31-b44c-248c862ba7d3'::uuid
  and scope = 'sidelite' and opening_code = 'FSL'
  and legacy_id in ('entl', 'entr');

insert into public.catalog_change_log (
  catalog_revision_id, entity_table, entity_id, action,
  change_summary, before_data
)
select gd.catalog_revision_id, 'glass_designs', gd.id, 'retire',
       'Retire obsolete FSL CLiC left/right design', to_jsonb(gd)
from public.glass_designs gd
where gd.catalog_revision_id = 'af9dd06f-019e-4a31-b44c-248c862ba7d3'::uuid
  and gd.legacy_id in ('sidelite:fsl:entl', 'sidelite:fsl:entr');

insert into public.catalog_change_log (
  catalog_revision_id, entity_table, entity_id, action,
  change_summary, before_data
)
select svgo.catalog_revision_id, 'sidelite_variant_glass_options', svgo.id,
       'retire', 'Disable obsolete FSL CLiC left/right compatibility',
       to_jsonb(svgo)
from public.sidelite_variant_glass_options svgo
join public.glass_options go on go.id = svgo.glass_option_id
where svgo.catalog_revision_id = 'af9dd06f-019e-4a31-b44c-248c862ba7d3'::uuid
  and go.scope = 'sidelite' and go.opening_code = 'FSL'
  and go.legacy_id in ('entl', 'entr');

update public.sidelite_variant_glass_options svgo
set customer_selectable = false,
    notes = concat_ws('; ', nullif(svgo.notes, ''),
      'Retired by 2026-10-23 P0 CLiC Draft reconciliation')
from public.glass_options go
where go.id = svgo.glass_option_id
  and svgo.catalog_revision_id = 'af9dd06f-019e-4a31-b44c-248c862ba7d3'::uuid
  and go.scope = 'sidelite' and go.opening_code = 'FSL'
  and go.legacy_id in ('entl', 'entr');

update public.glass_options
set status = 'legacy_only',
    customer_selectable = false,
    renderable = true,
    notes = concat_ws('; ', nullif(notes, ''),
      'Retired from customer selection by 2026-10-23 P0 CLiC Draft reconciliation'),
    updated_at = now()
where catalog_revision_id = 'af9dd06f-019e-4a31-b44c-248c862ba7d3'::uuid
  and scope = 'sidelite' and opening_code = 'FSL'
  and legacy_id in ('entl', 'entr');

update public.glass_designs
set status = 'legacy_only',
    customer_selectable = false,
    renderable = true,
    notes = concat_ws('; ', nullif(notes, ''),
      'Retired from customer selection by 2026-10-23 P0 CLiC Draft reconciliation'),
    updated_at = now()
where catalog_revision_id = 'af9dd06f-019e-4a31-b44c-248c862ba7d3'::uuid
  and legacy_id in ('sidelite:fsl:entl', 'sidelite:fsl:entr');

insert into public.catalog_change_log (
  catalog_revision_id, entity_table, entity_id, action,
  change_summary, after_data
)
select catalog_revision_id, 'glass_designs', id, 'insert',
       'Add current scoped CLiC no-grid sidelite design', to_jsonb(gd)
from public.glass_designs gd
where catalog_revision_id = 'af9dd06f-019e-4a31-b44c-248c862ba7d3'::uuid
  and legacy_id in (
    'sidelite:f48sl:clic-nogrid',
    'sidelite:fsl:clic-nogrid',
    'sidelite:ssl:clic-nogrid'
  );

insert into public.catalog_change_log (
  catalog_revision_id, entity_table, entity_id, action,
  change_summary, after_data
)
select catalog_revision_id, 'glass_options', id, 'insert',
       'Add current scoped CLiC no-grid sidelite option', to_jsonb(go)
from public.glass_options go
where catalog_revision_id = 'af9dd06f-019e-4a31-b44c-248c862ba7d3'::uuid
  and scope = 'sidelite' and legacy_id = 'clic-nogrid'
  and opening_code in ('F48SL', 'FSL', 'SSL');

insert into public.catalog_change_log (
  catalog_revision_id, entity_table, entity_id, action,
  change_summary, after_data
)
select svgo.catalog_revision_id, 'sidelite_variant_glass_options', svgo.id,
       'insert', 'Add current CLiC no-grid scoped compatibility',
       to_jsonb(svgo)
from public.sidelite_variant_glass_options svgo
join public.glass_options go on go.id = svgo.glass_option_id
where svgo.catalog_revision_id = 'af9dd06f-019e-4a31-b44c-248c862ba7d3'::uuid
  and go.scope = 'sidelite' and go.legacy_id = 'clic-nogrid'
  and go.opening_code in ('F48SL', 'FSL', 'SSL');

do $$
declare
  draft_revision constant uuid := 'af9dd06f-019e-4a31-b44c-248c862ba7d3';
  published_revision constant uuid := '1af5506c-c723-5d6d-a341-93815d0205e2';
begin
  if (
    select count(*) from public.glass_options
    where catalog_revision_id = draft_revision and scope = 'sidelite'
      and legacy_id = 'clic-nogrid' and status = 'active'
      and customer_selectable and renderable
      and opening_code in ('F48SL', 'FSL', 'SSL')
  ) <> 3 then
    raise exception 'Expected exactly three active Draft CLiC no-grid options';
  end if;

  if (
    select count(*)
    from public.sidelite_variant_glass_options svgo
    join public.glass_options go on go.id = svgo.glass_option_id
    where svgo.catalog_revision_id = draft_revision
      and go.legacy_id = 'clic-nogrid'
      and go.opening_code in ('F48SL', 'FSL', 'SSL')
      and svgo.customer_selectable
  ) <> 20 then
    raise exception 'Expected exactly 20 active Draft CLiC no-grid compatibilities';
  end if;

  if exists (
    select 1 from public.glass_options
    where catalog_revision_id = draft_revision and scope = 'sidelite'
      and opening_code = 'FSL' and legacy_id in ('entl', 'entr')
      and (status <> 'legacy_only' or customer_selectable or not renderable)
  ) then
    raise exception 'Obsolete Draft FSL CLiC options were not safely retired';
  end if;

  if exists (
    select 1
    from public.sidelite_variant_glass_options svgo
    join public.glass_options go on go.id = svgo.glass_option_id
    where svgo.catalog_revision_id = draft_revision
      and go.opening_code = 'FSL' and go.legacy_id in ('entl', 'entr')
      and svgo.customer_selectable
  ) then
    raise exception 'Obsolete Draft FSL CLiC compatibility remains selectable';
  end if;

  if exists (
    select 1 from public.glass_options
    where catalog_revision_id = published_revision
      and scope = 'sidelite' and legacy_id = 'clic-nogrid'
  ) then
    raise exception 'Published baseline was unexpectedly changed';
  end if;
end
$$;
