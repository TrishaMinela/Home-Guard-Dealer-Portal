-- Internal billing administrators are operational Home Guard administrators,
-- but they are deliberately not billing access managers.
create or replace function public.manage_internal_billing_administrator_access(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_target_email text,
  p_operation text,
  p_invited boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.billing_access_managers
    where user_id = p_actor_user_id
  ) then
    raise exception 'permission_denied';
  end if;

  if p_operation = 'grant' then
    if exists (select 1 from public.dealer_users where user_id = p_target_user_id)
       or exists (select 1 from public.billing_account_users where user_id = p_target_user_id) then
      raise exception 'incompatible_portal_role';
    end if;

    insert into public.home_guard_admins (user_id)
    values (p_target_user_id)
    on conflict (user_id) do nothing;

    insert into public.billing_internal_admins (user_id)
    values (p_target_user_id)
    on conflict (user_id) do nothing;

    if p_invited then
      insert into public.billing_access_audit_log (
        actor_user_id, target_user_id, target_email, action
      ) values (
        p_actor_user_id, p_target_user_id, lower(p_target_email), 'invited'
      );
    end if;

    insert into public.billing_access_audit_log (
      actor_user_id, target_user_id, target_email, action
    ) values (
      p_actor_user_id, p_target_user_id, lower(p_target_email), 'granted'
    );
  elsif p_operation = 'revoke' then
    if exists (
      select 1 from public.billing_access_managers
      where user_id = p_target_user_id
    ) then
      raise exception 'access_manager_protected';
    end if;

    delete from public.billing_internal_admins where user_id = p_target_user_id;
    delete from public.home_guard_admins where user_id = p_target_user_id;

    insert into public.billing_access_audit_log (
      actor_user_id, target_user_id, target_email, action
    ) values (
      p_actor_user_id, p_target_user_id, lower(p_target_email), 'revoked'
    );
  else
    raise exception 'unsupported_operation';
  end if;
end;
$$;

revoke all on function public.manage_internal_billing_administrator_access(uuid,uuid,text,text,boolean)
from public, anon, authenticated;
grant execute on function public.manage_internal_billing_administrator_access(uuid,uuid,text,text,boolean)
to service_role;

comment on function public.manage_internal_billing_administrator_access(uuid,uuid,text,text,boolean) is
  'Atomically manages the Home Guard Admin and internal billing memberships without granting access-manager authority.';

-- Repair only the two reviewed, confirmed internal billing administrators.
do $$
declare
  v_expected integer;
begin
  select count(*) into v_expected
  from auth.users u
  join public.billing_internal_admins i on i.user_id = u.id
  where (u.id, lower(u.email)) in (
    ('7e8f74aa-be7a-4f41-abae-80ddc9d0aed6'::uuid, 'trisha.byu@gmail.com'),
    ('45cd5782-20b9-4328-bc79-5d63baf757a9'::uuid, 'billingadmin@test.hgi')
  )
    and u.email_confirmed_at is not null
    and not exists (select 1 from public.billing_access_managers m where m.user_id = u.id)
    and not exists (select 1 from public.billing_account_users b where b.user_id = u.id)
    and not exists (select 1 from public.dealer_users d where d.user_id = u.id);

  if v_expected <> 2 then
    raise exception 'reviewed_internal_billing_admin_guard_failed';
  end if;

  insert into public.home_guard_admins (user_id)
  values
    ('7e8f74aa-be7a-4f41-abae-80ddc9d0aed6'),
    ('45cd5782-20b9-4328-bc79-5d63baf757a9')
  on conflict (user_id) do nothing;
end;
$$;
