create or replace function public.replace_draft_door_style_assets(
  p_door_style_id uuid,
  p_replacements jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_revision_id uuid;
  v_revision_status text;
  v_style_code text;
  v_style_path text;
  v_input_count integer;
  v_distinct_count integer;
  v_item record;
  v_previous public.assets%rowtype;
  v_new_asset_id uuid;
  v_next_version integer;
  v_object_size bigint;
  v_object_mime text;
  v_results jsonb := '[]'::jsonb;
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  if not exists (select 1 from public.home_guard_admins where user_id = v_user_id) then
    raise exception 'Home Guard Admin access is required';
  end if;
  if jsonb_typeof(p_replacements) <> 'array' then raise exception 'Asset replacements must be an array'; end if;

  select style.catalog_revision_id, revision.status,
         coalesce(style.product_code, style.internal_code, style.legacy_id, style.id::text)
  into v_revision_id, v_revision_status, v_style_code
  from public.door_styles style
  join public.catalog_revisions revision on revision.id = style.catalog_revision_id
  where style.id = p_door_style_id
  for update of style;
  if v_revision_id is null then raise exception 'Door Style was not found'; end if;
  if v_revision_status <> 'draft' then raise exception 'Only DRAFT catalog assets can be replaced'; end if;
  v_style_path := trim(both '-' from regexp_replace(lower(v_style_code), '[^a-z0-9]+', '-', 'g'));

  create temporary table requested_asset_replacements (
    binding_id uuid primary key,
    previous_asset_id uuid not null,
    role text not null,
    storage_object_path text not null unique,
    mime_type text not null,
    width integer not null,
    height integer not null,
    byte_size bigint not null,
    checksum text not null,
    original_filename text not null,
    has_transparency boolean not null
  ) on commit drop;

  insert into requested_asset_replacements
  select input.binding_id, input.previous_asset_id, input.role, input.storage_object_path,
         input.mime_type, input.width, input.height, input.byte_size, input.checksum,
         input.original_filename, input.has_transparency
  from jsonb_to_recordset(p_replacements) as input(
    binding_id uuid, previous_asset_id uuid, role text, storage_object_path text,
    mime_type text, width integer, height integer, byte_size bigint, checksum text,
    original_filename text, has_transparency boolean
  );

  select jsonb_array_length(p_replacements), count(*) into v_input_count, v_distinct_count from requested_asset_replacements;
  if v_input_count < 1 then raise exception 'Select at least one asset replacement'; end if;
  if v_input_count <> v_distinct_count then raise exception 'Duplicate or incomplete asset replacements are not allowed'; end if;
  if exists (
    select 1 from requested_asset_replacements requested
    join requested_asset_replacements duplicate on duplicate.previous_asset_id = requested.previous_asset_id and duplicate.binding_id <> requested.binding_id
  ) then raise exception 'A shared asset can only be replaced in one scoped binding per save'; end if;

  for v_item in select * from requested_asset_replacements order by binding_id loop
    if v_item.role not in ('slab_render', 'mask') then raise exception 'Unsupported asset role'; end if;
    if v_item.mime_type not in ('image/png', 'image/jpeg', 'image/webp') then raise exception 'Unsupported asset file type'; end if;
    if v_item.byte_size < 1 or v_item.byte_size > 10485760 then raise exception 'Asset file size is invalid'; end if;
    if v_item.width < 1 or v_item.height < 1 then raise exception 'Asset dimensions are invalid'; end if;
    if v_item.checksum !~ '^[0-9a-f]{64}$' then raise exception 'Asset checksum is invalid'; end if;
    if nullif(btrim(v_item.original_filename), '') is null then raise exception 'Asset filename is required'; end if;
    if v_item.role = 'mask' and (v_item.mime_type not in ('image/png', 'image/webp') or not v_item.has_transparency) then
      raise exception 'Mask replacements must preserve transparency';
    end if;

    select asset.* into v_previous
    from public.door_variant_assets binding
    join public.door_variants variant on variant.id = binding.door_variant_id
    join public.assets asset on asset.id = binding.asset_id
    where binding.id = v_item.binding_id
      and variant.door_style_id = p_door_style_id
      and binding.role = v_item.role
      and binding.asset_id = v_item.previous_asset_id
    for update of binding, asset;
    if v_previous.id is null then raise exception 'The current scoped asset binding changed; refresh and try again'; end if;
    if v_item.role = 'mask' and (v_previous.width is distinct from v_item.width or v_previous.height is distinct from v_item.height) then
      raise exception 'Mask dimensions must match the current mask exactly';
    end if;

    select coalesce(max(content_version), 0) + 1 into v_next_version
    from public.assets where catalog_revision_id = v_revision_id and current_path = v_previous.current_path;
    if v_item.storage_object_path !~ (
      '^revisions/' || v_revision_id::text || '/styles/' || v_style_path || '/' ||
      case when v_item.role = 'slab_render' then 'renders' else 'masks' end ||
      '/[a-z0-9-]+/v' || v_next_version::text || '/[0-9a-f]{12}-[a-z0-9-]+\.(png|jpg|webp)$'
    ) then raise exception 'Asset Storage path is invalid or stale'; end if;
    if position(left(v_item.checksum, 12) in split_part(v_item.storage_object_path, '/', 8)) <> 1 then
      raise exception 'Asset Storage path does not match its checksum';
    end if;

    select coalesce((object.metadata ->> 'size')::bigint, -1),
           coalesce(object.metadata ->> 'mimetype', object.metadata ->> 'contentType')
    into v_object_size, v_object_mime
    from storage.objects object
    where object.bucket_id = 'door-catalog-assets' and object.name = v_item.storage_object_path;
    if v_object_size <> v_item.byte_size then raise exception 'Uploaded asset size does not match'; end if;
    if v_object_mime is distinct from v_item.mime_type then raise exception 'Uploaded asset type does not match'; end if;

    insert into public.assets (
      catalog_revision_id, current_path, mime_type, width, height, byte_size,
      checksum, has_transparency, content_version, provenance, source, notes,
      storage_bucket, storage_object_path
    ) values (
      v_revision_id, v_previous.current_path, v_item.mime_type, v_item.width, v_item.height, v_item.byte_size,
      v_item.checksum, v_item.has_transparency, v_next_version, v_previous.provenance,
      'inventory_admin_upload', 'Original filename: ' || btrim(v_item.original_filename),
      'door-catalog-assets', v_item.storage_object_path
    ) returning id into v_new_asset_id;

    update public.door_variant_assets set asset_id = v_new_asset_id where id = v_item.binding_id;

    insert into public.catalog_change_log (
      catalog_revision_id, changed_by, entity_table, entity_id, action,
      change_summary, before_data, after_data
    ) values (
      v_revision_id, v_user_id, 'assets', v_new_asset_id, 'update',
      case when v_item.role = 'mask' then 'Door mask replaced in scoped DRAFT binding' else 'Door render replaced in scoped DRAFT binding' end,
      jsonb_build_object('door_style_id', p_door_style_id, 'binding_id', v_item.binding_id, 'asset_id', v_previous.id, 'storage_object_path', v_previous.storage_object_path),
      jsonb_build_object('door_style_id', p_door_style_id, 'binding_id', v_item.binding_id, 'asset_id', v_new_asset_id, 'storage_object_path', v_item.storage_object_path, 'checksum', v_item.checksum)
    );

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'binding_id', v_item.binding_id, 'asset_id', v_new_asset_id,
      'previous_asset_id', v_previous.id, 'role', v_item.role,
      'storage_object_path', v_item.storage_object_path, 'content_version', v_next_version
    ));
  end loop;

  return jsonb_build_object('catalog_status', 'draft', 'replacements', v_results);
end;
$$;

revoke all on function public.replace_draft_door_style_assets(uuid, jsonb) from public;
revoke execute on function public.replace_draft_door_style_assets(uuid, jsonb) from anon;
grant execute on function public.replace_draft_door_style_assets(uuid, jsonb) to authenticated;
