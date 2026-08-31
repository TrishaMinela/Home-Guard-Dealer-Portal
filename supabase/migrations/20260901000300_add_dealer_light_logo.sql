alter table public.dealers
  add column logo_light_url text null;

drop function if exists public.update_my_dealer_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
);

create function public.update_my_dealer_profile(
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
  p_logo_url text,
  p_logo_light_url text
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
    logo_light_url = nullif(btrim(p_logo_light_url), ''),
    updated_at = now()
  where id = p_dealer_id
  returning * into v_dealer;

  if v_dealer.id is null then
    raise exception 'Dealer record was not found.' using errcode = 'P0002';
  end if;

  return v_dealer;
end;
$$;

revoke all on function public.update_my_dealer_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public;

grant execute on function public.update_my_dealer_profile(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

drop policy if exists "Dealer admins can upload their own dealer logo"
on storage.objects;

create policy "Dealer admins can upload their own dealer logo"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'dealer-logos'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^logo(-light)?\.(png|jpg|jpeg|webp)$'
  and exists (
    select 1
    from public.dealer_users
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id::text = (storage.foldername(name))[1]
      and dealer_users.role = 'dealer_admin'
  )
);

drop policy if exists "Dealer admins can replace their own dealer logo"
on storage.objects;

create policy "Dealer admins can replace their own dealer logo"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'dealer-logos'
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^logo(-light)?\.(png|jpg|jpeg|webp)$'
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
  and storage.filename(name) ~ '^logo(-light)?\.(png|jpg|jpeg|webp)$'
  and exists (
    select 1
    from public.dealer_users
    where dealer_users.user_id = (select auth.uid())
      and dealer_users.dealer_id::text = (storage.foldername(name))[1]
      and dealer_users.role = 'dealer_admin'
  )
);
