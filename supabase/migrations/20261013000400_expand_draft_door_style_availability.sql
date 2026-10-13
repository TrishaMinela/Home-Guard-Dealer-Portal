create unique index door_variants_style_line_grain_unique_idx
on public.door_variants (
  catalog_revision_id,
  door_style_id,
  door_line_id,
  coalesce(grain_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

create or replace function public.update_draft_door_style(
  p_door_style_id uuid,
  p_display_name text,
  p_status text,
  p_customer_selectable boolean,
  p_display_order integer,
  p_variant_availability jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_revision_id uuid;
  v_before jsonb;
  v_input_count integer;
  v_distinct_input_count integer;
  v_valid_pair_count integer;
  v_supports_glass boolean;
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  if not exists (select 1 from public.home_guard_admins where user_id = v_user_id) then
    raise exception 'Home Guard Admin access is required';
  end if;
  if nullif(btrim(p_display_name), '') is null then raise exception 'Door Style name is required'; end if;
  if p_status not in ('active', 'legacy_only', 'discontinued') then raise exception 'Invalid Door Style status'; end if;
  if p_status = 'discontinued' and p_customer_selectable then raise exception 'A discontinued Door Style cannot be customer visible'; end if;
  if p_display_order is null or p_display_order < 0 then raise exception 'Display order must be zero or greater'; end if;
  if jsonb_typeof(p_variant_availability) <> 'array' then raise exception 'Variant availability must be an array'; end if;

  select catalog_revision_id,
         jsonb_build_object(
           'style', to_jsonb(door_styles),
           'availability', (
             select coalesce(jsonb_agg(jsonb_build_object(
               'variant_id', variant.id,
               'door_line_id', variant.door_line_id,
               'grain_id', variant.grain_id,
               'customer_selectable', variant.customer_selectable
             ) order by variant.display_order), '[]'::jsonb)
             from public.door_variants variant
             where variant.door_style_id = p_door_style_id
           )
         )
  into v_revision_id, v_before
  from public.door_styles
  where id = p_door_style_id
  for update;

  if v_revision_id is null then raise exception 'Door Style was not found'; end if;
  if not exists (select 1 from public.catalog_revisions where id = v_revision_id and status = 'draft') then
    raise exception 'Only a DRAFT catalog can be edited';
  end if;

  create temporary table valid_availability_pairs on commit drop as
  select distinct variant.door_line_id, variant.grain_id
  from public.door_variants variant
  join public.door_lines line on line.id = variant.door_line_id
  where variant.catalog_revision_id = v_revision_id
    and line.status = 'active'
    and line.customer_selectable;

  select count(*) into v_valid_pair_count from valid_availability_pairs;
  select count(*), count(distinct (door_line_id::text || ':' || coalesce(grain_id::text, 'none')))
  into v_input_count, v_distinct_input_count
  from jsonb_to_recordset(p_variant_availability)
    as input(door_line_id uuid, grain_id uuid, customer_selectable boolean);

  if v_input_count <> v_valid_pair_count or v_distinct_input_count <> v_valid_pair_count then
    raise exception 'Availability must include every supported catalog option exactly once';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_variant_availability)
      as input(door_line_id uuid, grain_id uuid, customer_selectable boolean)
    left join valid_availability_pairs valid
      on valid.door_line_id = input.door_line_id
     and valid.grain_id is not distinct from input.grain_id
    where valid.door_line_id is null or input.customer_selectable is null
  ) then raise exception 'Availability contains an unsupported catalog combination'; end if;
  if p_customer_selectable and not exists (
    select 1
    from jsonb_to_recordset(p_variant_availability)
      as input(door_line_id uuid, grain_id uuid, customer_selectable boolean)
    where input.customer_selectable
  ) then raise exception 'A customer-visible Door Style must have at least one available variant'; end if;

  update public.door_styles
  set display_name = btrim(p_display_name), status = p_status,
      customer_selectable = p_customer_selectable, display_order = p_display_order,
      updated_at = now()
  where id = p_door_style_id;

  update public.door_variants variant
  set customer_selectable = input.customer_selectable, updated_at = now()
  from jsonb_to_recordset(p_variant_availability)
    as input(door_line_id uuid, grain_id uuid, customer_selectable boolean)
  where variant.catalog_revision_id = v_revision_id
    and variant.door_style_id = p_door_style_id
    and variant.door_line_id = input.door_line_id
    and variant.grain_id is not distinct from input.grain_id;

  select coalesce(bool_or(supports_glass), false)
  into v_supports_glass
  from public.door_variants
  where catalog_revision_id = v_revision_id and door_style_id = p_door_style_id;

  insert into public.door_variants (
    catalog_revision_id, door_style_id, door_line_id, grain_id,
    display_name, supports_glass, status, customer_selectable, display_order,
    notes
  )
  select
    v_revision_id, p_door_style_id, input.door_line_id, input.grain_id,
    btrim(p_display_name) || ' — ' || line.display_name ||
      case when grain.display_name is not null then ' · ' || grain.display_name else '' end,
    v_supports_glass, 'active', true,
    coalesce((select max(display_order) + 1 from public.door_variants where door_style_id = p_door_style_id), 0)
      + row_number() over (order by line.display_order, grain.display_order nulls first) - 1,
    'Created by Home Guard Inventory Admin availability editor'
  from jsonb_to_recordset(p_variant_availability)
    as input(door_line_id uuid, grain_id uuid, customer_selectable boolean)
  join public.door_lines line on line.id = input.door_line_id
  left join public.grains grain on grain.id = input.grain_id
  where input.customer_selectable
    and not exists (
      select 1 from public.door_variants existing
      where existing.catalog_revision_id = v_revision_id
        and existing.door_style_id = p_door_style_id
        and existing.door_line_id = input.door_line_id
        and existing.grain_id is not distinct from input.grain_id
    );

  insert into public.catalog_change_log (
    catalog_revision_id, changed_by, entity_table, entity_id, action,
    change_summary, before_data, after_data
  ) values (
    v_revision_id, v_user_id, 'door_styles', p_door_style_id, 'update',
    'Door Style draft details and full catalog availability updated',
    v_before,
    jsonb_build_object(
      'style', (select to_jsonb(door_styles) from public.door_styles where id = p_door_style_id),
      'availability', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'variant_id', variant.id,
          'door_line_id', variant.door_line_id,
          'grain_id', variant.grain_id,
          'customer_selectable', variant.customer_selectable
        ) order by variant.display_order), '[]'::jsonb)
        from public.door_variants variant
        where variant.door_style_id = p_door_style_id
      )
    )
  );
end;
$$;

revoke all on function public.update_draft_door_style(uuid, text, text, boolean, integer, jsonb) from public;
revoke execute on function public.update_draft_door_style(uuid, text, text, boolean, integer, jsonb) from anon;
grant execute on function public.update_draft_door_style(uuid, text, text, boolean, integer, jsonb) to authenticated;
