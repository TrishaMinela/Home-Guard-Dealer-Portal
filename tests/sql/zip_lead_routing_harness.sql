-- Local-only schema stub so the ZIP routing migration can be applied without Supabase.
create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table if not exists public.dealers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  slug text not null unique,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid references public.dealers (id),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  city text,
  state text,
  zip text,
  comments text,
  status text not null default 'new',
  source text,
  door_configuration jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.home_guard_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade
);

alter table public.dealers enable row level security;
alter table public.leads enable row level security;
alter table public.home_guard_admins enable row level security;

create policy "Home Guard admins can read their own admin record"
on public.home_guard_admins
for select to authenticated
using (user_id = (select auth.uid()));

grant usage on schema public to authenticated, anon, service_role;
grant select on public.dealers, public.leads, public.home_guard_admins to authenticated;
grant select, insert, update, delete on public.dealers, public.leads, public.home_guard_admins to service_role;
