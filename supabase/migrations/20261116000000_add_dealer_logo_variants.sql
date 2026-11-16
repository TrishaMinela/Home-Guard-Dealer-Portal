alter table public.dealers
  add column if not exists logo_header_variant text null,
  add column if not exists logo_pages_variant text null,
  add column if not exists logo_generated_light_usable boolean null;

alter table public.dealers
  drop constraint if exists dealers_logo_header_variant_check;

alter table public.dealers
  add constraint dealers_logo_header_variant_check
  check (logo_header_variant in ('original', 'light'));

alter table public.dealers
  drop constraint if exists dealers_logo_pages_variant_check;

alter table public.dealers
  add constraint dealers_logo_pages_variant_check
  check (logo_pages_variant in ('original', 'light'));

comment on column public.dealers.logo_header_variant is
  'Door Builder homepage/header logo: original or light. NULL means no explicit choice, so the Door Builder keeps its current behavior. Existing rows are not backfilled.';

comment on column public.dealers.logo_pages_variant is
  'Door Builder logo for customer-facing pages other than the homepage/header: original or light. NULL means no explicit choice. Existing rows are not backfilled.';

comment on column public.dealers.logo_generated_light_usable is
  'Readability result for logo_generated_light_url. NULL means never checked. White/Light resolves to logo_light_url when present, otherwise logo_generated_light_url only when this column is true.';

-- Table-level privileges already granted on public.dealers cover the new columns.
-- Existing dealers RLS is unchanged: Home Guard admins update rows directly, and
-- dealer admins update only these two choices through the function below.

create or replace function public.update_my_dealer_logo_variants(
  p_dealer_id uuid,
  p_logo_header_variant text,
  p_logo_pages_variant text
)
returns public.dealers
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_header text := nullif(btrim(p_logo_header_variant), '');
  v_pages text := nullif(btrim(p_logo_pages_variant), '');
  v_dealer public.dealers;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if v_header is not null and v_header not in ('original', 'light') then
    raise exception 'Homepage logo variant must be original or light.' using errcode = '22023';
  end if;

  if v_pages is not null and v_pages not in ('original', 'light') then
    raise exception 'Pages logo variant must be original or light.' using errcode = '22023';
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

  update public.dealers
  set logo_header_variant = v_header,
      logo_pages_variant = v_pages,
      updated_at = now()
  where id = p_dealer_id
  returning * into v_dealer;

  if v_dealer.id is null then
    raise exception 'Dealer record was not found.' using errcode = 'P0002';
  end if;

  return v_dealer;
end;
$$;

revoke all on function public.update_my_dealer_logo_variants(uuid, text, text) from public;
grant execute on function public.update_my_dealer_logo_variants(uuid, text, text) to authenticated;

-- Rollback (not applied by this migration):
-- revoke all on function public.update_my_dealer_logo_variants(uuid, text, text) from public, authenticated;
-- drop function if exists public.update_my_dealer_logo_variants(uuid, text, text);
-- alter table public.dealers
--   drop constraint if exists dealers_logo_header_variant_check,
--   drop constraint if exists dealers_logo_pages_variant_check,
--   drop column if exists logo_header_variant,
--   drop column if exists logo_pages_variant,
--   drop column if exists logo_generated_light_usable;
