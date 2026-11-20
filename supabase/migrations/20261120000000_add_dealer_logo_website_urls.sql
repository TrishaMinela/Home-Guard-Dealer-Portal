-- Optional website address for each Door Builder logo.
-- Logo 1 falls back to dealers.website when this column is null.
-- Logo 2 has no fallback. Existing rows stay null. This file is not applied by deploy.
-- No backfill: do not copy dealers.website into these columns.

alter table public.dealers
  add column if not exists logo_website_url text null,
  add column if not exists logo_secondary_website_url text null;

alter table public.dealers drop constraint if exists dealers_logo_website_url_check;
alter table public.dealers add constraint dealers_logo_website_url_check
  check (
    logo_website_url is null
    or (
      char_length(logo_website_url) between 8 and 2000
      and logo_website_url = btrim(logo_website_url)
      and logo_website_url ~* '^https?://[^[:space:][:cntrl:]]+$'
    )
  );

alter table public.dealers drop constraint if exists dealers_logo_secondary_website_url_check;
alter table public.dealers add constraint dealers_logo_secondary_website_url_check
  check (
    logo_secondary_website_url is null
    or (
      char_length(logo_secondary_website_url) between 8 and 2000
      and logo_secondary_website_url = btrim(logo_secondary_website_url)
      and logo_secondary_website_url ~* '^https?://[^[:space:][:cntrl:]]+$'
    )
  );

comment on column public.dealers.logo_website_url is
  'Optional Logo 1 website. Null keeps the Door Builder logo link on dealers.website. Shared by every Logo 1 placement and variant.';
comment on column public.dealers.logo_secondary_website_url is
  'Optional Logo 2 website. Null leaves Logo 2 visible but not linked. Ignored while logo_display is single, and kept when switching back to one logo.';

-- Table privileges already granted on public.dealers cover new columns.
-- Existing dealers RLS is unchanged. Dealer admins still cannot update the table directly.

create or replace function public.update_my_dealer_logo_website_url(
  p_dealer_id uuid,
  p_logo_website_url text
)
returns public.dealers
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_url text := nullif(btrim(p_logo_website_url), '');
  v_dealer public.dealers;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if v_url is not null and (
    char_length(v_url) > 2000
    or v_url !~* '^https?://[^[:space:][:cntrl:]]+$'
  ) then
    raise exception 'Logo website must be an http or https URL.' using errcode = '22023';
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
  set logo_website_url = v_url,
      updated_at = now()
  where id = p_dealer_id
  returning * into v_dealer;

  if v_dealer.id is null then
    raise exception 'Dealer record was not found.' using errcode = 'P0002';
  end if;
  return v_dealer;
end;
$$;

revoke all on function public.update_my_dealer_logo_website_url(uuid, text) from public, anon;
grant execute on function public.update_my_dealer_logo_website_url(uuid, text) to authenticated;

create or replace function public.update_my_dealer_secondary_logo_website_url(
  p_dealer_id uuid,
  p_logo_secondary_website_url text
)
returns public.dealers
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_url text := nullif(btrim(p_logo_secondary_website_url), '');
  v_dealer public.dealers;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if v_url is not null and (
    char_length(v_url) > 2000
    or v_url !~* '^https?://[^[:space:][:cntrl:]]+$'
  ) then
    raise exception 'Logo website must be an http or https URL.' using errcode = '22023';
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
  set logo_secondary_website_url = v_url,
      updated_at = now()
  where id = p_dealer_id
  returning * into v_dealer;

  if v_dealer.id is null then
    raise exception 'Dealer record was not found.' using errcode = 'P0002';
  end if;
  return v_dealer;
end;
$$;

revoke all on function public.update_my_dealer_secondary_logo_website_url(uuid, text) from public, anon;
grant execute on function public.update_my_dealer_secondary_logo_website_url(uuid, text) to authenticated;

/*
Rollback:

revoke all on function public.update_my_dealer_logo_website_url(uuid, text) from public, anon, authenticated;
drop function if exists public.update_my_dealer_logo_website_url(uuid, text);
revoke all on function public.update_my_dealer_secondary_logo_website_url(uuid, text) from public, anon, authenticated;
drop function if exists public.update_my_dealer_secondary_logo_website_url(uuid, text);

alter table public.dealers drop constraint if exists dealers_logo_website_url_check;
alter table public.dealers drop constraint if exists dealers_logo_secondary_website_url_check;
alter table public.dealers
  drop column if exists logo_secondary_website_url,
  drop column if exists logo_website_url;
*/
