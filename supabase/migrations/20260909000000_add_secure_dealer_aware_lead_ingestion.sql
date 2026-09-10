alter table public.leads
  alter column dealer_id drop not null;

create or replace function public.submit_public_lead(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_dealer_slug text default null,
  p_phone text default null,
  p_address text default null,
  p_city text default null,
  p_state text default null,
  p_zip text default null,
  p_preferred_contact_method text default null,
  p_project_timeline text default null,
  p_comments text default null,
  p_source text default null,
  p_visualizer_url text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_dealer_id uuid;
  v_dealer_is_active boolean;
  v_dealer_slug text := nullif(lower(btrim(p_dealer_slug)), '');
  v_lead_id uuid;
begin
  if nullif(btrim(p_first_name), '') is null then
    raise exception 'First name is required.' using errcode = '22023';
  end if;

  if nullif(btrim(p_last_name), '') is null then
    raise exception 'Last name is required.' using errcode = '22023';
  end if;

  if nullif(btrim(p_email), '') is null then
    raise exception 'Email is required.' using errcode = '22023';
  end if;

  if v_dealer_slug is not null then
    select dealers.id, dealers.is_active
      into v_dealer_id, v_dealer_is_active
    from public.dealers
    where dealers.slug = v_dealer_slug;

    if not found then
      raise exception 'Invalid dealer URL.' using errcode = '22023';
    end if;

    if not v_dealer_is_active then
      raise exception 'This dealer URL is inactive.' using errcode = '22023';
    end if;
  end if;

  insert into public.leads (
    dealer_id,
    first_name,
    last_name,
    email,
    phone,
    address,
    city,
    state,
    zip,
    preferred_contact_method,
    project_timeline,
    comments,
    source,
    visualizer_url,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content
  )
  values (
    v_dealer_id,
    btrim(p_first_name),
    btrim(p_last_name),
    btrim(p_email),
    nullif(btrim(p_phone), ''),
    nullif(btrim(p_address), ''),
    nullif(btrim(p_city), ''),
    nullif(btrim(p_state), ''),
    nullif(btrim(p_zip), ''),
    nullif(btrim(p_preferred_contact_method), ''),
    nullif(btrim(p_project_timeline), ''),
    nullif(btrim(p_comments), ''),
    nullif(btrim(p_source), ''),
    nullif(btrim(p_visualizer_url), ''),
    nullif(btrim(p_utm_source), ''),
    nullif(btrim(p_utm_medium), ''),
    nullif(btrim(p_utm_campaign), ''),
    nullif(btrim(p_utm_content), '')
  )
  returning id into v_lead_id;

  return v_lead_id;
end;
$$;

revoke all on function public.submit_public_lead(
  text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text
) from public;

grant execute on function public.submit_public_lead(
  text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text
) to anon, authenticated;

comment on function public.submit_public_lead(
  text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text
) is 'Creates an HGI-direct or dealer-attributed lead after resolving an optional active dealer slug server-side.';
