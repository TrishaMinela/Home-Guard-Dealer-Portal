-- Isolated stand-in for the current dealer, lead, and storage rules.
-- This is not the live database. Full Supabase migrations need the hosted auth
-- and storage catalogs, so this fixture rebuilds only the objects the proposed
-- file changes, plus the public lead function and one dealer save function.
-- Run only through scripts/run-inactive-dealer-access-test.sh.

create schema if not exists auth;
create schema if not exists storage;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
$$;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null;
end $$;

create table if not exists auth.users (
  id uuid primary key
);

create table if not exists public.dealers (
  id uuid primary key,
  company_name text not null,
  slug text not null unique,
  logo_url text,
  logo_light_url text,
  primary_contact_name text,
  email text,
  phone text,
  website text,
  address text,
  city text,
  state text,
  zip text,
  primary_color text,
  secondary_color text,
  door_builder_appearance jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dealer_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  role text not null default 'dealer_admin',
  created_at timestamptz not null default now(),
  unique (user_id, dealer_id)
);

create table if not exists public.home_guard_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid references public.dealers (id),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  preferred_contact_method text,
  project_timeline text,
  comments text,
  source text,
  visualizer_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text
);

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end;
$$;

create or replace function storage.filename(name text)
returns text
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[array_length(parts, 1)];
end;
$$;

alter table public.dealers enable row level security;
alter table public.dealer_users enable row level security;
alter table public.home_guard_admins enable row level security;
alter table public.leads enable row level security;
alter table storage.objects enable row level security;

create policy "Authenticated users can read their own dealer memberships"
on public.dealer_users
for select
to authenticated
using (user_id = (select auth.uid()));

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

