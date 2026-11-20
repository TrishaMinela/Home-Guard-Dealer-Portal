-- Local ephemeral harness only. Do not run this against HGI Portal Dev.
-- The Node test creates a throwaway database and applies the migration file.

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table if not exists public.dealers (
  id uuid primary key,
  slug text not null unique,
  company_name text not null,
  is_active boolean not null default true
);

create table if not exists public.billing_access_managers (
  user_id uuid primary key references auth.users(id)
);

create or replace function public.is_billing_access_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.billing_access_managers
    where user_id = (select auth.uid())
  );
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role bypassrls;
  else
    execute 'alter role service_role bypassrls';
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to authenticated, service_role;
create table if not exists public.home_guard_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id)
);
grant execute on function public.is_billing_access_manager() to authenticated;

\ir ../../supabase/migrations/20261120190000_add_dealer_door_builder_webhooks.sql

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333');
insert into public.dealers (id, slug, company_name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'fake-dealer', 'Fake Dealer');
insert into public.billing_access_managers (user_id) values ('11111111-1111-4111-8111-111111111111');
insert into public.home_guard_admins (user_id) values ('22222222-2222-4222-8222-222222222222');
insert into public.door_builder_integration_managers (user_id) values ('33333333-3333-4333-8333-333333333333');

insert into public.dealer_door_builder_webhooks (
  dealer_id, masked_url, webhook_ciphertext, webhook_iv, webhook_auth_tag, credential_key_version, created_by
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'https://hooks.zapier.com/hooks/catch/12••••/••••/',
  'XtzUZjhAMS0RFTEwyW3dZJlIkJyOursYQLHsws2fIcjYwg8M+JTIb6bnJG7+4YQkU0d767iwDkMZHgHCXE/sDZGEU1eN2w==',
  'AwMDAwMDAwMDAwMD',
  'sWTGKW3FTvFTR7aq3XxeUg==',
  1,
  '11111111-1111-4111-8111-111111111111'
);

insert into public.dealer_door_builder_webhook_deliveries (
  dealer_id, submission_id, destination_fingerprint, delivery_status, attempt_number, http_status
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  repeat('ab', 32),
  'succeeded',
  1,
  200
);

do $$
begin
  begin
    insert into public.dealer_door_builder_webhook_deliveries (
      dealer_id, submission_id, destination_fingerprint, delivery_status, attempt_number
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      repeat('ab', 32),
      'succeeded',
      2
    );
    raise exception 'a second success was accepted';
  exception when unique_violation then
    null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);

set role authenticated;
do $$
declare
  seen text;
begin
  select masked_url into seen from public.dealer_door_builder_webhooks;
  if seen is null or position('••••' in seen) = 0 then
    raise exception 'access manager could not read the masked webhook';
  end if;
  begin
    perform webhook_ciphertext from public.dealer_door_builder_webhooks;
    raise exception 'ciphertext was readable by an access manager';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.dealer_door_builder_webhooks (
      dealer_id, masked_url, webhook_ciphertext, webhook_iv, webhook_auth_tag, credential_key_version
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'https://hooks.zapier.com/hooks/catch/99••••/••••/',
      'ciphertext', 'AwMDAwMDAwMDAwMD', 'sWTGKW3FTvFTR7aq3XxeUg==', 1
    );
    raise exception 'authenticated insert was accepted';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
set role authenticated;
do $$
declare
  seen_count integer;
begin
  select count(*) into seen_count from public.dealer_door_builder_webhooks;
  if seen_count <> 0 then
    raise exception 'a billing access manager could read webhook status';
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
set role authenticated;
do $$
declare
  seen text;
begin
  select masked_url into seen from public.dealer_door_builder_webhooks;
  if seen is null then
    raise exception 'an integration manager could not read webhook status';
  end if;
  begin
    perform payload from public.dealer_door_builder_webhook_deliveries;
    raise exception 'delivery payload was readable';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;
set role anon;
do $$
begin
  begin
    perform masked_url from public.dealer_door_builder_webhooks;
    raise exception 'anon could read webhook status';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;
select public.claim_door_builder_webhook_retry(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
);
-- already succeeded, so the claim must not create another attempt.

reset role;
begin;
drop table if exists public.dealer_door_builder_webhook_deliveries;
drop table if exists public.dealer_door_builder_webhook_audit;
drop table if exists public.dealer_door_builder_webhooks;
drop table if exists public.door_builder_integration_managers;
drop function if exists public.claim_door_builder_webhook_retry(uuid, uuid);
drop function if exists public.can_manage_door_builder_webhooks();
commit;

do $$
begin
  if to_regclass('public.dealer_door_builder_webhooks') is not null
     or to_regclass('public.dealer_door_builder_webhook_audit') is not null
     or to_regclass('public.dealer_door_builder_webhook_deliveries') is not null then
    raise exception 'rollback did not remove the webhook tables';
  end if;
  if to_regclass('public.door_builder_integration_managers') is not null then
    raise exception 'rollback left the integration manager grant';
  end if;
  if to_regclass('public.dealers') is null then
    raise exception 'rollback removed an unrelated table';
  end if;
end $$;
