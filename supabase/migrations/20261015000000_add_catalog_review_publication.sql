-- HGI Portal DEV: review + atomic publication. Does not connect the builder.
-- Apply to udbcnpjtwhmjzpjjhoph only. Then run the rollback acceptance script.
begin;

-- Published and draft revisions intentionally share immutable Storage objects.
drop index public.assets_storage_object_unique_idx;
create unique index assets_storage_object_unique_idx
  on public.assets(catalog_revision_id,storage_bucket,storage_object_path)
  where storage_bucket is not null and storage_object_path is not null;

alter table public.catalog_revisions
  add column base_revision_id uuid references public.catalog_revisions(id),
  add column publication_change_count integer,
  add column publication_style_count integer;
create unique index catalog_revisions_one_draft_idx on public.catalog_revisions(status) where status = 'draft';

create function public.inventory_revision_tables() returns setof text
language sql stable security definer set search_path = '' as $$
  select c.table_name::text from information_schema.columns c
  join information_schema.tables t using(table_schema,table_name)
  where c.table_schema = 'public' and c.column_name = 'catalog_revision_id'
    and t.table_type = 'BASE TABLE' and c.table_name not in ('catalog_change_log','catalog_review_baselines')
  order by c.table_name;
$$;

create table public.catalog_review_baselines (
  catalog_revision_id uuid primary key references public.catalog_revisions(id),
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.catalog_review_baselines enable row level security;
grant select on public.catalog_review_baselines to authenticated;
create policy "Admins read review baselines" on public.catalog_review_baselines for select to authenticated
  using (exists(select 1 from public.home_guard_admins where user_id = auth.uid()));

create function public.inventory_require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.home_guard_admins where user_id = auth.uid()) then
    raise exception 'Home Guard Admin access is required' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create function public.inventory_door_snapshot(p_revision uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'styles', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]') from public.door_styles s where s.catalog_revision_id = p_revision),
    'variants', (select coalesce(jsonb_agg(to_jsonb(v) order by v.id),'[]') from public.door_variants v where v.catalog_revision_id = p_revision),
    'bindings', (select coalesce(jsonb_agg(to_jsonb(b) order by b.id),'[]') from public.door_variant_assets b where b.catalog_revision_id = p_revision),
    'assets', (select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]') from public.assets a where a.catalog_revision_id = p_revision)
  );
$$;

-- Bootstrap the first imported draft from structured BEFORE values, so edits
-- made before this feature are not silently accepted as the review baseline.
do $$
declare r record; entry record; snap jsonb; prior jsonb; sid text;
begin
  for r in select id from public.catalog_revisions where status = 'draft' loop
    snap := public.inventory_door_snapshot(r.id);
    for entry in select * from public.catalog_change_log where catalog_revision_id = r.id and action = 'update' order by created_at desc,id desc loop
      if entry.entity_table = 'door_styles' then
        prior := coalesce(entry.before_data->'style',entry.before_data);
        sid := coalesce(prior->>'id',entry.entity_id::text);
        if prior ? 'display_name' then
          snap := jsonb_set(snap,'{styles}',(select jsonb_agg(case when item->>'id' = sid then item || prior else item end) from jsonb_array_elements(snap->'styles') item));
        end if;
        if jsonb_typeof(entry.before_data->'availability') = 'array' then
          snap := jsonb_set(snap,'{variants}',coalesce((
            select jsonb_agg(case when item->>'door_style_id' = sid then item || (a - 'variant_id') else item end)
            from jsonb_array_elements(snap->'variants') item
            left join jsonb_array_elements(entry.before_data->'availability') a on a->>'variant_id' = item->>'id'
            where item->>'door_style_id' <> sid or a is not null
          ),'[]'));
        end if;
      elsif entry.entity_table = 'assets' and entry.before_data ? 'asset_id' and entry.after_data ? 'door_style_id' then
        snap := jsonb_set(snap,'{bindings}',coalesce((
          select jsonb_agg(case when
            (entry.before_data ? 'binding_id' and b->>'id' = entry.before_data->>'binding_id') or
            (not (entry.before_data ? 'binding_id') and b->>'role' = 'thumbnail'
              and b->>'asset_id' = entry.after_data->>'asset_id'
              and exists(select 1 from jsonb_array_elements(snap->'variants') v where v->>'id' = b->>'door_variant_id' and v->>'door_style_id' = entry.after_data->>'door_style_id'))
            then b || jsonb_build_object('asset_id',entry.before_data->'asset_id') else b end)
          from jsonb_array_elements(snap->'bindings') b
        ),'[]'));
      end if;
    end loop;
    insert into public.catalog_review_baselines values(r.id,snap,now());
  end loop;
