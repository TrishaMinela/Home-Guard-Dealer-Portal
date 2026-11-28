-- NOT APPLIED. Do not run this with supabase db push.
-- This file is outside supabase/migrations on purpose so it cannot apply by accident.
-- It does not update, insert, or delete any dealer, user, or lead rows.
-- Home Guard admins keep their existing policies, including inactive dealerships.
-- Public lead submission, webhooks, CRM, and Zapier are not changed.
--
-- The first draft of is_active_dealer_member() was SECURITY INVOKER and read public.dealers.
-- The dealers SELECT policy called that function, so Postgres raised
-- "infinite recursion detected in policy for relation dealers".
-- These helpers are SECURITY DEFINER, owned by postgres, with search_path empty and
-- row_security off, so they read membership and is_active without re-entering that policy.
--
-- After approval, a developer can run this file once in the Supabase SQL editor.
-- To undo it, run NOT_APPLIED_20261127000000_block_inactive_dealer_portal_access_rollback.sql.

create or replace function public.is_active_dealer_member(p_dealer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.dealer_users
    join public.dealers on dealers.id = dealer_users.dealer_id
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id = p_dealer_id
      and dealers.is_active is true
  );
$$;

create or replace function public.is_active_dealer_admin(p_dealer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.dealer_users
    join public.dealers on dealers.id = dealer_users.dealer_id
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id = p_dealer_id
      and dealer_users.role = 'dealer_admin'
      and dealers.is_active is true
  );
$$;

alter function public.is_active_dealer_member(uuid) owner to postgres;
alter function public.is_active_dealer_admin(uuid) owner to postgres;

revoke all on function public.is_active_dealer_member(uuid) from public, anon;
revoke all on function public.is_active_dealer_admin(uuid) from public, anon;
grant execute on function public.is_active_dealer_member(uuid) to authenticated;
grant execute on function public.is_active_dealer_admin(uuid) to authenticated;

-- Lets the portal explain a pause after the dealer row itself is hidden.
-- Returns only the signed-in user's memberships.
create or replace function public.my_dealer_portal_status()
returns table (dealer_id uuid, role text, is_active boolean)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select dealer_users.dealer_id, dealer_users.role, dealers.is_active
  from public.dealer_users
  join public.dealers on dealers.id = dealer_users.dealer_id
  where dealer_users.user_id = (select auth.uid());
$$;

alter function public.my_dealer_portal_status() owner to postgres;
revoke all on function public.my_dealer_portal_status() from public, anon;
grant execute on function public.my_dealer_portal_status() to authenticated;

-- Home Guard admins keep "Home Guard admins can read all dealers" and
-- "Home Guard admins can read all leads". Those policies are not replaced.
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
-- auth.uid() null (service_role jobs) is left alone.
create or replace function public.reject_inactive_dealer_member_write()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is not null
     and not exists (
       select 1
       from public.home_guard_admins
       where home_guard_admins.user_id = (select auth.uid())
     )
     and coalesce(old.is_active, false) = false
  then
    raise exception 'This dealership is unavailable.' using errcode = '42501';
  end if;
  return new;
end;
$$;

alter function public.reject_inactive_dealer_member_write() owner to postgres;
revoke all on function public.reject_inactive_dealer_member_write() from public, anon;
grant execute on function public.reject_inactive_dealer_member_write() to authenticated;

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
  and public.is_active_dealer_admin(
    case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
);

drop policy if exists "Dealer admins can replace their own dealer logo" on storage.objects;
create policy "Dealer admins can replace their own dealer logo"
on storage.objects for update to authenticated
using (
  bucket_id = 'dealer-logos'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^logo(-secondary)?(-light|-black|-source)?\.(png|jpg|jpeg|webp)$'
  and public.is_active_dealer_admin(
    case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
)
with check (
  bucket_id = 'dealer-logos'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^logo(-secondary)?(-light|-black|-source)?\.(png|jpg|jpeg|webp)$'
  and public.is_active_dealer_admin(
    case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
);

drop policy if exists "Dealer admins can upload their own fonts" on storage.objects;
create policy "Dealer admins can upload their own fonts"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'dealer-fonts'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^(heading|body)\.(woff2|woff)$'
  and public.is_active_dealer_admin(
    case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
);

drop policy if exists "Dealer admins can replace their own fonts" on storage.objects;
create policy "Dealer admins can replace their own fonts"
on storage.objects for update to authenticated
using (
  bucket_id = 'dealer-fonts'
  and public.is_active_dealer_admin(
    case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
)
with check (
  bucket_id = 'dealer-fonts'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^(heading|body)\.(woff2|woff)$'
  and public.is_active_dealer_admin(
    case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
);
