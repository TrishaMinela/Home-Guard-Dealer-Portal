create table public.home_guard_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint home_guard_admins_user_id_key unique (user_id)
);

alter table public.home_guard_admins enable row level security;

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
