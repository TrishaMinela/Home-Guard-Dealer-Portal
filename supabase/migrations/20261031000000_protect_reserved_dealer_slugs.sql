-- Keep public dealer URLs from shadowing Door Builder application and system routes.
-- The database constraint protects direct writes and the dealer slug request RPC;
-- matching client validation provides an immediate, readable Portal error.

create or replace function public.is_reserved_dealer_slug(p_slug text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select lower(btrim(coalesce(p_slug, ''))) = any (array[
    'api', 'assets', 'admin', 'auth', 'billing', 'builder', 'dashboard', 'dealer', 'dealers',
    'favicon', 'favicon-ico', 'favicon-svg', 'login', 'manifest', 'robots', 'sitemap', 'visualizer'
  ]::text[]);
$$;

revoke all on function public.is_reserved_dealer_slug(text) from public;
grant execute on function public.is_reserved_dealer_slug(text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'dealers_slug_not_reserved'
      and conrelid = 'public.dealers'::regclass
  ) then
    alter table public.dealers
      add constraint dealers_slug_not_reserved
      check (not public.is_reserved_dealer_slug(slug));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'dealers_requested_slug_not_reserved'
      and conrelid = 'public.dealers'::regclass
  ) then
    alter table public.dealers
      add constraint dealers_requested_slug_not_reserved
      check (requested_slug is null or not public.is_reserved_dealer_slug(requested_slug));
  end if;
end;
$$;
