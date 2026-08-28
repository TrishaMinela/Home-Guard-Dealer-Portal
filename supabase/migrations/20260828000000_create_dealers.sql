create table public.dealers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  slug text not null unique,
  logo_url text,
  primary_contact_name text,
  email text,
  phone text,
  website text,
  address text,
  city text,
  state text,
  zip text,
  primary_color text,
  secondary_color text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dealers enable row level security;
