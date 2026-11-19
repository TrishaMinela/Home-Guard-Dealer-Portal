-- Optional second Door Builder logo. Existing dealers stay on one logo.
-- This file is not applied by the application deploy.

alter table public.dealers
  add column if not exists logo_display text not null default 'single',
  add column if not exists logo_secondary_url text null,
  add column if not exists logo_secondary_source_url text null,
  add column if not exists logo_secondary_light_url text null,
  add column if not exists logo_secondary_generated_light_url text null,
  add column if not exists logo_secondary_generated_light_usable boolean null,
  add column if not exists logo_secondary_black_url text null,
  add column if not exists logo_secondary_generated_black_url text null,
  add column if not exists logo_secondary_generated_black_usable boolean null,
  add column if not exists logo_secondary_header_variant text null,
  add column if not exists logo_secondary_pages_variant text null;

alter table public.dealers drop constraint if exists dealers_logo_display_check;
alter table public.dealers add constraint dealers_logo_display_check
  check (logo_display in ('single', 'dual'));

alter table public.dealers drop constraint if exists dealers_logo_secondary_header_variant_check;
alter table public.dealers add constraint dealers_logo_secondary_header_variant_check
  check (logo_secondary_header_variant is null or logo_secondary_header_variant in ('original', 'white', 'black'));

alter table public.dealers drop constraint if exists dealers_logo_secondary_pages_variant_check;
alter table public.dealers add constraint dealers_logo_secondary_pages_variant_check
  check (logo_secondary_pages_variant is null or logo_secondary_pages_variant in ('original', 'white', 'black'));

comment on column public.dealers.logo_display is
  'Door Builder logo count: single (default) or dual. Dual shows the secondary logo to the right of the primary logo.';
comment on column public.dealers.logo_secondary_url is
  'Second logo original. Ignored while logo_display is single.';
comment on column public.dealers.logo_secondary_source_url is
  'Untouched second-logo upload, used when restoring logo_secondary_url.';
comment on column public.dealers.logo_secondary_light_url is
  'Dealer-uploaded white version of the second logo.';
comment on column public.dealers.logo_secondary_generated_light_url is
  'Generated white version of the second logo. Never replaces logo_secondary_url.';
comment on column public.dealers.logo_secondary_generated_light_usable is
  'Readability result for the generated second white logo. Used only when true.';
comment on column public.dealers.logo_secondary_black_url is
  'Dealer-uploaded black version of the second logo.';
comment on column public.dealers.logo_secondary_generated_black_url is
  'Generated black version of the second logo.';
comment on column public.dealers.logo_secondary_generated_black_usable is
  'Readability result for the generated second black logo. Used only when true.';
comment on column public.dealers.logo_secondary_header_variant is
  'Second logo on the homepage header or hero: original, white, or black. NULL follows Logo 1 for that placement and uses the second logo files.';
comment on column public.dealers.logo_secondary_pages_variant is
  'Second logo on builder pages and Find My Door: original, white, or black. NULL follows Logo 1 for that placement and uses the second logo files.';

create or replace function public.update_my_dealer_logo_display(
  p_dealer_id uuid,
  p_logo_display text
)
returns public.dealers
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_dealer public.dealers;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_logo_display not in ('single', 'dual') then
    raise exception 'Logo display must be single or dual.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.dealer_users
    where dealer_users.user_id = v_user_id
      and dealer_users.dealer_id = p_dealer_id
      and dealer_users.role = 'dealer_admin'
  ) then
    raise exception 'Dealer Admin access is required.' using errcode = '42501';
  end if;

  update public.dealers
  set logo_display = p_logo_display,
      updated_at = now()
  where id = p_dealer_id
  returning * into v_dealer;

  if v_dealer.id is null then
    raise exception 'Dealer record was not found.' using errcode = 'P0002';
  end if;
  return v_dealer;
end;
$$;

revoke all on function public.update_my_dealer_logo_display(uuid, text) from public, anon;
grant execute on function public.update_my_dealer_logo_display(uuid, text) to authenticated;

