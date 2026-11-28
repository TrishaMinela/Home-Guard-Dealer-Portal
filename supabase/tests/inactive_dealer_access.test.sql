-- Isolated database only. Proves the invoker helper recurses, then checks the
-- definer version, rollback, and a second apply. Not for the live project.

create table if not exists test_results (
  name text primary key,
  ok boolean not null,
  detail text not null default ''
);

create or replace function public.test_as(p_uid uuid, p_role text, p_sql text)
returns text
language plpgsql
as $$
declare
  result text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
  execute format('set local role %I', p_role);
  execute p_sql into result;
  execute 'reset role';
  return result;
exception when others then
  begin
    execute 'reset role';
  exception when others then
    null;
  end;
  return sqlstate || ' ' || sqlerrm;
end;
$$;

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444'),
  ('55555555-5555-4555-8555-555555555555'),
  ('66666666-6666-4666-8666-666666666666');

insert into public.dealers (id, company_name, slug, is_active) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Active Doors', 'active-doors', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Paused Doors', 'paused-doors', false),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Other Doors', 'other-doors', true);

insert into public.home_guard_admins (user_id) values ('11111111-1111-4111-8111-111111111111');

insert into public.dealer_users (user_id, dealer_id, role) values
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dealer_admin'),
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dealer_member'),
  ('44444444-4444-4444-8444-444444444444', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'dealer_admin'),
  ('55555555-5555-4555-8555-555555555555', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'dealer_member'),
  ('66666666-6666-4666-8666-666666666666', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dealer_admin');

insert into public.leads (id, dealer_id, first_name, last_name, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ada', 'Active', 'ada@active.example'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Pat', 'Paused', 'pat@paused.example'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Ott', 'Other', 'ott@other.example');

create table policy_before as
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage');

create table function_before as
select p.proname, pg_get_functiondef(p.oid) as def
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('update_my_dealer_profile', 'update_my_dealer_door_builder_appearance', 'submit_public_lead');

create table row_before as
select
  (select count(*) from public.dealers) as dealers,
  (select count(*) from public.dealer_users) as memberships,
  (select count(*) from public.leads) as leads,
  (select md5(string_agg(id::text || is_active::text || company_name, '|' order by id)) from public.dealers) as dealer_checksum;

-- The rejected draft: invoker helper reads dealers, and the dealers policy calls it.
do $$
declare
  seen text;
begin
  execute $fn$
    create function public.is_active_dealer_member(p_dealer_id uuid)
    returns boolean
    language sql
    stable
    security invoker
    set search_path = public
    as $body$
      select exists (
        select 1
        from public.dealer_users
        join public.dealers on dealers.id = dealer_users.dealer_id
        where dealer_users.user_id = (select auth.uid())
          and dealer_users.dealer_id = p_dealer_id
          and dealers.is_active is true
      );
    $body$
  $fn$;
  execute 'grant execute on function public.is_active_dealer_member(uuid) to authenticated';
  drop policy "Authenticated users can read their associated dealers" on public.dealers;
  create policy "Authenticated users can read their associated dealers"
  on public.dealers
  for select
  to authenticated
  using (public.is_active_dealer_member(id));

  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222"}', true);
  set local role authenticated;
  begin
    perform count(*) from public.dealers;
    raise exception 'expected infinite recursion, but the query succeeded';
  exception when others then
    seen := sqlerrm;
  end;
  reset role;

  if seen not ilike '%infinite recursion%' and seen not ilike '%stack depth limit exceeded%' then
    raise exception 'recursion was not proved: %', coalesce(seen, 'no error');
  end if;

  drop policy "Authenticated users can read their associated dealers" on public.dealers;
  create policy "Authenticated users can read their associated dealers"
  on public.dealers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.dealer_users
      where dealer_users.dealer_id = dealers.id
        and dealer_users.user_id = (select auth.uid())
    )
  );
  drop function public.is_active_dealer_member(uuid);
  insert into test_results (name, ok, detail)
  values ('invoker helper recurses on dealers', true, seen);
end $$;

