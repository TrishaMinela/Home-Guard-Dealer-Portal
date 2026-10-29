-- Billing access management is deliberately separate from internal billing access.
create table public.billing_access_managers (
  user_id uuid primary key references auth.users(id) on delete restrict,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.billing_access_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_email text not null,
  action text not null check (action in ('invited','granted','revoked')),
  created_at timestamptz not null default now()
);

create or replace function public.is_billing_access_manager()
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select exists (
    select 1 from public.billing_access_managers
    where user_id=(select auth.uid())
  );
$$;

revoke all on function public.is_billing_access_manager() from public,anon;
grant execute on function public.is_billing_access_manager() to authenticated;

alter table public.billing_access_managers enable row level security;
alter table public.billing_access_audit_log enable row level security;
revoke all on public.billing_access_managers,public.billing_access_audit_log from anon,authenticated;

create policy "Access managers can read access-manager principals"
on public.billing_access_managers for select to authenticated
using (public.is_billing_access_manager());

create policy "Access managers can read billing access audit history"
on public.billing_access_audit_log for select to authenticated
using (public.is_billing_access_manager());

grant select on public.billing_access_managers,public.billing_access_audit_log to authenticated;

-- Bootstrap only the approved School Radius identity. This does not grant any
-- Home Guard, dealer, billing-client, or other Portal membership.
insert into public.billing_access_managers (user_id,granted_by)
values ('9ff44f07-b720-4e51-a5a2-a36fdd1c331a','9ff44f07-b720-4e51-a5a2-a36fdd1c331a')
on conflict (user_id) do nothing;

comment on table public.billing_access_managers is
  'Privileged principals allowed to manage internal billing-admin membership.';
comment on table public.billing_access_audit_log is
  'Credential-free immutable audit history for billing access changes.';