create or replace function public.update_my_dealer_secondary_logo_assets(
  p_dealer_id uuid,
  p_logo_secondary_url text,
  p_logo_secondary_source_url text,
  p_logo_secondary_light_url text,
  p_logo_secondary_black_url text
)
returns public.dealers
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_dealer public.dealers;
  v_headers text := nullif(current_setting('request.headers', true), '');
  v_host text;
  v_pattern text;
  v_url text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.dealer_users
    where dealer_users.user_id = v_user_id
      and dealer_users.dealer_id = p_dealer_id
      and dealer_users.role = 'dealer_admin'
  ) then
    raise exception 'Dealer Admin access is required.' using errcode = '42501';
  end if;
  if v_headers is null then
    raise exception 'Dealer logo storage host is not available.' using errcode = '42501';
  end if;
  v_host := lower(split_part(coalesce(v_headers::json->>'host', ''), ':', 1));
  if v_host !~ '^[a-z0-9-]+\.supabase\.co$' then
    raise exception 'Dealer logo storage host is not available.' using errcode = '42501';
  end if;
  v_pattern := '^https://'
    || replace(v_host, '.', '\.')
    || '/storage/v1/object/public/dealer-logos/'
    || p_dealer_id::text
    || '/logo-secondary(-light|-black|-source)?\.(png|jpg|jpeg|webp)(\?v=[0-9]+)?$';
  foreach v_url in array array[p_logo_secondary_url, p_logo_secondary_source_url, p_logo_secondary_light_url, p_logo_secondary_black_url]
  loop
    if nullif(btrim(v_url), '') is null then
      continue;
    end if;
    if lower(btrim(v_url)) !~ v_pattern then
      raise exception 'Second logo URL must be a file in this dealer''s logo folder.' using errcode = '22023';
    end if;
  end loop;

  update public.dealers
  set logo_secondary_url = nullif(btrim(p_logo_secondary_url), ''),
      logo_secondary_source_url = nullif(btrim(p_logo_secondary_source_url), ''),
      logo_secondary_light_url = nullif(btrim(p_logo_secondary_light_url), ''),
      logo_secondary_black_url = nullif(btrim(p_logo_secondary_black_url), ''),
      updated_at = now()
  where id = p_dealer_id
  returning * into v_dealer;

  if v_dealer.id is null then
    raise exception 'Dealer record was not found.' using errcode = 'P0002';
  end if;
  return v_dealer;
end;
$$;

revoke all on function public.update_my_dealer_secondary_logo_assets(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_my_dealer_secondary_logo_assets(uuid, text, text, text, text) to authenticated;

create or replace function public.update_my_dealer_secondary_logo_variants(
  p_dealer_id uuid,
  p_logo_secondary_header_variant text,
  p_logo_secondary_pages_variant text
)
returns public.dealers
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_header text := nullif(btrim(p_logo_secondary_header_variant), '');
  v_pages text := nullif(btrim(p_logo_secondary_pages_variant), '');
  v_dealer public.dealers;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if v_header is not null and v_header not in ('original', 'white', 'black') then
    raise exception 'Second homepage logo must be original, white, or black.' using errcode = '22023';
  end if;
  if v_pages is not null and v_pages not in ('original', 'white', 'black') then
    raise exception 'Second pages logo must be original, white, or black.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.dealer_users
    where dealer_users.user_id = v_user_id
      and dealer_users.dealer_id = p_dealer_id
      and dealer_users.role = 'dealer_admin'
  ) then
    raise exception 'Dealer Admin access is required.' using errcode = '42501';
  end if;

  update public.dealers
  set logo_secondary_header_variant = v_header,
      logo_secondary_pages_variant = v_pages,
      updated_at = now()
  where id = p_dealer_id
  returning * into v_dealer;

  if v_dealer.id is null then
    raise exception 'Dealer record was not found.' using errcode = 'P0002';
  end if;
  return v_dealer;
end;
$$;

revoke all on function public.update_my_dealer_secondary_logo_variants(uuid, text, text) from public, anon;
grant execute on function public.update_my_dealer_secondary_logo_variants(uuid, text, text) to authenticated;

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

/*
Rollback:

revoke all on function public.update_my_dealer_logo_display(uuid, text) from public, anon, authenticated;
drop function if exists public.update_my_dealer_logo_display(uuid, text);
revoke all on function public.update_my_dealer_secondary_logo_assets(uuid, text, text, text, text) from public, anon, authenticated;
drop function if exists public.update_my_dealer_secondary_logo_assets(uuid, text, text, text, text);
revoke all on function public.update_my_dealer_secondary_logo_variants(uuid, text, text) from public, anon, authenticated;
drop function if exists public.update_my_dealer_secondary_logo_variants(uuid, text, text);

drop policy if exists "Dealer admins can upload their own dealer logo" on storage.objects;
create policy "Dealer admins can upload their own dealer logo"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'dealer-logos'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^logo(-light|-black|-source)?\.(png|jpg|jpeg|webp)$'
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
  and storage.filename(name) ~ '^logo(-light|-black|-source)?\.(png|jpg|jpeg|webp)$'
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
  and storage.filename(name) ~ '^logo(-light|-black|-source)?\.(png|jpg|jpeg|webp)$'
  and exists (
    select 1 from public.dealer_users
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id::text = (storage.foldername(name))[1]
      and dealer_users.role = 'dealer_admin'
  )
);

alter table public.dealers drop constraint if exists dealers_logo_display_check;
alter table public.dealers drop constraint if exists dealers_logo_secondary_header_variant_check;
alter table public.dealers drop constraint if exists dealers_logo_secondary_pages_variant_check;
alter table public.dealers
  drop column if exists logo_secondary_pages_variant,
  drop column if exists logo_secondary_header_variant,
  drop column if exists logo_secondary_generated_black_usable,
  drop column if exists logo_secondary_generated_black_url,
  drop column if exists logo_secondary_black_url,
  drop column if exists logo_secondary_generated_light_usable,
  drop column if exists logo_secondary_generated_light_url,
  drop column if exists logo_secondary_light_url,
  drop column if exists logo_secondary_source_url,
  drop column if exists logo_secondary_url,
  drop column if exists logo_display;
*/
