-- Optional Door Builder appearance colors.
-- Null means inherit the Door Builder styling already in use.
-- Values are #RRGGBB, or the references primary and secondary, which follow the brand colors.
-- Existing rows stay null. This file is not applied by deploy.
--
-- Do not apply this with an unrestricted supabase db push.
-- On udbcnpjtwhmjzpjjhoph, apply_migration records its own version. The dual-logo
-- file 20261119000000 is already recorded as 20261120071843, logo website URLs as
-- 20261120160435, and door builder webhooks file 20261120190000 as 20261120171419.
-- A full db push can treat those files as pending and try to run them again.
-- Apply only this migration by name.

alter table public.dealers
  add column if not exists door_builder_appearance jsonb null;

comment on column public.dealers.door_builder_appearance is
  'Nullable Door Builder color config. Keys are appearance tokens. Values are #RRGGBB, primary, or secondary. Null inherits the current Door Builder styling.';

create or replace function public.door_builder_appearance_is_valid(config jsonb)
returns boolean
language sql
immutable
as $$
  select
    config is null
    or (
      jsonb_typeof(config) = 'object'
      and octet_length(config::text) <= 8000
      and not exists (
        select 1
        from jsonb_each(config) as entry(key, value)
        where entry.key not in (
          'headerBackground', 'headerText', 'headerIcon', 'headerButtonBackground', 'headerButtonText', 'headerButtonBorder', 'headerAccent',
          'bodyBackground', 'headingText', 'bodyText', 'sectionDivider', 'stepNavBackground', 'stepNavText', 'activeStep',
          'cardBackground', 'cardTitle', 'cardDescription', 'cardBorder', 'cardSelectedBorder', 'cardHoverAccent',
          'previewBackground', 'previewText', 'previewLabel', 'previewDivider', 'previewControlsBackground', 'previewControlsText',
          'primaryButtonBackground', 'primaryButtonText', 'primaryButtonBorder', 'primaryButtonHover',
          'secondaryButtonBackground', 'secondaryButtonText', 'secondaryButtonBorder', 'secondaryButtonHover',
          'footerBackground', 'footerText', 'footerLink', 'footerIcon', 'footerAccent'
        )
        or jsonb_typeof(entry.value) is distinct from 'string'
        or (
          (entry.value #>> '{}') not in ('primary', 'secondary')
          and (entry.value #>> '{}') !~ '^#[0-9a-fA-F]{6}$'
        )
      )
    );
$$;

alter table public.dealers drop constraint if exists dealers_door_builder_appearance_check;
alter table public.dealers add constraint dealers_door_builder_appearance_check
  check (public.door_builder_appearance_is_valid(door_builder_appearance));

-- Dealer admins cannot update dealers directly. This writes only the appearance column.
create or replace function public.update_my_dealer_door_builder_appearance(
  p_dealer_id uuid,
  p_appearance jsonb
)
returns public.dealers
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_config jsonb := case
    when p_appearance is null or p_appearance = 'null'::jsonb or p_appearance = '{}'::jsonb then null
    else p_appearance
  end;
  v_dealer public.dealers;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.door_builder_appearance_is_valid(v_config) then
    raise exception 'Door Builder appearance colors must be a HEX value or a brand color.' using errcode = '22023';
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
  set door_builder_appearance = v_config,
      updated_at = now()
  where id = p_dealer_id
  returning * into v_dealer;

  if v_dealer.id is null then
    raise exception 'Dealer record was not found.' using errcode = 'P0002';
  end if;
  return v_dealer;
end;
$$;

revoke all on function public.update_my_dealer_door_builder_appearance(uuid, jsonb) from public, anon;
grant execute on function public.update_my_dealer_door_builder_appearance(uuid, jsonb) to authenticated;

/*
Rollback:

revoke all on function public.update_my_dealer_door_builder_appearance(uuid, jsonb) from public, anon, authenticated;
drop function if exists public.update_my_dealer_door_builder_appearance(uuid, jsonb);

alter table public.dealers drop constraint if exists dealers_door_builder_appearance_check;
drop function if exists public.door_builder_appearance_is_valid(jsonb);
alter table public.dealers drop column if exists door_builder_appearance;
*/
