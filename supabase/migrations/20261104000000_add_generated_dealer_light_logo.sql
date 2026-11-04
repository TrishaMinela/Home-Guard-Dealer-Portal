alter table public.dealers
  add column if not exists logo_generated_light_url text null;

comment on column public.dealers.logo_generated_light_url is
  'Server-generated white derivative of logo_url. logo_light_url remains the dealer-supplied override.';
