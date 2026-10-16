-- HGI Portal DEV: one-time publication of the verified imported catalog.
-- The normal publish_door_catalog function remains unchanged and continues to
-- reject no-change publications. This function permanently becomes ineligible
-- after the first publication history row is created.
begin;

create function public.bootstrap_initial_door_catalog_baseline(
  p_revision uuid,
  p_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  revision_state text;
  revision_base uuid;
  failures jsonb;
  structural_failures jsonb;
  new_draft uuid := gen_random_uuid();
  style_count integer;
  variant_count integer;
  asset_count integer;
  mapped_asset_count integer;
  unresolved_asset_count integer;
begin
  actor := public.inventory_require_admin();
  perform pg_advisory_xact_lock(hashtext('hgi.catalog.publication'));

  select status, base_revision_id
    into revision_state, revision_base
  from public.catalog_revisions
  where id = p_revision
  for update;

  if revision_state is distinct from 'draft' then
    raise exception 'The initial baseline must be created from the current DRAFT catalog';
  end if;
  if revision_base is not null
    or (select count(*) from public.catalog_revisions) <> 1
    or exists(select 1 from public.catalog_revisions where published_at is not null or status in ('published','retired')) then
    raise exception 'Initial baseline bootstrap is no longer available';
  end if;
  if p_fingerprint is distinct from public.inventory_revision_fingerprint(p_revision) then
    raise exception 'The catalog changed after validation. Refresh and validate the latest catalog.';
  end if;
  if jsonb_array_length(public.inventory_door_changes(p_revision)) <> 0 then
    raise exception 'Initial baseline bootstrap requires a clean catalog with zero pending changes';
  end if;

  -- Keep every normal validation result except the one deliberately bypassed
  -- for this initial no-change publication.
  failures := public.inventory_validate_revision(p_revision);
  select coalesce(jsonb_agg(item), '[]'::jsonb)
    into structural_failures
  from jsonb_array_elements(failures) item
  where item->>'message' <> 'There are no pending door changes to publish.';
  if jsonb_array_length(structural_failures) > 0 then
    raise exception 'Catalog validation failed' using detail = structural_failures::text;
  end if;

  select count(*) into style_count from public.door_styles where catalog_revision_id = p_revision;
  select count(*) into variant_count from public.door_variants where catalog_revision_id = p_revision;
  select count(*) into asset_count from public.assets where catalog_revision_id = p_revision;
  select count(*) into mapped_asset_count from public.assets
    where catalog_revision_id = p_revision
      and storage_bucket = 'door-catalog-assets'
      and storage_object_path is not null;
  select count(*) into unresolved_asset_count
  from public.assets a
  left join storage.objects o
    on o.bucket_id = a.storage_bucket and o.name = a.storage_object_path
  where a.catalog_revision_id = p_revision
    and a.storage_bucket = 'door-catalog-assets'
    and a.storage_object_path is not null
    and o.id is null;

  if style_count <> 42 or variant_count <> 127 or asset_count <> 919
    or mapped_asset_count <> 159 or unresolved_asset_count <> 0 then
    raise exception 'Verified initial catalog counts or Storage coverage changed; baseline publication stopped'
      using detail = jsonb_build_object(
        'doorStyles', style_count,
        'doorVariants', variant_count,
        'inventoryAssets', asset_count,
        'mappedDoorAssets', mapped_asset_count,
        'unresolvedDoorAssets', unresolved_asset_count
      )::text;
  end if;

  perform set_config('hgi.catalog_publication', 'on', true);
  update public.catalog_revisions
  set status = 'published',
      published_at = now(),
      published_by = actor,
      updated_at = now(),
      publication_change_count = 0,
      publication_style_count = 0
  where id = p_revision;

  insert into public.catalog_revisions(id, status, source_commit, notes, base_revision_id)
  select new_draft, 'draft', source_commit,
    'Editable DRAFT cloned from the initial verified published baseline', id
  from public.catalog_revisions
  where id = p_revision;

  perform public.inventory_clone_revision(p_revision, new_draft);
  insert into public.catalog_review_baselines(catalog_revision_id, snapshot)
  values(new_draft, public.inventory_door_snapshot(new_draft));

  insert into public.catalog_change_log(
    catalog_revision_id, changed_by, entity_table, entity_id, action,
    change_summary, before_data, after_data
  ) values (
    p_revision, actor, 'catalog_revisions', p_revision, 'baseline_publish',
    'Initial verified Door Catalog baseline published; fresh DRAFT cloned',
    jsonb_build_object(
      'status', 'draft',
      'pendingChanges', 0,
      'doorStyles', style_count,
      'doorVariants', variant_count,
      'inventoryAssets', asset_count,
      'mappedDoorAssets', mapped_asset_count
    ),
    jsonb_build_object(
      'status', 'published',
      'newDraftRevision', new_draft,
      'publicationKind', 'initial_baseline'
    )
  );
  perform set_config('hgi.catalog_publication', 'off', true);

  return jsonb_build_object(
    'publishedRevisionId', p_revision,
    'draftRevisionId', new_draft,
    'publicationKind', 'initial_baseline',
    'changeCount', 0,
    'styleCount', style_count,
    'variantCount', variant_count,
    'assetCount', asset_count,
    'mappedDoorAssetCount', mapped_asset_count
  );
end;
$$;

revoke all on function public.bootstrap_initial_door_catalog_baseline(uuid, text)
  from public, anon, authenticated;
grant execute on function public.bootstrap_initial_door_catalog_baseline(uuid, text)
  to authenticated;

comment on function public.bootstrap_initial_door_catalog_baseline(uuid, text) is
  'One-time HGI-admin bootstrap for the initial verified no-change catalog baseline. Permanently ineligible after first publication; customer runtime is unchanged.';

commit;
