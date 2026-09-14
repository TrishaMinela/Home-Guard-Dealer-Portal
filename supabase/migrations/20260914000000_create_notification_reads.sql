create table public.notification_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  notification_type text not null,
  source_id uuid not null,
  source_version text not null default '',
  read_at timestamptz not null default now(),
  constraint notification_reads_type_check
    check (notification_type in ('lead', 'slug_request')),
  constraint notification_reads_user_notification_key
    unique (user_id, notification_type, source_id, source_version)
);

alter table public.notification_reads enable row level security;

create policy "Home Guard admins can read their own notification receipts"
on public.notification_reads
for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

create policy "Home Guard admins can mark their own notifications read"
on public.notification_reads
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

