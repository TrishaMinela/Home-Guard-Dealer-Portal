// Isolated PostgreSQL regression checks; never connects to Supabase.
// npm install --prefix /tmp/hgi-sql-check @electric-sql/pglite --no-save
// PGLITE_MODULE=/tmp/hgi-sql-check/node_modules/@electric-sql/pglite/dist/index.js node scripts/verifyInventoryPublication.mjs
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to a local PGlite installation; no database credentials are needed.')
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()
const sql = text => db.exec(text)
const scalar = async text => Object.values((await db.query(text)).rows[0])[0]
let checks = 0
async function check(label, fn) { await fn(); checks++; console.log(`PASS ${label}`) }
async function rejects(text, pattern) { await assert.rejects(sql(text), pattern) }
const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
await sql(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema storage;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.home_guard_admins(user_id uuid primary key references auth.users(id));
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema public,auth,storage to anon,authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
grant select on storage.objects to anon;
grant select on public.home_guard_admins to authenticated;
`)
await sql(await migration('20261008000000_create_inventory_catalog_foundation'))
await sql(await migration('20261013000000_create_door_catalog_asset_storage'))
await sql(`alter table public.assets add column storage_bucket text,add column storage_object_path text;
create unique index assets_storage_object_unique_idx on public.assets(storage_bucket,storage_object_path) where storage_bucket is not null;
create table public.future_grid_fixture(id uuid primary key default gen_random_uuid(),catalog_revision_id uuid references public.catalog_revisions(id),door_variant_id uuid references public.door_variants(id),typed_meaning jsonb);
insert into auth.users values('00000000-0000-4000-8000-000000000001','admin@example.invalid'),('00000000-0000-4000-8000-000000000002','dealer@example.invalid');
insert into public.home_guard_admins values('00000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $$ declare r uuid; m uuid; l uuid; s uuid; v uuid; f uuid; a uuid;
begin
insert into catalog_revisions(id,source_commit) values('1af5506c-c723-5d6d-a341-93815d0205e2','isolated-regression-fixture') returning id into r;
insert into materials(catalog_revision_id,display_name) values(r,'Steel') returning id into m;
insert into door_lines(catalog_revision_id,material_id,display_name) values(r,m,'Smooth Steel') returning id into l;
insert into door_styles(catalog_revision_id,display_name,legacy_id) values(r,'Original door','fixture') returning id into s;
insert into door_variants(catalog_revision_id,door_style_id,door_line_id,display_name,product_code) values(r,s,l,'Original door','TEST') returning id into v;
insert into finishes(catalog_revision_id,finish_type,display_name,hex_color) values(r,'paint','White','#FFFFFF') returning id into f;
insert into door_variant_finishes(catalog_revision_id,door_variant_id,finish_id) values(r,v,f);
insert into assets(catalog_revision_id,current_path,storage_bucket,storage_object_path,width,height,byte_size,mime_type,checksum) values(r,'/test.webp','door-catalog-assets','test.webp',100,200,500,'image/webp',repeat('a',64)) returning id into a;
insert into door_variant_assets(catalog_revision_id,door_variant_id,asset_id,role) values(r,v,a,'thumbnail'),(r,v,a,'slab_render');
insert into storage.objects(bucket_id,name,metadata) values('door-catalog-assets','test.webp','{"size":500,"mimetype":"image/webp"}');
insert into future_grid_fixture(catalog_revision_id,door_variant_id,typed_meaning) values(r,v,'{"location":"prairie","width":null}');
end $$;`)
if(process.env.RUN_DEV_ACCEPTANCE_FIXTURE==='true') {
  await sql(`do $$ declare r uuid:='1af5506c-c723-5d6d-a341-93815d0205e2'; m uuid; s uuid; l uuid; v uuid; f uuid; a uuid; n int;
    begin select id into m from materials; select id into f from finishes; select id into a from assets;
    insert into door_lines(catalog_revision_id,material_id,display_name) values(r,m,'Fiberglass'),(r,m,'Signature'),(r,m,'Other');
    for n in 1..41 loop insert into door_styles(catalog_revision_id,display_name,legacy_id) values(r,'Acceptance door '||n,'fixture-'||n); end loop;
    for s in select id from door_styles loop
      for l in select id from door_lines order by display_name limit 3 loop
        if exists(select 1 from door_variants where door_style_id=s and door_line_id=l) then continue; end if;
        insert into door_variants(catalog_revision_id,door_style_id,door_line_id,display_name,product_code) values(r,s,l,'Acceptance variant','TEST') returning id into v;
      end loop;
    end loop;
    -- Smooth Steel is the fourth sorted line, giving the original style four.
    for v in select id from door_variants where id not in(select door_variant_id from door_variant_finishes) loop
      insert into door_variant_finishes(catalog_revision_id,door_variant_id,finish_id) values(r,v,f);
      insert into door_variant_assets(catalog_revision_id,door_variant_id,asset_id,role) values(r,v,a,'thumbnail'),(r,v,a,'slab_render');
    end loop;
    end $$;`)
  await sql(await migration('20261014000000_harden_draft_door_availability_editor'))
  await sql(await migration('20261015000000_add_catalog_review_publication'))
  await sql(await readFile(new URL('../supabase/tests/catalog_review_publication.sql',import.meta.url),'utf8'))
  assert.equal(await scalar("select count(*)::int from catalog_revisions where status='draft'"),1)
  assert.equal(await scalar('select count(*)::int from catalog_revisions'),1)
  console.log('PASS prepared rollback acceptance script on isolated 42-style / 127-variant fixture; original single DRAFT restored.')
  await db.close(); process.exit(0)
}
await sql(await migration('20261015000000_add_catalog_review_publication'))
const rid = await scalar("select id from catalog_revisions where status='draft'")
const sid = await scalar(`select id from door_styles where catalog_revision_id='${rid}'`)
const fingerprint = () => scalar(`select inventory_revision_fingerprint('${rid}')`)
await check('No-op initial review blocks publication', async () => {
  assert.equal(await scalar(`select jsonb_array_length(inventory_door_changes('${rid}'))`),0)
  await rejects(`select publish_door_catalog('${rid}','${await fingerprint()}')`,/validation failed/)
})
await check('Anonymous and non-admin cannot publish', async () => {
  await sql("set role anon")
  await rejects(`select publish_door_catalog('${rid}','x')`,/permission denied/)
  await sql("reset role; select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false); set role authenticated")
  await rejects(`select review_door_catalog()`,/Admin access/)
  await rejects(`select publish_door_catalog('${rid}','x')`,/Admin access/)
  await sql("reset role; select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false)")
})
await check('Net changes and revert, not free-text messages', async () => {
  await sql(`update door_styles set display_name='Changed door',display_order=3 where id='${sid}'`)
  assert.equal(await scalar(`select jsonb_array_length(inventory_door_changes('${rid}'))`),2)
  await sql(`update door_styles set display_name='Original door',display_order=0 where id='${sid}'`)
  assert.equal(await scalar(`select jsonb_array_length(inventory_door_changes('${rid}'))`),0)
  await sql(`update door_styles set display_name='Reviewed door' where id='${sid}'`)
})
await check('Missing required artwork blocks publication atomically', async () => {
  await sql('begin')
  await sql(`delete from door_variant_assets where role='slab_render'`)
  assert.match(JSON.stringify(await scalar(`select inventory_validate_revision('${rid}')`)),/missing a thumbnail, render/)
  await rejects(`select publish_door_catalog('${rid}','${await fingerprint()}')`,/validation failed/)
  await sql('rollback')
  assert.equal(await scalar(`select status from catalog_revisions where id='${rid}'`),'draft')
})
await check('Storage metadata and stale-review guards', async () => {
  await sql("update storage.objects set metadata='{}'")
  assert.match(JSON.stringify(await scalar(`select inventory_validate_revision('${rid}')`)),/Storage object/)
  await sql(`update storage.objects set metadata='{"size":500,"mimetype":"image/webp"}'`)
  await rejects(`select publish_door_catalog('${rid}','stale')`,/changed after review/)
  assert.deepEqual(await scalar(`select inventory_validate_revision('${rid}')`),[])
})
await check('Availability, status and visibility are structured review changes', async () => {
  await sql(`begin; update door_variants set customer_selectable=false where catalog_revision_id='${rid}'; update door_styles set customer_selectable=false,status='legacy_only' where id='${sid}'`)
  const changes=await scalar(`select inventory_door_changes('${rid}')`)
  assert.ok(changes.some(x=>x.type==='availability'&&x.before===true&&x.after===false))
  assert.ok(changes.some(x=>x.type==='visibility'&&x.before===true&&x.after===false))
  assert.ok(changes.some(x=>x.type==='status'&&x.after==='legacy_only'))
  await sql('rollback')
})
await check('Duplicate and incomplete new variants block publication', async () => {
  await sql(`begin; insert into door_variants(catalog_revision_id,door_style_id,door_line_id,display_name,customer_selectable) select catalog_revision_id,door_style_id,door_line_id,'Incomplete',false from door_variants where catalog_revision_id='${rid}' limit 1`)
  const errors=JSON.stringify(await scalar(`select inventory_validate_revision('${rid}')`))
  assert.match(errors,/Duplicate material/)
  assert.match(errors,/verified product code/)
  await sql('rollback')
})
await check('Thumbnail, render and mask replacement review', async () => {
  await sql(`begin;
    insert into door_variant_assets(catalog_revision_id,door_variant_id,asset_id,role) select catalog_revision_id,door_variant_id,asset_id,'mask' from door_variant_assets where role='slab_render';
    update catalog_review_baselines set snapshot=inventory_door_snapshot('${rid}') where catalog_revision_id='${rid}';
    insert into assets(catalog_revision_id,current_path,storage_bucket,storage_object_path,width,height,byte_size,mime_type,checksum) values('${rid}','/replacement.webp','door-catalog-assets','replacement.webp',100,200,500,'image/webp',repeat('b',64));
    update door_variant_assets set asset_id=(select id from assets where current_path='/replacement.webp');`)
  const changes=await scalar(`select inventory_door_changes('${rid}')`)
  for(const type of ['thumbnail','render','mask'])assert.ok(changes.some(x=>x.type===type&&x.beforeAssetId&&x.afterAssetId))
  await sql('rollback')
})
let draft
await check('Atomic publish creates complete independently keyed editable draft', async () => {
  await sql('set role authenticated')
  const result = await scalar(`select publish_door_catalog('${rid}','${await fingerprintAsOwner()}')`)
  await sql('reset role')
  draft=result.draftRevisionId
  assert.equal(await scalar("select count(*)::int from catalog_revisions where status='published'"),1)
  assert.equal(await scalar("select count(*)::int from catalog_revisions where status='draft'"),1)
  assert.equal(await scalar(`select base_revision_id from catalog_revisions where id='${draft}'`),rid)
  assert.equal(await scalar(`select count(*)::int from assets where catalog_revision_id='${draft}'`),1)
  assert.equal(await scalar(`select count(*)::int from future_grid_fixture g join door_variants v on v.id=g.door_variant_id where g.catalog_revision_id='${draft}' and v.catalog_revision_id=g.catalog_revision_id and typed_meaning='{"location":"prairie","width":null}'`),1)
  assert.equal(await scalar(`select jsonb_array_length(inventory_door_changes('${draft}'))`),0)
})
async function fingerprintAsOwner() {
  await sql('reset role'); const value=await fingerprint(); await sql('set role authenticated'); return value
}
await check('Published catalog, lifecycle and audit are immutable', async () => {
  await rejects(`update door_styles set display_name='wrong' where id='${sid}'`,/read only/)
  await sql('set role authenticated')
  await rejects(`update catalog_revisions set status='draft' where id='${rid}'`,/permission denied/)
  await sql('reset role')
  await rejects(`delete from catalog_change_log where catalog_revision_id='${rid}'`,/append only/)
  await sql(`update door_styles set display_name='Next draft edit' where catalog_revision_id='${draft}'`)
  assert.equal(await scalar(`select jsonb_array_length(inventory_door_changes('${draft}'))`),1)
})
await check('Second publication retains historical revision and Storage', async () => {
  await sql(`select publish_door_catalog('${draft}',inventory_revision_fingerprint('${draft}'))`)
  assert.equal(await scalar(`select status from catalog_revisions where id='${rid}'`),'retired')
  assert.equal(await scalar(`select inventory_asset_is_current('door-catalog-assets','test.webp')`),true)
  assert.equal(await scalar(`select inventory_asset_is_historical('door-catalog-assets','test.webp')`),true)
  await sql('set role authenticated')
  assert.equal(await scalar("with removed as (delete from storage.objects returning id) select count(*)::int from removed"),0)
  await sql('reset role')
})
console.log(`${checks} isolated publication regression groups passed; no external database accessed.`)
await db.close()
