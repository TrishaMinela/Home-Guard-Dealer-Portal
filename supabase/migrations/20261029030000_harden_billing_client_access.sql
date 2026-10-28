create or replace function public.is_billing_client_for_account(p_billing_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.billing_account_users membership
      where membership.user_id = (select auth.uid())
        and membership.billing_account_id = p_billing_account_id
    )
    and not exists (
      select 1 from public.home_guard_admins
      where user_id = (select auth.uid())
    )
    and not exists (
      select 1 from public.billing_internal_admins
      where user_id = (select auth.uid())
    )
    and not exists (
      select 1 from public.dealer_users
      where user_id = (select auth.uid())
    );
$$;

create or replace function public.can_access_billing_account(p_billing_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_billing_internal_admin()
    or public.is_billing_client_for_account(p_billing_account_id);
$$;

create or replace function public.list_billing_client_accounts()
returns table(id uuid, name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select account.id, account.name
  from public.billing_accounts account
  join public.billing_account_users membership
    on membership.billing_account_id = account.id
  where membership.user_id = (select auth.uid())
    and account.is_active
    and public.is_billing_client_for_account(account.id)
  order by account.name, account.id;
$$;

revoke all on function public.is_billing_client_for_account(uuid) from public, anon;
revoke all on function public.can_access_billing_account(uuid) from public, anon;
revoke all on function public.list_billing_client_accounts() from public, anon;
grant execute on function public.is_billing_client_for_account(uuid) to authenticated;
grant execute on function public.can_access_billing_account(uuid) to authenticated;
grant execute on function public.list_billing_client_accounts() to authenticated;

comment on function public.is_billing_client_for_account(uuid) is
  'Returns true only for an explicitly assigned billing-only user with no admin, internal billing, or dealer role.';
comment on function public.list_billing_client_accounts() is
  'Returns only active billing accounts explicitly assigned to the authenticated billing-client user.';