create policy "Home Guard admins can read their own admin record"
on public.home_guard_admins
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Home Guard admins can read all dealers"
on public.dealers
for select
to authenticated
using (
  exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

create policy "Home Guard admins can create dealers"
on public.dealers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

create policy "Home Guard admins can update dealers"
on public.dealers
for update
to authenticated
using (
  exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

create policy "Authenticated dealer users can read their dealer leads"
on public.leads
for select
to authenticated
using (
  exists (
    select 1
    from public.dealer_users
    where dealer_users.dealer_id = leads.dealer_id
      and dealer_users.user_id = (select auth.uid())
  )
);

create policy "Home Guard admins can read all leads"
on public.leads
for select
to authenticated
using (
  exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

create policy "Public can view dealer logos"
on storage.objects
for select
to public
using (bucket_id = 'dealer-logos');

create policy "Home Guard admins can upload dealer logos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'dealer-logos'
  and exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

create policy "Dealer admins can upload their own dealer logo"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'dealer-logos'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^logo(-secondary)?(-light|-black|-source)?\.(png|jpg|jpeg|webp)$'
  and exists (
    select 1 from public.dealer_users
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id::text = (storage.foldername(name))[1]
      and dealer_users.role = 'dealer_admin'
  )
);

create policy "Dealer admins can replace their own dealer logo"
on storage.objects for update to authenticated
using (
  bucket_id = 'dealer-logos'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^logo(-secondary)?(-light|-black|-source)?\.(png|jpg|jpeg|webp)$'
  and exists (
    select 1 from public.dealer_users
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id::text = (storage.foldername(name))[1]
      and dealer_users.role = 'dealer_admin'
  )
)
with check (
  bucket_id = 'dealer-logos'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^logo(-secondary)?(-light|-black|-source)?\.(png|jpg|jpeg|webp)$'
  and exists (
    select 1 from public.dealer_users
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id::text = (storage.foldername(name))[1]
      and dealer_users.role = 'dealer_admin'
  )
);

create policy "Public can view dealer fonts"
on storage.objects for select to public
using (bucket_id = 'dealer-fonts');

create policy "Home Guard admins can manage dealer fonts"
on storage.objects for all to authenticated
using (
  bucket_id = 'dealer-fonts'
  and exists (
    select 1 from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'dealer-fonts'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^(heading|body)\.(woff2|woff)$'
  and exists (
    select 1 from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

create policy "Dealer admins can upload their own fonts"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'dealer-fonts'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^(heading|body)\.(woff2|woff)$'
  and exists (
    select 1 from public.dealer_users
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id::text = (storage.foldername(name))[1]
      and dealer_users.role = 'dealer_admin'
  )
);

create policy "Dealer admins can replace their own fonts"
on storage.objects for update to authenticated
using (
  bucket_id = 'dealer-fonts'
  and exists (
    select 1 from public.dealer_users
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id::text = (storage.foldername(name))[1]
      and dealer_users.role = 'dealer_admin'
  )
)
with check (
  bucket_id = 'dealer-fonts'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^(heading|body)\.(woff2|woff)$'
  and exists (
    select 1 from public.dealer_users
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id::text = (storage.foldername(name))[1]
      and dealer_users.role = 'dealer_admin'
  )
);

-- Same security pattern as the live update_my_dealer_profile: definer, dealer admin check, then update.
create or replace function public.update_my_dealer_profile(
  p_dealer_id uuid,
  p_company_name text,
  p_primary_contact_name text,
  p_email text,
  p_phone text,
  p_website text,
  p_address text,
  p_city text,
  p_state text,
  p_zip text,
  p_primary_color text,
  p_secondary_color text,
  p_logo_url text,
  p_logo_light_url text
)
returns public.dealers
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_dealer public.dealers;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.dealer_users
    where dealer_users.user_id = v_user_id
      and dealer_users.dealer_id = p_dealer_id
      and dealer_users.role = 'dealer_admin'
  ) then
    raise exception 'Dealer Admin access is required.' using errcode = '42501';
  end if;
  if nullif(btrim(p_company_name), '') is null then
    raise exception 'Company name is required.' using errcode = '22023';
  end if;
  update public.dealers
  set
    company_name = btrim(p_company_name),
    primary_color = nullif(btrim(p_primary_color), ''),
    logo_url = nullif(btrim(p_logo_url), ''),
    logo_light_url = nullif(btrim(p_logo_light_url), ''),
    updated_at = now()
  where id = p_dealer_id
  returning * into v_dealer;
  if v_dealer.id is null then
    raise exception 'Dealer record was not found.' using errcode = 'P0002';
  end if;
  return v_dealer;
end;
$$;

revoke all on function public.update_my_dealer_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public;
grant execute on function public.update_my_dealer_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

create or replace function public.update_my_dealer_door_builder_appearance(
  p_dealer_id uuid,
  p_appearance jsonb
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.dealer_users
    where dealer_users.user_id = v_user_id
      and dealer_users.dealer_id = p_dealer_id
      and dealer_users.role = 'dealer_admin'
  ) then
    raise exception 'Dealer Admin access is required.' using errcode = '42501';
  end if;
  update public.dealers
  set door_builder_appearance = p_appearance, updated_at = now()
  where id = p_dealer_id;
  return 'saved';
end;
$$;

revoke all on function public.update_my_dealer_door_builder_appearance(uuid, jsonb) from public;
grant execute on function public.update_my_dealer_door_builder_appearance(uuid, jsonb) to authenticated;

-- Live public intake. Inactive dealerships are already rejected here. This file does not change that.
create or replace function public.submit_public_lead(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_dealer_slug text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_dealer_id uuid;
  v_dealer_is_active boolean;
  v_dealer_slug text := nullif(lower(btrim(p_dealer_slug)), '');
  v_lead_id uuid;
begin
  if v_dealer_slug is not null then
    select dealers.id, dealers.is_active
      into v_dealer_id, v_dealer_is_active
    from public.dealers
    where dealers.slug = v_dealer_slug;
    if not found then
      raise exception 'Invalid dealer URL.' using errcode = '22023';
    end if;
    if not v_dealer_is_active then
      raise exception 'This dealer URL is inactive.' using errcode = '22023';
    end if;
  end if;
  insert into public.leads (dealer_id, first_name, last_name, email)
  values (v_dealer_id, btrim(p_first_name), btrim(p_last_name), btrim(p_email))
  returning id into v_lead_id;
  return v_lead_id;
end;
$$;

revoke all on function public.submit_public_lead(text, text, text, text) from public;
grant execute on function public.submit_public_lead(text, text, text, text) to anon, authenticated;

grant usage on schema public, storage, auth to anon, authenticated, service_role;
grant select, insert, update, delete on public.dealers, public.dealer_users, public.home_guard_admins, public.leads, storage.objects to authenticated, service_role;
grant select on public.dealers, public.leads to anon;
grant execute on function storage.foldername(text), storage.filename(text) to anon, authenticated, service_role;
