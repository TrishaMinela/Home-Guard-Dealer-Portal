alter table public.dealers
  add column if not exists logo_placement text not null default 'hero';

alter table public.dealers
  drop constraint if exists dealers_logo_placement_check;

alter table public.dealers
  add constraint dealers_logo_placement_check
  check (logo_placement in ('header', 'hero'));

comment on column public.dealers.logo_placement is
  'Public dealer Door Builder homepage logo placement: header or hero.';

create or replace function public.update_my_dealer_logo_placement(
  p_dealer_id uuid,
  p_logo_placement text
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

  if p_logo_placement not in ('header', 'hero') then
    raise exception 'Logo placement must be header or hero.' using errcode = '22023';
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
  set logo_placement = p_logo_placement,
      updated_at = now()
  where id = p_dealer_id
  returning * into v_dealer;

  if v_dealer.id is null then
    raise exception 'Dealer record was not found.' using errcode = 'P0002';
  end if;

  return v_dealer;
end;
$$;

revoke all on function public.update_my_dealer_logo_placement(uuid, text) from public;
grant execute on function public.update_my_dealer_logo_placement(uuid, text) to authenticated;
