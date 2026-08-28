create table public.dealer_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  role text not null default 'dealer_admin',
  created_at timestamptz not null default now(),
  constraint dealer_users_user_id_dealer_id_key unique (user_id, dealer_id)
);

create index dealer_users_dealer_id_idx
  on public.dealer_users (dealer_id);

alter table public.dealer_users enable row level security;
