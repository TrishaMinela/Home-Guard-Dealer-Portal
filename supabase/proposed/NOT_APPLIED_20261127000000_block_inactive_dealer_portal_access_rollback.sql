-- NOT APPLIED. This restores the dealer, lead, logo, and font rules that existed
-- before NOT_APPLIED_20261127000000_block_inactive_dealer_portal_access.sql.
-- It does not update, insert, or delete dealer, user, or lead rows.
-- Home Guard admin policies are not changed.

drop trigger if exists dealers_reject_inactive_member_write on public.dealers;

drop policy if exists "Authenticated users can read their associated dealers" on public.dealers;
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

drop policy if exists "Authenticated dealer users can read their dealer leads" on public.leads;
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

drop policy if exists "Dealer admins can upload their own dealer logo" on storage.objects;
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

drop policy if exists "Dealer admins can replace their own dealer logo" on storage.objects;
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

drop policy if exists "Dealer admins can upload their own fonts" on storage.objects;
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

drop policy if exists "Dealer admins can replace their own fonts" on storage.objects;
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

drop function if exists public.reject_inactive_dealer_member_write();
drop function if exists public.my_dealer_portal_status();
drop function if exists public.is_active_dealer_admin(uuid);
drop function if exists public.is_active_dealer_member(uuid);
