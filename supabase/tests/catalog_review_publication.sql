-- Run ONLY in HGI Portal Dev (udbcnpjtwhmjzpjjhoph), AFTER the migration.
-- Every test mutation, including publication, is rolled back. No Storage file is
-- uploaded/deleted. Check the SQL Editor's selected project before running.
begin;

create temporary table inventory_acceptance_results(check_name text,result text) on commit drop;
do $$
declare r uuid; s public.door_styles; actor uuid; reviewed jsonb; result jsonb;
  original_fingerprint text; child uuid; new_style uuid; t text; before_count bigint; after_count bigint;
  failure_seen boolean; availability jsonb;
begin
  r := '1af5506c-c723-5d6d-a341-93815d0205e2';
  if not exists(select 1 from public.catalog_revisions where id=r and status='draft' and published_at is null)
    or (select count(*) from public.catalog_revisions)<>1 then
    raise exception 'Expected initial DEV draft not found. Stop and review target/revision; do not adapt this test blindly.';
  end if;
  if (select count(*) from public.door_styles where catalog_revision_id=r)<>42
    or (select count(*) from public.door_variants where catalog_revision_id=r)<>127 then
    raise exception 'DEV baseline counts changed. Stop and review.';
  end if;
  select user_id into actor from public.home_guard_admins order by user_id limit 1;
  if actor is null then raise exception 'An existing Home Guard admin is required'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  original_fingerprint := public.inventory_revision_fingerprint(r);
  select * into s from public.door_styles where catalog_revision_id=r and customer_selectable order by display_order,id limit 1;

  -- Use the real Save Draft RPC with its complete availability input.
  with valid_pairs as (
    select distinct door_line_id,grain_id from public.door_variants where catalog_revision_id=r
  )
  select jsonb_agg(jsonb_build_object('door_line_id',p.door_line_id,'grain_id',p.grain_id,
    'customer_selectable',coalesce(v.customer_selectable,false))) into availability
  from valid_pairs p left join public.door_variants v on v.door_style_id=s.id
    and v.door_line_id=p.door_line_id and v.grain_id is not distinct from p.grain_id;
  perform public.update_draft_door_style(s.id,s.display_name || ' [rollback review test]',s.status,s.customer_selectable,s.display_order,availability);
  reviewed := public.review_door_catalog(r);
  if not exists(select 1 from jsonb_array_elements(reviewed->'changes') c
    where c->>'styleId'=s.id::text and c->>'type'='name' and c->>'after'=s.display_name || ' [rollback review test]') then
    raise exception 'Saved metadata missing from structured review';
  end if;
  insert into inventory_acceptance_results values('Save Draft / structured review','PASS');
  -- Opening/canceling the UI dialog never calls publish. A review RPC is read-only.
  if (select status from public.catalog_revisions where id=r)<>'draft' then raise exception 'Review published unexpectedly'; end if;
  insert into inventory_acceptance_results values('Review is read-only','PASS');

  -- An invalid fixture inside a subtransaction must block publication. Raising
  -- our marker also restores the intentionally removed bindings automatically.
  failure_seen := false;
  begin
    delete from public.door_variant_assets where role='slab_render' and door_variant_id in
      (select id from public.door_variants where door_style_id=s.id);
    begin
      perform public.publish_door_catalog(r,public.inventory_revision_fingerprint(r));
    exception when others then
      if sqlerrm<>'Catalog validation failed' then raise; end if;
      failure_seen := true;
    end;
    if not failure_seen then raise exception 'Invalid catalog was published'; end if;
    raise exception using errcode='ZX001',message='restore invalid fixture';
  exception when sqlstate 'ZX001' then null;
  end;
  insert into inventory_acceptance_results values('Invalid catalog blocks publication / fixture restored','PASS');

  reviewed := public.review_door_catalog(r);
  if jsonb_array_length(reviewed->'errors')>0 then
    raise exception 'Existing catalog validation must be reviewed before publication acceptance' using detail=(reviewed->'errors')::text;
  end if;
  result := public.publish_door_catalog(r,reviewed->>'fingerprint');
  child := (result->>'draftRevisionId')::uuid;
  if (select status from public.catalog_revisions where id=r)<>'published'
    or (select base_revision_id from public.catalog_revisions where id=child)<>r
    or (select count(*) from public.catalog_revisions where status='published')<>1
    or (select count(*) from public.catalog_revisions where status='draft')<>1 then
    raise exception 'Publication lifecycle failed';
  end if;
  -- Check EVERY actual DEV revision table, including the typed Grid/Prairie
  -- follow-up schema. Clone helper must not silently skip non-door inventory.
  for t in select public.inventory_revision_tables() loop
    execute format('select count(*) from public.%I where catalog_revision_id=$1',t) into before_count using r;
    execute format('select count(*) from public.%I where catalog_revision_id=$1',t) into after_count using child;
    if before_count<>after_count then raise exception 'Incomplete clone: %',t; end if;
    execute format('select count(*) from public.%I a join public.%I b using(id) where a.catalog_revision_id=$1 and b.catalog_revision_id=$2',t,t) into after_count using r,child;
    if after_count<>0 then raise exception 'Clone reused IDs: %',t; end if;
  end loop;
  if public.inventory_door_changes(child)<>'[]'::jsonb then raise exception 'New draft is not a clean baseline'; end if;
  insert into inventory_acceptance_results values('Atomic publication / full catalog clone / remapped IDs','PASS');

  failure_seen := false;
  begin update public.door_styles set display_name='must not save' where id=s.id;
  exception when others then
    if sqlerrm<>'Published and historical catalogs are read only' then raise; end if;
    failure_seen:=true;
  end;
  if not failure_seen then raise exception 'Published style was editable'; end if;
  select id into new_style from public.door_styles where catalog_revision_id=child and legacy_id is not distinct from s.legacy_id and internal_code is not distinct from s.internal_code limit 1;
  update public.door_styles set display_name=display_name || ' next draft test' where id=new_style;
  if jsonb_array_length(public.inventory_door_changes(child))=0 then raise exception 'New draft not editable'; end if;
  insert into inventory_acceptance_results values('Published read-only / next draft editable','PASS');

  -- A second rollback-only publication verifies retained prior history.
  perform public.publish_door_catalog(child,public.inventory_revision_fingerprint(child));
  if (select status from public.catalog_revisions where id=r)<>'retired'
    or (select count(*) from public.catalog_revisions where published_at is not null)<>2 then
    raise exception 'Publication history lost';
  end if;
  if (select public.inventory_revision_fingerprint(r)) is distinct from (
    -- The controlled Save Draft changed one name; published data must still be
    -- precisely that state after the second publication.
    reviewed->>'fingerprint') then raise exception 'Historical product data mutated'; end if;
  insert into inventory_acceptance_results values('Previous publication retained / original data immutable','PASS');
  insert into inventory_acceptance_results values('Target','HGI Portal Dev: udbcnpjtwhmjzpjjhoph'),('Catalog counts per revision','42 Door Styles / 127 variants'),('Persistence','ROLLBACK: original draft and original audit data retained');
end;
$$;

select * from inventory_acceptance_results;
rollback;

-- Must still be the original single, unpublished DRAFT after ROLLBACK.
select id,status,published_at from public.catalog_revisions order by created_at;
