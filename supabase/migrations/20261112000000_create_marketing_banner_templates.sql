-- Dealer-branded marketing banner templates.
-- Phase 1 seeds eight unverified default logo regions. Do not treat those
-- percentages as final artwork placement. Home Guard admins replace the
-- template image and placement per banner. Dealers can read templates and
-- generate files for their own dealership; they cannot write templates.
-- This migration is intentionally not applied by the Phase 1 change.

create table public.marketing_banner_templates (
  slot smallint primary key check (slot between 1 and 8),
  category text not null check (category in ('landscape', 'square')),
  headline text not null,
  image_path text null,
  image_width integer not null check (image_width between 1 and 8000),
  image_height integer not null check (image_height between 1 and 8000),
  placement jsonb not null,
  placement_verified boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users (id) on delete set null,
  constraint marketing_banner_image_path_shape check (
    image_path is null
    or image_path ~ '^[1-8]/template\.(png|jpe?g|webp)$'
  ),
  constraint marketing_banner_placement_shape check (
    jsonb_typeof(placement) = 'object'
    and (placement->>'x')::numeric between 0 and 100
    and (placement->>'y')::numeric between 0 and 100
    and (placement->>'width')::numeric between 0.5 and 100
    and (placement->>'height')::numeric between 0.5 and 100
    and (placement->>'x')::numeric + (placement->>'width')::numeric <= 100.001
    and (placement->>'y')::numeric + (placement->>'height')::numeric <= 100.001
    and (placement->>'padding')::numeric between 0 and 40
    and (
      not (placement ? 'maxLogoWidth')
      or placement->>'maxLogoWidth' is null
      or (placement->>'maxLogoWidth')::numeric between 0.5 and 100
    )
    and (
      not (placement ? 'maxLogoHeight')
      or placement->>'maxLogoHeight' is null
      or (placement->>'maxLogoHeight')::numeric between 0.5 and 100
    )
  )
);

comment on table public.marketing_banner_templates is
  'Shared Home Guard marketing banner templates and logo-placement regions. Seeded placements are unverified defaults.';

comment on column public.marketing_banner_templates.placement is
  'Percentages of the original template: x and width use template width; y and height use template height. padding is a percent of the shorter side. maxLogoWidth and maxLogoHeight are optional percent caps. The logo is centered and aspect-fit inside the padded rectangle.';

-- Slot, category, and headline are catalog identity. Admins can replace the
-- image and the placement, including whether it has been verified.
create or replace function public.protect_marketing_banner_template()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.slot := old.slot;
  new.category := old.category;
  new.headline := old.headline;
  new.updated_at := pg_catalog.now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

revoke all on function public.protect_marketing_banner_template() from public;

create trigger marketing_banner_templates_protect
before update on public.marketing_banner_templates
for each row
execute function public.protect_marketing_banner_template();

insert into public.marketing_banner_templates
  (slot, category, headline, image_path, image_width, image_height, placement, placement_verified)
values
  (1, 'landscape', 'Build a Door Made for Your Home', null, 851, 315, '{"x":4,"y":8,"width":34,"height":36,"padding":2,"maxLogoWidth":null,"maxLogoHeight":null}'::jsonb, false),
  (2, 'landscape', 'Your Home. Your Style. Your Door.', null, 851, 315, '{"x":62,"y":54,"width":34,"height":38,"padding":2,"maxLogoWidth":null,"maxLogoHeight":null}'::jsonb, false),
  (3, 'landscape', 'A New Look Starts at Your Door', null, 851, 315, '{"x":60,"y":56,"width":36,"height":36,"padding":2,"maxLogoWidth":null,"maxLogoHeight":null}'::jsonb, false),
  (4, 'landscape', 'See Your Vision Come to Life', null, 851, 315, '{"x":58,"y":50,"width":38,"height":42,"padding":2,"maxLogoWidth":null,"maxLogoHeight":null}'::jsonb, false),
  (5, 'square', 'Build a Door Made for Your Home', null, 1024, 1024, '{"x":30,"y":6,"width":32,"height":18,"padding":1.5,"maxLogoWidth":null,"maxLogoHeight":null}'::jsonb, false),
  (6, 'square', 'Your Home. Your Style. Your Door.', null, 1024, 1024, '{"x":5,"y":74,"width":36,"height":20,"padding":1.5,"maxLogoWidth":null,"maxLogoHeight":null}'::jsonb, false),
  (7, 'square', 'A New Look Starts at Your Door', null, 1024, 1024, '{"x":5,"y":24,"width":32,"height":16,"padding":1.5,"maxLogoWidth":null,"maxLogoHeight":null}'::jsonb, false),
  (8, 'square', 'See Your Vision Come to Life', null, 1024, 1024, '{"x":62,"y":6,"width":32,"height":18,"padding":1.5,"maxLogoWidth":null,"maxLogoHeight":null}'::jsonb, false);

alter table public.marketing_banner_templates enable row level security;

revoke all on table public.marketing_banner_templates from public, anon;
grant select on table public.marketing_banner_templates to authenticated;
grant update (
  image_path,
  image_width,
  image_height,
  placement,
  placement_verified,
  updated_at,
  updated_by
) on table public.marketing_banner_templates to authenticated;

create policy "Portal users can read marketing banner templates"
on public.marketing_banner_templates
for select
to authenticated
using (
  exists (
    select 1
    from public.dealer_users
    where dealer_users.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

create policy "Home Guard admins can update marketing banner templates"
on public.marketing_banner_templates
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

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'marketing-banner-templates',
  'marketing-banner-templates',
  false,
  15728640,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
);

create policy "Portal users can read marketing banner template images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'marketing-banner-templates'
  and name ~ '^[1-8]/template\.(png|jpe?g|webp)$'
  and (
    exists (
      select 1
      from public.dealer_users
      where dealer_users.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.home_guard_admins
      where home_guard_admins.user_id = (select auth.uid())
    )
  )
);

create policy "Home Guard admins can upload marketing banner template images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'marketing-banner-templates'
  and name ~ '^[1-8]/template\.(png|jpe?g|webp)$'
  and exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

create policy "Home Guard admins can replace marketing banner template images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'marketing-banner-templates'
  and name ~ '^[1-8]/template\.(png|jpe?g|webp)$'
  and exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'marketing-banner-templates'
  and name ~ '^[1-8]/template\.(png|jpe?g|webp)$'
  and exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

create policy "Home Guard admins can delete marketing banner template images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'marketing-banner-templates'
  and name ~ '^[1-8]/template\.(png|jpe?g|webp)$'
  and exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);
