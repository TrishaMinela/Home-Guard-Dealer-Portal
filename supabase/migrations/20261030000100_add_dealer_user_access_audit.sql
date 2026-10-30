create table public.dealer_user_access_audit_log (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_email text not null,
  action text not null check (action in ('invited','granted','revoked','invite_resent')),
  created_at timestamptz not null default now()
);

alter table public.dealer_user_access_audit_log enable row level security;
revoke all on public.dealer_user_access_audit_log from anon, authenticated;

create policy "Access managers can read dealer-user access audit history"
on public.dealer_user_access_audit_log for select to authenticated
using (public.is_billing_access_manager());

grant select on public.dealer_user_access_audit_log to authenticated;

comment on table public.dealer_user_access_audit_log is
  'Credential-free audit history for access-manager changes to dealer memberships.';
