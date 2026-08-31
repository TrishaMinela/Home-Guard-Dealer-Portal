create table public.leads (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete restrict,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  preferred_contact_method text,
  project_timeline text,
  comments text,
  status text not null default 'new',
  source text,
  visualizer_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_dealer_id_idx
  on public.leads (dealer_id);

create index leads_created_at_idx
  on public.leads (created_at desc);

create index leads_status_idx
  on public.leads (status);

alter table public.leads enable row level security;

create policy "Authenticated dealer users can read their dealer leads"
on public.leads
for select
to authenticated
using (
  exists (
    select 1
    from public.dealer_users
    where dealer_users.dealer_id = leads.dealer_id
      and dealer_users.user_id = (select auth.uid())
  )
);
