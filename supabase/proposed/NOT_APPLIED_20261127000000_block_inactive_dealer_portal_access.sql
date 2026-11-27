-- NOT APPLIED. Do not run this with supabase db push.
-- This file is outside supabase/migrations on purpose so it cannot apply by accident.
-- It does not update, insert, or delete any dealer, user, or lead rows.
-- Home Guard admins are not blocked. Turning a dealership back on still works for them.
-- Public lead submission is not changed.
--
-- After approval, a developer can run this file once in the Supabase SQL editor.

create or replace function public.is_active_dealer_member(p_dealer_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_users
    join public.dealers on dealers.id = dealer_users.dealer_id
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id = p_dealer_id
      and dealers.is_active = true
  );
$$;

create or replace function public.is_active_dealer_admin(p_dealer_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_users
    join public.dealers on dealers.id = dealer_users.dealer_id
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id = p_dealer_id
      and dealer_users.role = 'dealer_admin'
      and dealers.is_active = true
  );
$$;

-- Lets the portal explain a pause even after the dealer row itself is hidden.
create or replace function public.my_dealer_portal_status()
returns table (dealer_id uuid, role text, is_active boolean)
language sql
stable
security definer
set search_path = public
as $$
  select dealer_users.dealer_id, dealer_users.role, dealers.is_active
  from public.dealer_users
  join public.dealers on dealers.id = dealer_users.dealer_id
  where dealer_users.user_id = (select auth.uid());
$$;

revoke all on function public.my_dealer_portal_status() from public, anon;
grant execute on function public.my_dealer_portal_status() to authenticated;

drop policy if exists "Authenticated users can read their associated dealers" on public.dealers;
create policy "Authenticated users can read their associated dealers"
on public.dealers
for select
to authenticated
using (public.is_active_dealer_member(id));

drop policy if exists "Authenticated dealer users can read their dealer leads" on public.leads;
create policy "Authenticated dealer users can read their dealer leads"
on public.leads
for select
to authenticated
using (public.is_active_dealer_member(dealer_id));

-- Dealer save functions run with elevated rights, so row policies do not stop them.
-- This trigger does. A Home Guard admin can still update the row, including reactivation.
create or replace function public.reject_inactive_dealer_member_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not exists (
       select 1 from public.home_guard_admins
       where home_guard_admins.user_id = (select auth.uid())
     )
     and coalesce(old.is_active, false) = false
  then
    raise exception 'This dealership is unavailable.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists dealers_reject_inactive_member_write on public.dealers;
create trigger dealers_reject_inactive_member_write
before update on public.dealers
for each row
execute function public.reject_inactive_dealer_member_write();

drop policy if exists "Dealer admins can upload their own dealer logo" on storage.objects;
create policy "Dealer admins can upload their own dealer logo"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'dealer-logos'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^logo(-secondary)?(-light|-black|-source)?\.(png|jpg|jpeg|webp)$'
  and exists (
    select 1 from public.dealer_users
    join public.dealers on dealers.id = dealer_users.dealer_id
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id::text = (storage.foldername(name))[1]
      and dealer_users.role = 'dealer_admin'
      and dealers.is_active = true
  )
);

drop policy if exists "Dealer admins can replace their own dealer logo" on storage.objects;
create policy "Dealer admins can replace their own dealer logo"
on storage.objects for update to authenticated
using (
  bucket_id = 'dealer-logos'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^logo(-secondary)?(-light|-black|-source)?\.(png|jpg|jpeg|webp)$'
  and exists (
    select 1 from public.dealer_users
    join public.dealers on dealers.id = dealer_users.dealer_id
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id::text = (storage.foldername(name))[1]
      and dealer_users.role = 'dealer_admin'
      and dealers.is_active = true
  )
)
with check (
  bucket_id = 'dealer-logos'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^logo(-secondary)?(-light|-black|-source)?\.(png|jpg|jpeg|webp)$'
  and exists (
    select 1 from public.dealer_users
    join public.dealers on dealers.id = dealer_users.dealer_id
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id::text = (storage.foldername(name))[1]
      and dealer_users.role = 'dealer_admin'
      and dealers.is_active = true
  )
);

drop policy if exists "Dealer admins can upload their own fonts" on storage.objects;
create policy "Dealer admins can upload their own fonts"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'dealer-fonts'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^(heading|body)\.(woff2|woff)$'
  and exists (
    select 1 from public.dealer_users
    join public.dealers on dealers.id = dealer_users.dealer_id
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id::text = (storage.foldername(name))[1]
      and dealer_users.role = 'dealer_admin'
      and dealers.is_active = true
  )
);

drop policy if exists "Dealer admins can replace their own fonts" on storage.objects;
create policy "Dealer admins can replace their own fonts"
on storage.objects for update to authenticated
using (
  bucket_id = 'dealer-fonts'
  and exists (
    select 1 from public.dealer_users
    join public.dealers on dealers.id = dealer_users.dealer_id
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id::text = (storage.foldername(name))[1]
      and dealer_users.role = 'dealer_admin'
      and dealers.is_active = true
  )
)
with check (
  bucket_id = 'dealer-fonts'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^(heading|body)\.(woff2|woff)$'
  and exists (
    select 1 from public.dealer_users
    join public.dealers on dealers.id = dealer_users.dealer_id
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id::text = (storage.foldername(name))[1]
      and dealer_users.role = 'dealer_admin'
      and dealers.is_active = true
  )
);
