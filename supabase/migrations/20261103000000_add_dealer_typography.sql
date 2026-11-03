alter table public.dealers
  add column if not exists heading_font_family text null,
  add column if not exists heading_font_weight integer null,
  add column if not exists heading_font_size integer null,
  add column if not exists body_font_family text null,
  add column if not exists body_font_weight integer null,
  add column if not exists body_font_size integer null,
  add column if not exists custom_heading_font_url text null,
  add column if not exists custom_heading_font_name text null,
  add column if not exists custom_heading_font_weight integer null,
  add column if not exists custom_body_font_url text null,
  add column if not exists custom_body_font_name text null,
  add column if not exists custom_body_font_weight integer null;

alter table public.dealers
  add constraint dealers_heading_font_family_check check (heading_font_family is null or heading_font_family in ('system','arial','helvetica','verdana','tahoma','trebuchet','georgia','times','courier','montserrat','caladea','custom')),
  add constraint dealers_body_font_family_check check (body_font_family is null or body_font_family in ('system','arial','helvetica','verdana','tahoma','trebuchet','georgia','times','courier','montserrat','caladea','custom')),
  add constraint dealers_heading_font_weight_check check (heading_font_weight is null or heading_font_weight in (300,400,500,600,700,800)),
  add constraint dealers_body_font_weight_check check (body_font_weight is null or body_font_weight in (300,400,500,600,700,800)),
  add constraint dealers_custom_heading_font_weight_check check (custom_heading_font_weight is null or custom_heading_font_weight in (300,400,500,600,700,800)),
  add constraint dealers_custom_body_font_weight_check check (custom_body_font_weight is null or custom_body_font_weight in (300,400,500,600,700,800)),
  add constraint dealers_heading_font_size_check check (heading_font_size is null or heading_font_size between 24 and 72),
  add constraint dealers_body_font_size_check check (body_font_size is null or body_font_size between 14 and 22);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('dealer-fonts','dealer-fonts',true,2097152,array['font/woff2','font/woff','application/font-woff','application/octet-stream']::text[])
on conflict (id) do update set public=true,file_size_limit=2097152,allowed_mime_types=excluded.allowed_mime_types;

create policy "Public can view dealer fonts" on storage.objects for select to public
using (bucket_id='dealer-fonts');

create policy "Home Guard admins can manage dealer fonts" on storage.objects for all to authenticated
using (bucket_id='dealer-fonts' and exists(select 1 from public.home_guard_admins where user_id=(select auth.uid())))
with check (bucket_id='dealer-fonts' and array_length(storage.foldername(name),1)=1 and storage.filename(name) ~ '^(heading|body)\.(woff2|woff)$' and exists(select 1 from public.home_guard_admins where user_id=(select auth.uid())));

create policy "Dealer admins can upload their own fonts" on storage.objects for insert to authenticated
with check (bucket_id='dealer-fonts' and array_length(storage.foldername(name),1)=1 and storage.filename(name) ~ '^(heading|body)\.(woff2|woff)$' and exists(select 1 from public.dealer_users where user_id=(select auth.uid()) and dealer_id::text=(storage.foldername(name))[1] and role='dealer_admin'));

create policy "Dealer admins can replace their own fonts" on storage.objects for update to authenticated
using (bucket_id='dealer-fonts' and exists(select 1 from public.dealer_users where user_id=(select auth.uid()) and dealer_id::text=(storage.foldername(name))[1] and role='dealer_admin'))
with check (bucket_id='dealer-fonts' and array_length(storage.foldername(name),1)=1 and storage.filename(name) ~ '^(heading|body)\.(woff2|woff)$' and exists(select 1 from public.dealer_users where user_id=(select auth.uid()) and dealer_id::text=(storage.foldername(name))[1] and role='dealer_admin'));

create or replace function public.update_my_dealer_typography(
  p_dealer_id uuid,
  p_heading_font_family text,
  p_heading_font_weight integer,
  p_heading_font_size integer,
  p_body_font_family text,
  p_body_font_weight integer,
  p_body_font_size integer,
  p_custom_heading_font_url text,
  p_custom_heading_font_name text,
  p_custom_heading_font_weight integer,
  p_custom_body_font_url text,
  p_custom_body_font_name text,
  p_custom_body_font_weight integer
)
returns public.dealers language plpgsql security definer set search_path=pg_catalog as $$
declare v_dealer public.dealers;
begin
  if not exists(select 1 from public.dealer_users where user_id=auth.uid() and dealer_id=p_dealer_id and role='dealer_admin') then
    raise exception 'Dealer Admin access is required.' using errcode='42501';
  end if;
  update public.dealers set
    heading_font_family=nullif(btrim(p_heading_font_family),''), heading_font_weight=p_heading_font_weight, heading_font_size=p_heading_font_size,
    body_font_family=nullif(btrim(p_body_font_family),''), body_font_weight=p_body_font_weight, body_font_size=p_body_font_size,
    custom_heading_font_url=nullif(btrim(p_custom_heading_font_url),''), custom_heading_font_name=nullif(btrim(p_custom_heading_font_name),''), custom_heading_font_weight=p_custom_heading_font_weight,
    custom_body_font_url=nullif(btrim(p_custom_body_font_url),''), custom_body_font_name=nullif(btrim(p_custom_body_font_name),''), custom_body_font_weight=p_custom_body_font_weight,
    updated_at=now()
  where id=p_dealer_id returning * into v_dealer;
  if v_dealer.id is null then raise exception 'Dealer record was not found.' using errcode='P0002'; end if;
  return v_dealer;
end $$;

revoke all on function public.update_my_dealer_typography(uuid,text,integer,integer,text,integer,integer,text,text,integer,text,text,integer) from public;
grant execute on function public.update_my_dealer_typography(uuid,text,integer,integer,text,integer,integer,text,text,integer,text,text,integer) to authenticated;
