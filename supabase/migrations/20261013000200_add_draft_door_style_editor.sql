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
  v_variant_count integer;
  v_input_count integer;
  v_distinct_input_count integer;
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

  select catalog_revision_id, to_jsonb(door_styles)
  into v_revision_id, v_before
  from public.door_styles
  where id = p_door_style_id
  for update;
  if v_revision_id is null then raise exception 'Door Style was not found'; end if;
  if not exists (select 1 from public.catalog_revisions where id = v_revision_id and status = 'draft') then
    raise exception 'Only a DRAFT catalog can be edited';
  end if;

  select count(*) into v_variant_count from public.door_variants
  where door_style_id = p_door_style_id and catalog_revision_id = v_revision_id;
  select count(*), count(distinct variant_id)
  into v_input_count, v_distinct_input_count
  from jsonb_to_recordset(p_variant_availability) as input(variant_id uuid, customer_selectable boolean);

  if v_input_count <> v_variant_count or v_distinct_input_count <> v_variant_count then
    raise exception 'Availability must include every existing Door Style variant exactly once';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_variant_availability) as input(variant_id uuid, customer_selectable boolean)
    left join public.door_variants variant
      on variant.id = input.variant_id
     and variant.door_style_id = p_door_style_id
     and variant.catalog_revision_id = v_revision_id
    where variant.id is null or input.customer_selectable is null
  ) then raise exception 'Availability contains an invalid variant'; end if;
  if p_customer_selectable and not exists (
    select 1 from jsonb_to_recordset(p_variant_availability) as input(variant_id uuid, customer_selectable boolean)
    where input.customer_selectable
  ) then raise exception 'A customer-visible Door Style must have at least one available variant'; end if;

  update public.door_styles
  set display_name = btrim(p_display_name), status = p_status,
      customer_selectable = p_customer_selectable, display_order = p_display_order,
      updated_at = now()
  where id = p_door_style_id;

  update public.door_variants variant
  set customer_selectable = input.customer_selectable, updated_at = now()
  from jsonb_to_recordset(p_variant_availability) as input(variant_id uuid, customer_selectable boolean)
  where variant.id = input.variant_id;

  insert into public.catalog_change_log (
    catalog_revision_id, changed_by, entity_table, entity_id, action,
    change_summary, before_data, after_data
  ) values (
    v_revision_id, v_user_id, 'door_styles', p_door_style_id, 'update',
    'Door Style draft details and existing variant availability updated',
    v_before,
    (select to_jsonb(door_styles) from public.door_styles where id = p_door_style_id)
  );
end;
$$;

revoke all on function public.update_draft_door_style(uuid, text, text, boolean, integer, jsonb) from public;
grant execute on function public.update_draft_door_style(uuid, text, text, boolean, integer, jsonb) to authenticated;
