alter table public.dealers
  add column requested_slug text,
  add column slug_request_status text,
  add column slug_requested_at timestamptz,
  add constraint dealers_slug_request_status_check
    check (slug_request_status is null or slug_request_status in ('pending', 'rejected'));

create unique index dealers_pending_requested_slug_key
  on public.dealers (requested_slug)
  where slug_request_status = 'pending' and requested_slug is not null;

drop function if exists public.update_my_dealer_profile(
  text, text, text, text, text, text, text, text, text, text, text, text
);
drop function if exists public.request_my_dealer_slug(text);

create or replace function public.update_my_dealer_profile(
  p_dealer_id uuid,
  p_company_name text,
  p_primary_contact_name text,
  p_email text,
  p_phone text,
  p_website text,
  p_address text,
  p_city text,
  p_state text,
  p_zip text,
  p_primary_color text,
  p_secondary_color text,
  p_logo_url text
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

  if not exists (
    select 1
    from public.dealer_users
    where dealer_users.user_id = v_user_id
      and dealer_users.dealer_id = p_dealer_id
      and dealer_users.role = 'dealer_admin'
  ) then
    raise exception 'Dealer Admin access is required.' using errcode = '42501';
  end if;

  if nullif(btrim(p_company_name), '') is null then
    raise exception 'Company name is required.' using errcode = '22023';
  end if;

  update public.dealers
  set
    company_name = btrim(p_company_name),
    primary_contact_name = nullif(btrim(p_primary_contact_name), ''),
    email = nullif(btrim(p_email), ''),
    phone = nullif(btrim(p_phone), ''),
    website = nullif(btrim(p_website), ''),
    address = nullif(btrim(p_address), ''),
    city = nullif(btrim(p_city), ''),
    state = nullif(btrim(p_state), ''),
    zip = nullif(btrim(p_zip), ''),
    primary_color = nullif(btrim(p_primary_color), ''),
    secondary_color = nullif(btrim(p_secondary_color), ''),
    logo_url = nullif(btrim(p_logo_url), ''),
    updated_at = now()
  where id = p_dealer_id
  returning * into v_dealer;

  if v_dealer.id is null then
    raise exception 'Dealer record was not found.' using errcode = 'P0002';
  end if;

  return v_dealer;
end;
$$;

create or replace function public.request_my_dealer_slug(
  p_dealer_id uuid,
  p_requested_slug text
)
returns public.dealers
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_normalized_slug text;
  v_dealer public.dealers;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.dealer_users
    where dealer_users.user_id = v_user_id
      and dealer_users.dealer_id = p_dealer_id
      and dealer_users.role = 'dealer_admin'
  ) then
    raise exception 'Dealer Admin access is required.' using errcode = '42501';
  end if;

  v_normalized_slug := lower(btrim(p_requested_slug));
  v_normalized_slug := regexp_replace(v_normalized_slug, '\s+', '-', 'g');
  v_normalized_slug := regexp_replace(v_normalized_slug, '[^a-z0-9-]', '', 'g');
  v_normalized_slug := regexp_replace(v_normalized_slug, '-+', '-', 'g');
  v_normalized_slug := btrim(v_normalized_slug, '-');

  if v_normalized_slug is null or v_normalized_slug = '' then
    raise exception 'A valid requested slug is required.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.dealers
    where dealers.slug = v_normalized_slug
      and dealers.id <> p_dealer_id
  ) then
    raise exception 'The requested slug is already in use.' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.dealers
    where dealers.requested_slug = v_normalized_slug
      and dealers.slug_request_status = 'pending'
      and dealers.id <> p_dealer_id
  ) then
    raise exception 'The requested slug is already pending.' using errcode = '23505';
  end if;

  update public.dealers
  set
    requested_slug = v_normalized_slug,
    slug_request_status = 'pending',
    slug_requested_at = now(),
    updated_at = now()
  where id = p_dealer_id
  returning * into v_dealer;

  return v_dealer;
end;
$$;

create or replace function public.approve_dealer_slug_request(p_dealer_id uuid)
returns public.dealers
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_requested_slug text;
  v_dealer public.dealers;
begin
  if v_user_id is null or not exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = v_user_id
  ) then
    raise exception 'Home Guard Admin access is required.' using errcode = '42501';
  end if;

  select dealers.requested_slug
    into v_requested_slug
  from public.dealers
  where dealers.id = p_dealer_id
    and dealers.slug_request_status = 'pending'
    and dealers.requested_slug is not null
  for update;

  if v_requested_slug is null then
    raise exception 'No pending slug request was found.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.dealers
    where dealers.slug = v_requested_slug
      and dealers.id <> p_dealer_id
  ) then
    raise exception 'The requested slug is already in use.' using errcode = '23505';
  end if;

  update public.dealers
  set
    slug = v_requested_slug,
    requested_slug = null,
    slug_request_status = null,
    slug_requested_at = null,
    updated_at = now()
  where id = p_dealer_id
  returning * into v_dealer;

  return v_dealer;
end;
$$;

create or replace function public.reject_dealer_slug_request(p_dealer_id uuid)
returns public.dealers
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_dealer public.dealers;
begin
  if v_user_id is null or not exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = v_user_id
  ) then
    raise exception 'Home Guard Admin access is required.' using errcode = '42501';
  end if;

  update public.dealers
  set
    requested_slug = null,
    slug_request_status = 'rejected',
    updated_at = now()
  where id = p_dealer_id
    and slug_request_status = 'pending'
    and requested_slug is not null
  returning * into v_dealer;

  if v_dealer.id is null then
    raise exception 'No pending slug request was found.' using errcode = '22023';
  end if;

  return v_dealer;
end;
$$;

revoke all on function public.update_my_dealer_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) from public;
revoke all on function public.request_my_dealer_slug(uuid, text) from public;
revoke all on function public.approve_dealer_slug_request(uuid) from public;
revoke all on function public.reject_dealer_slug_request(uuid) from public;

grant execute on function public.update_my_dealer_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;
grant execute on function public.request_my_dealer_slug(uuid, text) to authenticated;
grant execute on function public.approve_dealer_slug_request(uuid) to authenticated;
grant execute on function public.reject_dealer_slug_request(uuid) to authenticated;

create policy "Dealer admins can upload their own dealer logo"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'dealer-logos'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^logo\.(png|jpg|jpeg|webp)$'
  and exists (
    select 1
    from public.dealer_users
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id::text = (storage.foldername(name))[1]
      and dealer_users.role = 'dealer_admin'
  )
);

create policy "Dealer admins can replace their own dealer logo"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'dealer-logos'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^logo\.(png|jpg|jpeg|webp)$'
  and exists (
    select 1
    from public.dealer_users
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id::text = (storage.foldername(name))[1]
      and dealer_users.role = 'dealer_admin'
  )
)
with check (
  bucket_id = 'dealer-logos'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^logo\.(png|jpg|jpeg|webp)$'
  and exists (
    select 1
    from public.dealer_users
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id::text = (storage.foldername(name))[1]
      and dealer_users.role = 'dealer_admin'
  )
);