\ir ../proposed/NOT_APPLIED_20261127000000_block_inactive_dealer_portal_access.sql

insert into test_results (name, ok, detail)
select 'proposal does not change existing rows',
  dealers = (select count(*) from public.dealers)
    and memberships = (select count(*) from public.dealer_users)
    and leads = (select count(*) from public.leads)
    and dealer_checksum = (select md5(string_agg(id::text || is_active::text || company_name, '|' order by id)) from public.dealers),
  'counts or dealer checksum changed'
from row_before;

insert into test_results (name, ok, detail)
select 'save and intake functions are unchanged',
  not exists (
    select 1 from function_before before
    join pg_proc p on p.proname = before.proname
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where pg_get_functiondef(p.oid) is distinct from before.def
  ),
  'function body changed';

insert into test_results (name, ok, detail) values
  ('active admin reads only own dealership',
    public.test_as('22222222-2222-4222-8222-222222222222', 'authenticated', 'select count(*)::text from public.dealers') = '1'
    and public.test_as('22222222-2222-4222-8222-222222222222', 'authenticated', 'select string_agg(slug, '','' order by slug) from public.dealers') = 'active-doors',
    public.test_as('22222222-2222-4222-8222-222222222222', 'authenticated', 'select string_agg(slug, '','' order by slug) from public.dealers')),
  ('active admin reads only own leads',
    public.test_as('22222222-2222-4222-8222-222222222222', 'authenticated', 'select count(*)::text from public.leads') = '1'
    and public.test_as('22222222-2222-4222-8222-222222222222', 'authenticated', 'select email from public.leads') = 'ada@active.example',
    public.test_as('22222222-2222-4222-8222-222222222222', 'authenticated', 'select coalesce(string_agg(email, '',''), ''none'') from public.leads')),
  ('active member reads own dealership and not others',
    public.test_as('33333333-3333-4333-8333-333333333333', 'authenticated', 'select string_agg(slug, '','' order by slug) from public.dealers') = 'active-doors'
    and public.test_as('33333333-3333-4333-8333-333333333333', 'authenticated', 'select count(*)::text from public.leads') = '1',
    public.test_as('33333333-3333-4333-8333-333333333333', 'authenticated', 'select string_agg(slug, '','' order by slug) from public.dealers')),
  ('paused admin reads no dealer or lead rows',
    public.test_as('44444444-4444-4444-8444-444444444444', 'authenticated', 'select count(*)::text from public.dealers') = '0'
    and public.test_as('44444444-4444-4444-8444-444444444444', 'authenticated', 'select count(*)::text from public.leads') = '0',
    public.test_as('44444444-4444-4444-8444-444444444444', 'authenticated', 'select count(*)::text from public.dealers')),
  ('paused member reads no dealer or lead rows',
    public.test_as('55555555-5555-4555-8555-555555555555', 'authenticated', 'select count(*)::text from public.dealers') = '0'
    and public.test_as('55555555-5555-4555-8555-555555555555', 'authenticated', 'select count(*)::text from public.leads') = '0',
    ''),
  ('home guard admin still sees inactive dealerships',
    public.test_as('11111111-1111-4111-8111-111111111111', 'authenticated', 'select count(*)::text from public.dealers') = '3'
    and public.test_as('11111111-1111-4111-8111-111111111111', 'authenticated', 'select count(*)::text from public.leads') = '3',
    public.test_as('11111111-1111-4111-8111-111111111111', 'authenticated', 'select count(*)::text from public.dealers')),
  ('anonymous reads nothing',
    public.test_as('00000000-0000-4000-8000-000000000000', 'anon', 'select count(*)::text from public.dealers') = '0'
    and public.test_as('00000000-0000-4000-8000-000000000000', 'anon', 'select count(*)::text from public.leads') = '0',
    ''),
  ('service role still reads a paused dealership lead',
    public.test_as('00000000-0000-4000-8000-000000000000', 'service_role', 'select count(*)::text from public.leads where dealer_id = ''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb''') = '1',
    public.test_as('00000000-0000-4000-8000-000000000000', 'service_role', 'select count(*)::text from public.leads')),
  ('paused status is still visible to that user',
    public.test_as('44444444-4444-4444-8444-444444444444', 'authenticated', 'select is_active::text from public.my_dealer_portal_status()') = 'false',
    public.test_as('44444444-4444-4444-8444-444444444444', 'authenticated', 'select coalesce(string_agg(is_active::text, '',''), ''none'') from public.my_dealer_portal_status()')),
  ('member cannot save company info',
    public.test_as('33333333-3333-4333-8333-333333333333', 'authenticated', $q$select public.update_my_dealer_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nope', null, null, null, null, null, null, null, null, null, null, null, null)::text$q$) ilike '%Dealer Admin access is required%',
    public.test_as('33333333-3333-4333-8333-333333333333', 'authenticated', $q$select public.update_my_dealer_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nope', null, null, null, null, null, null, null, null, null, null, null, null)::text$q$)),
  ('paused admin cannot save company info or branding',
    public.test_as('44444444-4444-4444-8444-444444444444', 'authenticated', $q$select public.update_my_dealer_profile('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Nope', null, null, null, null, null, null, null, null, null, null, null, null)::text$q$) ilike '%unavailable%'
    and public.test_as('44444444-4444-4444-8444-444444444444', 'authenticated', $q$select public.update_my_dealer_door_builder_appearance('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '{"headerBackground":"#112233"}'::jsonb)::text$q$) ilike '%unavailable%',
    ''),
  ('active admin can save company info and branding',
    public.test_as('22222222-2222-4222-8222-222222222222', 'authenticated', $q$select (public.update_my_dealer_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Active Doors', null, null, null, null, null, null, null, null, '#112233', null, null, null)).company_name$q$) = 'Active Doors'
    and public.test_as('22222222-2222-4222-8222-222222222222', 'authenticated', $q$select public.update_my_dealer_door_builder_appearance('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"headerBackground":"#112233"}'::jsonb)$q$) = 'saved',
    ''),
  ('active admin can upload a logo and a font',
    public.test_as('22222222-2222-4222-8222-222222222222', 'authenticated', $q$insert into storage.objects (bucket_id, name) values ('dealer-logos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/logo.png') returning 'logo'$q$) = 'logo'
    and public.test_as('22222222-2222-4222-8222-222222222222', 'authenticated', $q$insert into storage.objects (bucket_id, name) values ('dealer-fonts', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/heading.woff2') returning 'font'$q$) = 'font',
    ''),
  ('paused admin cannot upload a logo or a font',
    public.test_as('44444444-4444-4444-8444-444444444444', 'authenticated', $q$insert into storage.objects (bucket_id, name) values ('dealer-logos', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/logo.png') returning 'logo'$q$) ilike '%row-level security%'
    and public.test_as('44444444-4444-4444-8444-444444444444', 'authenticated', $q$insert into storage.objects (bucket_id, name) values ('dealer-fonts', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/heading.woff2') returning 'font'$q$) ilike '%row-level security%',
    ''),
  ('a dealer cannot upload another dealership logo',
    public.test_as('22222222-2222-4222-8222-222222222222', 'authenticated', $q$insert into storage.objects (bucket_id, name) values ('dealer-logos', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc/logo.png') returning 'logo'$q$) ilike '%row-level security%',
    ''),
  ('home guard admin can still upload a logo',
    public.test_as('11111111-1111-4111-8111-111111111111', 'authenticated', $q$insert into storage.objects (bucket_id, name) values ('dealer-logos', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/logo-light.png') returning 'logo'$q$) = 'logo',
    ''),
  ('public intake still accepts an active dealership and rejects a paused one',
    public.test_as('00000000-0000-4000-8000-000000000000', 'anon', $q$select public.submit_public_lead('Nia', 'New', 'nia@active.example', 'active-doors')::text$q$) ~ '^[0-9a-f-]{36}$'
    and public.test_as('00000000-0000-4000-8000-000000000000', 'anon', $q$select public.submit_public_lead('Nia', 'New', 'nia@paused.example', 'paused-doors')::text$q$) ilike '%inactive%',
    public.test_as('00000000-0000-4000-8000-000000000000', 'anon', $q$select public.submit_public_lead('Nia', 'New', 'nia@paused.example', 'paused-doors')::text$q$));

-- Reactivation is an admin update. The same user can then read the dealership again.
select public.test_as(
  '11111111-1111-4111-8111-111111111111',
  'authenticated',
  $q$update public.dealers set is_active = true where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning is_active::text$q$
) as reactivated \gset

insert into test_results (name, ok, detail) values
  ('home guard admin can turn a dealership back on', :'reactivated' = 'true', :'reactivated'),
  ('reactivation restores the dealer admin',
    public.test_as('44444444-4444-4444-8444-444444444444', 'authenticated', 'select slug from public.dealers') = 'paused-doors',
    public.test_as('44444444-4444-4444-8444-444444444444', 'authenticated', 'select coalesce(string_agg(slug, '',''), ''none'') from public.dealers')),
  ('reactivation restores the dealer member',
    public.test_as('55555555-5555-4555-8555-555555555555', 'authenticated', 'select count(*)::text from public.leads') = '1',
    ''),
  ('no recursion after the definer fix',
    public.test_as('22222222-2222-4222-8222-222222222222', 'authenticated', 'select count(*)::text from public.dealers') !~ 'recursion',
    '');

-- Put the paused dealership back so the next checks start from the seeded state.
select public.test_as(
  '11111111-1111-4111-8111-111111111111',
  'authenticated',
  $q$update public.dealers set is_active = false where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning is_active::text$q$
);

\ir ../proposed/NOT_APPLIED_20261127000000_block_inactive_dealer_portal_access_rollback.sql

insert into test_results (name, ok, detail)
select 'rollback restores every original policy',
  not exists (
    select schemaname, tablename, policyname, cmd, qual, with_check from policy_before
    except
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
  )
  and not exists (
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
    except
    select schemaname, tablename, policyname, cmd, qual, with_check from policy_before
  ),
  'policy definitions differ';

insert into test_results (name, ok, detail)
select 'rollback removes the new functions and trigger',
  to_regprocedure('public.is_active_dealer_member(uuid)') is null
    and to_regprocedure('public.is_active_dealer_admin(uuid)') is null
    and to_regprocedure('public.my_dealer_portal_status()') is null
    and to_regprocedure('public.reject_inactive_dealer_member_write()') is null
    and not exists (
      select 1 from pg_trigger
      where tgname = 'dealers_reject_inactive_member_write' and not tgisinternal
    ),
  'objects remain';

insert into test_results (name, ok, detail)
select 'rollback restores paused users because the old rule did',
  public.test_as('44444444-4444-4444-8444-444444444444', 'authenticated', 'select slug from public.dealers') = 'paused-doors',
  public.test_as('44444444-4444-4444-8444-444444444444', 'authenticated', 'select coalesce(slug, ''none'') from public.dealers');

\ir ../proposed/NOT_APPLIED_20261127000000_block_inactive_dealer_portal_access.sql

insert into test_results (name, ok, detail) values
  ('second apply blocks the paused dealership again',
    public.test_as('44444444-4444-4444-8444-444444444444', 'authenticated', 'select count(*)::text from public.dealers') = '0'
    and public.test_as('44444444-4444-4444-8444-444444444444', 'authenticated', 'select count(*)::text from public.leads') = '0'
    and public.test_as('11111111-1111-4111-8111-111111111111', 'authenticated', 'select count(*)::text from public.dealers') = '3',
    '');

do $$
declare
  failed text;
begin
  select string_agg(name || ' :: ' || detail, E'\n' order by name)
    into failed
  from test_results
  where not ok;
  if failed is not null then
    raise exception E'inactive dealer access tests failed:\n%', failed;
  end if;
  raise notice E'inactive dealer access tests passed (% checks)', (select count(*) from test_results);
end $$;
