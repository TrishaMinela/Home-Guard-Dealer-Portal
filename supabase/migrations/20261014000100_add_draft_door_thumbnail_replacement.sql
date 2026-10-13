create or replace function public.replace_draft_door_style_thumbnail(
  p_door_style_id uuid,
  p_previous_asset_id uuid,
  p_storage_object_path text,
  p_mime_type text,
  p_width integer,
  p_height integer,
  p_byte_size bigint,
  p_checksum text,
  p_original_filename text
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
  v_previous public.assets%rowtype;
  v_new_asset_id uuid;
  v_next_version integer;
  v_binding_count integer;
  v_object_size bigint;
  v_object_mime text;
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  if not exists (select 1 from public.home_guard_admins where user_id = v_user_id) then
    raise exception 'Home Guard Admin access is required';
  end if;
  if p_mime_type not in ('image/png', 'image/jpeg', 'image/webp') then raise exception 'Unsupported thumbnail file type'; end if;
  if p_byte_size is null or p_byte_size < 1 or p_byte_size > 10485760 then raise exception 'Thumbnail file size is invalid'; end if;
  if p_width is null or p_width < 1 or p_height is null or p_height < 1 then raise exception 'Thumbnail dimensions are invalid'; end if;
  if p_checksum !~ '^[0-9a-f]{64}$' then raise exception 'Thumbnail checksum is invalid'; end if;
  if nullif(btrim(p_original_filename), '') is null then raise exception 'Thumbnail filename is required'; end if;

  select style.catalog_revision_id, revision.status,
         coalesce(style.product_code, style.internal_code, style.legacy_id, style.id::text)
  into v_revision_id, v_revision_status, v_style_code
  from public.door_styles style
  join public.catalog_revisions revision on revision.id = style.catalog_revision_id
  where style.id = p_door_style_id
  for update of style;
  if v_revision_id is null then raise exception 'Door Style was not found'; end if;
  if v_revision_status <> 'draft' then raise exception 'Only a DRAFT catalog thumbnail can be replaced'; end if;

  v_style_path := trim(both '-' from regexp_replace(lower(v_style_code), '[^a-z0-9]+', '-', 'g'));
  if p_storage_object_path !~ ('^revisions/' || v_revision_id::text || '/styles/' || v_style_path || '/thumbnails/v[0-9]+/[0-9a-f]{12}-[a-z0-9-]+\.(png|jpg|jpeg|webp)$') then
    raise exception 'Thumbnail Storage path is not valid for this Door Style revision';
  end if;
  if split_part(split_part(p_storage_object_path, '/thumbnails/v', 2), '/', 1)::integer < 2 then
    raise exception 'Replacement thumbnail must use a new content version';
  end if;
  if position(left(p_checksum, 12) in split_part(p_storage_object_path, '/', 7)) <> 1 then
    raise exception 'Thumbnail Storage path does not match its checksum';
  end if;

  select asset.* into v_previous
  from public.assets asset
  where asset.id = p_previous_asset_id and asset.catalog_revision_id = v_revision_id
  for update;
  if v_previous.id is null then raise exception 'Current thumbnail asset was not found'; end if;

  select count(*) into v_binding_count
  from public.door_variant_assets binding
  join public.door_variants variant on variant.id = binding.door_variant_id
  where variant.door_style_id = p_door_style_id
    and binding.role = 'thumbnail'
    and binding.asset_id = p_previous_asset_id;
  if v_binding_count = 0 then raise exception 'Current thumbnail binding was not found'; end if;
  if exists (
    select 1 from public.door_variant_assets binding
    join public.door_variants variant on variant.id = binding.door_variant_id
    where variant.door_style_id = p_door_style_id and binding.role = 'thumbnail'
      and binding.asset_id <> p_previous_asset_id
  ) then raise exception 'Door Style has multiple thumbnail assets and requires manual review'; end if;

  select coalesce((object.metadata ->> 'size')::bigint, -1),
         coalesce(object.metadata ->> 'mimetype', object.metadata ->> 'contentType')
  into v_object_size, v_object_mime
  from storage.objects object
  where object.bucket_id = 'door-catalog-assets' and object.name = p_storage_object_path;
  if v_object_size <> p_byte_size then raise exception 'Uploaded thumbnail size does not match'; end if;
  if v_object_mime is distinct from p_mime_type then raise exception 'Uploaded thumbnail type does not match'; end if;

  select coalesce(max(content_version), 0) + 1 into v_next_version
  from public.assets
  where catalog_revision_id = v_revision_id and current_path = v_previous.current_path;
  if p_storage_object_path not like '%/v' || v_next_version::text || '/%' then
    raise exception 'Thumbnail content version is stale; refresh and try again';
  end if;

  insert into public.assets (
    catalog_revision_id, current_path, mime_type, width, height, byte_size,
    checksum, has_transparency, content_version, provenance, source, notes,
    storage_bucket, storage_object_path
  ) values (
    v_revision_id, v_previous.current_path, p_mime_type, p_width, p_height, p_byte_size,
    p_checksum, case when p_mime_type in ('image/png', 'image/webp') then null else false end,
    v_next_version, v_previous.provenance, 'inventory_admin_upload',
    'Original filename: ' || btrim(p_original_filename),
    'door-catalog-assets', p_storage_object_path
  ) returning id into v_new_asset_id;

  update public.door_variant_assets binding
  set asset_id = v_new_asset_id
  from public.door_variants variant
  where variant.id = binding.door_variant_id
    and variant.door_style_id = p_door_style_id
    and binding.role = 'thumbnail'
    and binding.asset_id = p_previous_asset_id;

  insert into public.catalog_change_log (
    catalog_revision_id, changed_by, entity_table, entity_id, action,
    change_summary, before_data, after_data
  ) values (
    v_revision_id, v_user_id, 'assets', v_new_asset_id, 'update',
    'Door Style selection thumbnail replaced in DRAFT catalog',
    jsonb_build_object('door_style_id', p_door_style_id, 'asset_id', v_previous.id, 'storage_object_path', v_previous.storage_object_path),
    jsonb_build_object('door_style_id', p_door_style_id, 'asset_id', v_new_asset_id, 'storage_object_path', p_storage_object_path, 'checksum', p_checksum)
  );

  return jsonb_build_object(
    'asset_id', v_new_asset_id,
    'previous_asset_id', v_previous.id,
    'storage_bucket', 'door-catalog-assets',
    'storage_object_path', p_storage_object_path,
    'content_version', v_next_version,
    'bindings_updated', v_binding_count,
    'catalog_status', 'draft'
  );
end;
$$;

revoke all on function public.replace_draft_door_style_thumbnail(uuid, uuid, text, text, integer, integer, bigint, text, text) from public;
revoke execute on function public.replace_draft_door_style_thumbnail(uuid, uuid, text, text, integer, integer, bigint, text, text) from anon;
grant execute on function public.replace_draft_door_style_thumbnail(uuid, uuid, text, text, integer, integer, bigint, text, text) to authenticated;
