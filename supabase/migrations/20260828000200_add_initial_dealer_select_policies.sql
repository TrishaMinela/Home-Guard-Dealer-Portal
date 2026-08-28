alter table public.dealer_users enable row level security;
alter table public.dealers enable row level security;

create policy "Authenticated users can read their own dealer memberships"
on public.dealer_users
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Authenticated users can read their associated dealers"
on public.dealers
for select
to authenticated
using (
  exists (
    select 1
    from public.dealer_users
    where dealer_users.dealer_id = dealers.id
      and dealer_users.user_id = (select auth.uid())
  )
);