end;
$$;

create function public.inventory_door_changes(p_revision uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with base as (select snapshot from public.catalog_review_baselines where catalog_revision_id = p_revision),
  bs as (select * from jsonb_to_recordset((select snapshot->'styles' from base)) as s(id uuid,display_name text,status text,customer_selectable boolean,display_order integer)),
  bv as (select * from jsonb_to_recordset((select snapshot->'variants' from base)) as v(id uuid,door_style_id uuid,door_line_id uuid,grain_id uuid,customer_selectable boolean,status text)),
  bb as (select * from jsonb_to_recordset((select snapshot->'bindings' from base)) as b(id uuid,door_variant_id uuid,asset_id uuid,role text,view_key text)),
  ba as (select * from jsonb_to_recordset((select snapshot->'assets' from base)) as a(id uuid,checksum text,current_path text,storage_bucket text,storage_object_path text)),
  changes as (
    select s.id as style_id, x.kind, x.label, x.old_value, x.new_value, ''::text as context, null::uuid as before_asset, null::uuid as after_asset
    from public.door_styles s left join bs on bs.id = s.id
    cross join lateral (values
      ('name','Name',to_jsonb(bs.display_name),to_jsonb(s.display_name)),
      ('status','Status',to_jsonb(bs.status),to_jsonb(s.status)),
      ('visibility','Customer visibility',to_jsonb(bs.customer_selectable),to_jsonb(s.customer_selectable)),
      ('order','Display order',to_jsonb(bs.display_order),to_jsonb(s.display_order))
    ) x(kind,label,old_value,new_value)
    where s.catalog_revision_id = p_revision and x.old_value is distinct from x.new_value
    union all
    select v.door_style_id,case when v.grain_id is null then 'availability' else 'grain_availability' end,
      'Availability',to_jsonb(coalesce(bv.customer_selectable,false) and coalesce(bv.status='active',false)),to_jsonb(v.customer_selectable and v.status='active'),
      l.display_name || coalesce(' / ' || g.display_name,''),null,null
    from public.door_variants v left join bv on bv.id = v.id
    join public.door_lines l on l.id = v.door_line_id left join public.grains g on g.id = v.grain_id
    where v.catalog_revision_id = p_revision and (bv.id is null or (bv.customer_selectable and bv.status='active') is distinct from (v.customer_selectable and v.status='active'))
    union all
    select v.door_style_id,case b.role when 'thumbnail' then 'thumbnail' when 'mask' then 'mask' else 'render' end,
      case b.role when 'thumbnail' then 'Thumbnail' when 'mask' then 'Mask' else 'Render artwork' end,
      to_jsonb(coalesce(ba.storage_object_path,ba.current_path)),to_jsonb(coalesce(a.storage_object_path,a.current_path)),
      case when b.role = 'thumbnail' then '' else l.display_name || coalesce(' / ' || g.display_name,'') || coalesce(' · ' || nullif(b.view_key,''),'') end,
      bb.asset_id,b.asset_id
    from public.door_variant_assets b join public.door_variants v on v.id=b.door_variant_id
    join public.door_lines l on l.id=v.door_line_id left join public.grains g on g.id=v.grain_id
    join public.assets a on a.id=b.asset_id left join bb on bb.id=b.id left join ba on ba.id=bb.asset_id
    where b.catalog_revision_id=p_revision and b.role in ('thumbnail','slab_render','mask')
      and (bb.asset_id is distinct from b.asset_id or ba.checksum is distinct from a.checksum or ba.storage_object_path is distinct from a.storage_object_path)
  ), unique_changes as (select distinct * from changes)
  select coalesce(jsonb_agg(jsonb_build_object(
    'styleId',c.style_id,'styleName',s.display_name,'type',c.kind,'label',c.label,
    'before',c.old_value,'after',c.new_value,'context',c.context,
    'beforeAssetId',c.before_asset,'afterAssetId',c.after_asset,
    'changedAt',recent.created_at,'changedBy',recent.email
  ) order by s.display_name,c.kind,c.context),'[]')
  from unique_changes c join public.door_styles s on s.id=c.style_id
  left join lateral (
    select log.created_at,u.email from public.catalog_change_log log left join auth.users u on u.id=log.changed_by
    where log.catalog_revision_id=p_revision and log.action='update'
      and (log.entity_id=c.style_id or log.after_data->>'door_style_id'=c.style_id::text)
    order by log.created_at desc,log.id desc limit 1
  ) recent on true;
$$;

create function public.inventory_revision_fingerprint(p_revision uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare t text; part text; combined text := '';
begin
  for t in select public.inventory_revision_tables() loop
    execute format('select md5(coalesce(string_agg(to_jsonb(s)::text,'''' order by id),'''')) from public.%I s where catalog_revision_id=$1',t) into part using p_revision;
    combined := combined || t || part;
  end loop;
  return md5(combined);
end;
$$;

create function public.inventory_validate_revision(p_revision uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare errors jsonb := '[]'; item record; n bigint;
begin
  if not exists(select 1 from public.catalog_revisions where id=p_revision and status='draft') then
    return jsonb_build_array(jsonb_build_object('message','Only a DRAFT catalog can be published.','styleId',null));
  end if;
  if not exists(select 1 from public.catalog_review_baselines where catalog_revision_id=p_revision) then
    errors := errors || jsonb_build_array(jsonb_build_object('message','The review baseline is missing.','styleId',null));
  end if;
  if jsonb_array_length(public.inventory_door_changes(p_revision))=0 then
    errors := errors || jsonb_build_array(jsonb_build_object('message','There are no pending door changes to publish.','styleId',null));
  end if;
  for item in
    select s.id style_id,'A visible Door Style needs at least one active, available variant.' message
    from public.door_styles s where s.catalog_revision_id=p_revision and s.customer_selectable
      and (s.status<>'active' or not exists(select 1 from public.door_variants v where v.door_style_id=s.id and v.status='active' and v.customer_selectable))
    union all
    select v.door_style_id,'Duplicate material / grain variants must be resolved.' from public.door_variants v
    where v.catalog_revision_id=p_revision group by v.door_style_id,v.door_line_id,v.grain_id having count(*)>1
    union all
    select v.door_style_id,'An available variant has an invalid material, series or grain relationship.'
    from public.door_variants v join public.door_lines l on l.id=v.door_line_id
    join public.materials m on m.id=l.material_id left join public.series se on se.id=l.series_id left join public.grains g on g.id=v.grain_id
    where v.catalog_revision_id=p_revision and v.customer_selectable and (
      v.status<>'active' or l.status<>'active' or not l.customer_selectable or m.status<>'active'
      or (se.id is not null and (se.status<>'active' or (se.material_id is not null and se.material_id<>m.id)))
      or (g.id is not null and g.status<>'active')
      or not exists(select 1 from public.catalog_review_baselines b,
        jsonb_to_recordset(b.snapshot->'variants') as prior(door_line_id uuid,grain_id uuid)
        where b.catalog_revision_id=p_revision and prior.door_line_id=v.door_line_id and prior.grain_id is not distinct from v.grain_id))
    union all
    select v.door_style_id,'An available variant needs a verified product code, finish compatibility and glass compatibility where applicable.'
    from public.door_variants v where v.catalog_revision_id=p_revision and (
      v.customer_selectable or not exists(select 1 from public.catalog_review_baselines baseline,
        jsonb_array_elements(baseline.snapshot->'variants') prior
        where baseline.catalog_revision_id=p_revision and prior->>'id'=v.id::text)
    ) and (
      nullif(btrim(v.product_code),'') is null or nullif(btrim(v.display_name),'') is null
      or not exists(select 1 from public.door_variant_finishes f where f.door_variant_id=v.id and f.customer_selectable)
      or (v.supports_glass and (nullif(btrim(v.opening_code),'') is null or not exists(select 1 from public.door_variant_glass_options g where g.door_variant_id=v.id and g.customer_selectable))))
    union all
    select v.door_style_id,'An available variant is missing a thumbnail, render or required glass mask.'
    from public.door_variants v join public.door_styles s on s.id=v.door_style_id
    where v.catalog_revision_id=p_revision and v.customer_selectable and s.customer_selectable and (
      not exists(select 1 from public.door_variant_assets b where b.door_variant_id=v.id and b.role='thumbnail')
      or not exists(select 1 from public.door_variant_assets b where b.door_variant_id=v.id and b.role='slab_render')
      or (v.supports_glass and not exists(select 1 from public.door_variant_assets b where b.door_variant_id=v.id and b.role='mask')))
    union all
    select distinct v.door_style_id,'A required door asset has missing/invalid metadata or an unresolved Storage object.'
    from public.door_variant_assets b join public.door_variants v on v.id=b.door_variant_id
    join public.door_styles s on s.id=v.door_style_id join public.assets a on a.id=b.asset_id
    left join storage.objects o on o.bucket_id=a.storage_bucket and o.name=a.storage_object_path
    where b.catalog_revision_id=p_revision and v.customer_selectable and s.customer_selectable
      and b.role in ('thumbnail','slab_render','mask') and (
        a.width is null or a.width<=0 or a.height is null or a.height<=0 or a.byte_size is null or a.byte_size<=0
        or a.checksum is null or a.checksum !~ '^[0-9a-f]{64}$' or a.mime_type is null or a.mime_type not in ('image/png','image/jpeg','image/webp')
        or a.storage_bucket is distinct from 'door-catalog-assets' or a.storage_object_path is null or o.id is null
        or coalesce((o.metadata->>'size')::bigint,-1)<>a.byte_size
        or coalesce(o.metadata->>'mimetype',o.metadata->>'contentType','')<>a.mime_type)
  loop
    errors := errors || jsonb_build_array(jsonb_build_object('message',item.message,'styleId',item.style_id));
  end loop;
  -- Check every revision-scoped FK, including compatibility categories beyond
  -- doors. Normal FK constraints prove existence; this also proves same revision.
  for item in
    select con.conrelid::regclass rel,con.confrelid::regclass parent,a.attname col
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_attribute a on a.attrelid=con.conrelid and a.attnum=con.conkey[1]
    where con.contype='f' and array_length(con.conkey,1)=1
      and con.conrelid in (select ('public.'||quote_ident(t))::regclass from public.inventory_revision_tables() t)
      and con.confrelid in (select ('public.'||quote_ident(t))::regclass from public.inventory_revision_tables() t)
  loop
    execute format('select count(*) from %s c left join %s p on p.id=c.%I where c.catalog_revision_id=$1 and c.%I is not null and (p.id is null or p.catalog_revision_id<>$1)',item.rel,item.parent,item.col,item.col) into n using p_revision;
    if n>0 then errors := errors || jsonb_build_array(jsonb_build_object('message','A catalog relationship crosses revisions or is missing: '||item.rel||'.'||item.col,'styleId',null)); end if;
  end loop;
  return errors;
end;
$$;

-- Each write holds a shared revision lock through commit. Publish takes the
-- exclusive lock first, preventing late saves from modifying its reviewed data.
create function public.inventory_guard_draft_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare rid uuid; state text;
begin
  if tg_op='UPDATE' and new.catalog_revision_id<>old.catalog_revision_id then raise exception 'Catalog rows cannot move between revisions'; end if;
  rid := case when tg_op='DELETE' then old.catalog_revision_id else new.catalog_revision_id end;
  select status into state from public.catalog_revisions where id=rid for share;
  if state is distinct from 'draft' then raise exception 'Published and historical catalogs are read only'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
do $$ declare t text; begin
  for t in select public.inventory_revision_tables() loop
    execute format('create trigger inventory_draft_only before insert or update or delete on public.%I for each row execute function public.inventory_guard_draft_write()',t);
  end loop;
end; $$;

create function public.inventory_guard_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('hgi.catalog_publication',true) is distinct from 'on' or current_user not in ('postgres','supabase_admin') then
    raise exception 'Catalog revisions are managed only by the publish workflow';
  end if;
  if tg_op='DELETE' then raise exception 'Catalog revision history cannot be deleted'; end if;
  return new;
end;
$$;
create trigger inventory_revision_workflow before insert or update or delete on public.catalog_revisions
  for each row execute function public.inventory_guard_revision();
revoke insert,update,delete on public.catalog_revisions,public.catalog_change_log from authenticated;

create function public.inventory_guard_audit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op<>'INSERT' then raise exception 'Catalog history is append only'; end if;
  if not exists(select 1 from public.catalog_revisions where id=new.catalog_revision_id and status='draft')
    and not (coalesce(current_setting('hgi.catalog_publication',true)='on',false) and current_user in ('postgres','supabase_admin')) then
    raise exception 'Historical catalog audit records are immutable';
  end if;
  return new;
end;
$$;
create trigger inventory_audit_append_only before insert or update or delete on public.catalog_change_log
  for each row execute function public.inventory_guard_audit();

-- Shared immutable objects are reused by the next draft, not copied or moved.
create function public.inventory_asset_is_historical(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.assets a join public.catalog_revisions r on r.id=a.catalog_revision_id
    where r.status in ('published','retired') and a.storage_bucket=p_bucket and a.storage_object_path=p_path);
$$;
create function public.inventory_asset_is_current(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.assets a join public.catalog_revisions r on r.id=a.catalog_revision_id
    where r.status='published' and a.storage_bucket=p_bucket and a.storage_object_path=p_path);
$$;
drop policy "Published catalog assets are readable" on storage.objects;
create policy "Published catalog assets are readable" on storage.objects for select to anon,authenticated
  using(bucket_id='door-catalog-assets' and public.inventory_asset_is_current(bucket_id,name));
drop policy "Home Guard admins can replace catalog assets" on storage.objects;
create policy "Home Guard admins can replace catalog assets" on storage.objects for update to authenticated
  using(bucket_id='door-catalog-assets' and not public.inventory_asset_is_historical(bucket_id,name) and exists(select 1 from public.home_guard_admins where user_id=auth.uid()))
  with check(bucket_id='door-catalog-assets' and not public.inventory_asset_is_historical(bucket_id,name) and exists(select 1 from public.home_guard_admins where user_id=auth.uid()));
drop policy "Home Guard admins can delete catalog assets" on storage.objects;
create policy "Home Guard admins can delete catalog assets" on storage.objects for delete to authenticated
  using(bucket_id='door-catalog-assets' and not public.inventory_asset_is_historical(bucket_id,name) and exists(select 1 from public.home_guard_admins where user_id=auth.uid()));

create function public.inventory_clone_revision(p_source uuid,p_destination uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t text; todo text[]; done text[] := '{}'; refs text; item record; progressed boolean;
begin
  create temporary table inventory_clone_ids(old_id uuid primary key,new_id uuid not null) on commit drop;
  select array_agg(x) into todo from public.inventory_revision_tables() x;
  foreach t in array todo loop
    execute format('insert into pg_temp.inventory_clone_ids select id,gen_random_uuid() from public.%I where catalog_revision_id=$1',t) using p_source;
  end loop;
  while cardinality(todo)>0 loop
    progressed := false;
    foreach t in array todo loop
      if exists(select 1 from pg_catalog.pg_constraint c join pg_catalog.pg_class parent on parent.oid=c.confrelid
        where c.contype='f' and c.conrelid=('public.'||quote_ident(t))::regclass and parent.relname=any(todo)) then continue; end if;
      refs := '';
      for item in select a.attname col from pg_catalog.pg_constraint c
        join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
        where c.contype='f' and c.conrelid=('public.'||quote_ident(t))::regclass
        and c.confrelid in (select ('public.'||quote_ident(x))::regclass from public.inventory_revision_tables() x)
      loop
        refs := refs || format(' || jsonb_build_object(%L,(select new_id from pg_temp.inventory_clone_ids where old_id=src.%I))',item.col,item.col);
      end loop;
      execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,to_jsonb(src) || jsonb_build_object(''id'',ids.new_id,''catalog_revision_id'',$2) %s)).* from public.%I src join pg_temp.inventory_clone_ids ids on ids.old_id=src.id where src.catalog_revision_id=$1',t,t,refs,t) using p_source,p_destination;
      done := array_append(done,t); todo := array_remove(todo,t); progressed := true;
    end loop;
    if not progressed then raise exception 'Catalog clone has an unsupported relationship cycle'; end if;
  end loop;
  drop table pg_temp.inventory_clone_ids;
end;
$$;

create function public.review_door_catalog(p_revision uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare rid uuid; changes jsonb;
begin
  perform public.inventory_require_admin();
  select id into rid from public.catalog_revisions where status='draft' and (p_revision is null or id=p_revision);
  if rid is null then raise exception 'No editable DRAFT catalog is available'; end if;
  changes := public.inventory_door_changes(rid);
  return jsonb_build_object('revision',(select to_jsonb(r) from public.catalog_revisions r where id=rid),
    'changes',changes,'fingerprint',public.inventory_revision_fingerprint(rid),
    'errors',public.inventory_validate_revision(rid),
    'styleCount',(select count(*) from public.door_styles where catalog_revision_id=rid),
    'variantCount',(select count(*) from public.door_variants where catalog_revision_id=rid),
    'assets',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'bucket',a.storage_bucket,'path',a.storage_object_path)),'[]')
      from public.assets a where a.catalog_revision_id=rid and exists(select 1 from jsonb_array_elements(changes) c where c->>'beforeAssetId'=a.id::text or c->>'afterAssetId'=a.id::text)),
    'history',(select coalesce(jsonb_agg(h order by h.published_at desc),'[]') from (
      select r.id,r.status,r.base_revision_id,r.published_at,u.email as published_by,r.publication_change_count,r.publication_style_count
      from public.catalog_revisions r left join auth.users u on u.id=r.published_by where r.published_at is not null
    ) h));
