create table public.home_guard_settings (
  id uuid primary key default gen_random_uuid(),
  company_name text not null default 'Home Guard Industries',
  logo_url text null,
  logo_light_url text null,
  email text null,
  phone text null,
  website text null,
  address text null,
  city text null,
  state text null,
  zip text null,
  primary_color text null,
  secondary_color text null,
  visualizer_domain text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index home_guard_settings_singleton_key
  on public.home_guard_settings ((true));

insert into public.home_guard_settings (company_name)
values ('Home Guard Industries');

alter table public.home_guard_settings enable row level security;

create policy "Home Guard admins can read global settings"
on public.home_guard_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

create policy "Home Guard admins can update global settings"
on public.home_guard_settings
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
