-- Run only against HGI Portal Dev after applying the bootstrap migration.
-- All publication mutations are rolled back.
begin;

do $$
declare
  source_revision uuid;
  published_revision uuid;
  draft_revision uuid;
  actor uuid;
  result jsonb;
  table_name text;
  published_count bigint;
  draft_count bigint;
  blocked boolean := false;
begin
  select id into source_revision from public.catalog_revisions where status = 'draft';
  select user_id into actor from public.home_guard_admins order by created_at limit 1;
  if source_revision is null or actor is null then raise exception 'Required DEV fixture is missing'; end if;
  if (select count(*) from public.catalog_revisions) <> 1 then raise exception 'Bootstrap requires one initial revision'; end if;

  perform set_config('request.jwt.claim.sub', actor::text, true);
  result := public.bootstrap_initial_door_catalog_baseline(
    source_revision,
    public.inventory_revision_fingerprint(source_revision)
  );
  published_revision := (result->>'publishedRevisionId')::uuid;
  draft_revision := (result->>'draftRevisionId')::uuid;

  if (select count(*) from public.catalog_revisions where status = 'published') <> 1
    or (select count(*) from public.catalog_revisions where status = 'draft') <> 1
    or (select base_revision_id from public.catalog_revisions where id = draft_revision) <> published_revision then
    raise exception 'Initial publication lifecycle is incorrect';
  end if;
  if (select count(*) from public.door_styles where catalog_revision_id = published_revision) <> 42
    or (select count(*) from public.door_variants where catalog_revision_id = published_revision) <> 127
    or (select count(*) from public.door_styles where catalog_revision_id = draft_revision) <> 42
    or (select count(*) from public.door_variants where catalog_revision_id = draft_revision) <> 127 then
    raise exception 'Published or cloned DRAFT counts are incorrect';
  end if;

  for table_name in select public.inventory_revision_tables() loop
    execute format('select count(*) from public.%I where catalog_revision_id=$1', table_name)
      into published_count using published_revision;
    execute format('select count(*) from public.%I where catalog_revision_id=$1', table_name)
      into draft_count using draft_revision;
    if published_count <> draft_count then raise exception 'Clone parity failed for %', table_name; end if;
  end loop;
  if public.inventory_door_changes(draft_revision) <> '[]'::jsonb then
    raise exception 'Fresh DRAFT contains unexpected differences';
  end if;
  if not exists(
    select 1 from public.catalog_change_log
    where catalog_revision_id = published_revision and action = 'baseline_publish'
  ) then raise exception 'Baseline publication history is missing'; end if;

  begin
    perform public.publish_door_catalog(draft_revision, public.inventory_revision_fingerprint(draft_revision));
  exception when others then
    if sqlerrm = 'Catalog validation failed' then blocked := true; else raise; end if;
  end;
  if not blocked then raise exception 'Normal no-change publication was not blocked'; end if;

  blocked := false;
  begin
    update public.door_styles set display_name = display_name where catalog_revision_id = published_revision;
  exception when others then
    if sqlerrm = 'Published and historical catalogs are read only' then blocked := true; else raise; end if;
  end;
  if not blocked then raise exception 'Published catalog remained editable'; end if;

  update public.door_styles set updated_at = now() where catalog_revision_id = draft_revision
    and id = (select id from public.door_styles where catalog_revision_id = draft_revision order by id limit 1);
  if not found then raise exception 'Fresh DRAFT is not editable'; end if;
end;
$$;

rollback;