end;
$$;

create function public.publish_door_catalog(p_revision uuid,p_fingerprint text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid; state text; failures jsonb; changes jsonb; new_draft uuid := gen_random_uuid(); previous uuid;
begin
  actor := public.inventory_require_admin();
  perform pg_advisory_xact_lock(hashtext('hgi.catalog.publication'));
  select status into state from public.catalog_revisions where id=p_revision for update;
  if state is distinct from 'draft' then raise exception 'This revision is no longer DRAFT; refresh the review'; end if;
  if p_fingerprint is distinct from public.inventory_revision_fingerprint(p_revision) then raise exception 'The catalog changed after review. Refresh and review the latest changes.'; end if;
  failures := public.inventory_validate_revision(p_revision);
  if jsonb_array_length(failures)>0 then raise exception 'Catalog validation failed' using detail=failures::text; end if;
  changes := public.inventory_door_changes(p_revision);
  perform set_config('hgi.catalog_publication','on',true);
  select id into previous from public.catalog_revisions where status='published' for update;
  update public.catalog_revisions set status='retired',updated_at=now() where id=previous;
  update public.catalog_revisions set status='published',published_at=now(),published_by=actor,updated_at=now(),
    publication_change_count=jsonb_array_length(changes),publication_style_count=(select count(distinct c->>'styleId') from jsonb_array_elements(changes) c)
    where id=p_revision;
  insert into public.catalog_revisions(id,status,source_commit,notes,base_revision_id)
    select new_draft,'draft',source_commit,'Editable draft cloned from published catalog',id from public.catalog_revisions where id=p_revision;
  perform public.inventory_clone_revision(p_revision,new_draft);
  insert into public.catalog_review_baselines(catalog_revision_id,snapshot) values(new_draft,public.inventory_door_snapshot(new_draft));
  insert into public.catalog_change_log(catalog_revision_id,changed_by,entity_table,entity_id,action,change_summary,before_data,after_data)
    values(p_revision,actor,'catalog_revisions',p_revision,'publish','Reviewed Door Catalog published; next DRAFT cloned',
      jsonb_build_object('status','draft','previousPublishedRevision',previous),
      jsonb_build_object('status','published','newDraftRevision',new_draft,'reviewedChanges',changes));
  perform set_config('hgi.catalog_publication','off',true);
  return jsonb_build_object('publishedRevisionId',p_revision,'draftRevisionId',new_draft,'changeCount',jsonb_array_length(changes));
end;
$$;

-- No private SECURITY DEFINER helper is callable from the browser or anon role.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'inventory_%' or p.proname in ('review_door_catalog','publish_door_catalog'))
  loop execute format('revoke all on function %s from public,anon,authenticated',f.signature); end loop;
end; $$;
grant execute on function public.review_door_catalog(uuid),public.publish_door_catalog(uuid,text) to authenticated;
grant execute on function public.inventory_asset_is_current(text,text),public.inventory_asset_is_historical(text,text) to anon,authenticated;
comment on function public.publish_door_catalog(uuid,text) is 'Admin-only atomic publication, stale-review guard, full revision clone. Does not switch customer runtime.';
commit;
