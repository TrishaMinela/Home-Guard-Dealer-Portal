-- DEV inventory asset Storage foundation.
-- The bucket stays private. Published catalog assets are readable with the
-- normal Supabase publishable key; draft assets remain Home Guard admin-only.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'door-catalog-assets',
  'door-catalog-assets',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- catalog_revisions is intentionally admin-only. This narrowly scoped helper
-- exposes only whether one revision is published, without exposing catalog rows.
create or replace function public.is_catalog_revision_published(p_revision_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.catalog_revisions
    where catalog_revisions.id::text = p_revision_id
      and catalog_revisions.status = 'published'
  );
$$;

revoke all on function public.is_catalog_revision_published(text) from public;
grant execute on function public.is_catalog_revision_published(text) to anon, authenticated;

-- Customer-facing clients may fetch only objects whose revision is published.
-- Object names are revision-scoped as revisions/<revision-uuid>/...
create policy "Published catalog assets are readable"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'door-catalog-assets'
  and name ~ '^revisions/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/'
  and public.is_catalog_revision_published(split_part(storage.objects.name, '/', 2))
);

-- Home Guard admins can inspect and manage draft or published inventory assets.
create policy "Home Guard admins can read catalog assets"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'door-catalog-assets'
  and exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

create policy "Home Guard admins can upload catalog assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'door-catalog-assets'
  and exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

create policy "Home Guard admins can replace catalog assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'door-catalog-assets'
  and exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'door-catalog-assets'
  and exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

create policy "Home Guard admins can delete catalog assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'door-catalog-assets'
  and exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);
