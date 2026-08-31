insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'dealer-logos',
  'dealer-logos',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
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

create policy "Home Guard admins can replace dealer logos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'dealer-logos'
  and exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'dealer-logos'
  and exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

create policy "Home Guard admins can delete dealer logos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'dealer-logos'
  and exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);
