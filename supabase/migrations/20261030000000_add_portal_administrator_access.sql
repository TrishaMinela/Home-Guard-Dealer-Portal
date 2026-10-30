-- Portal administrator management reuses the billing access-manager boundary,
-- but grants and revokes the three administrator memberships atomically.
alter table public.billing_access_audit_log
drop constraint billing_access_audit_log_action_check;

alter table public.billing_access_audit_log
add constraint billing_access_audit_log_action_check check (action in (
  'invited','granted','revoked',
  'client_invited','client_granted','client_revoked','client_invite_resent',
  'portal_admin_invited','portal_admin_granted','portal_admin_revoked','portal_admin_invite_resent'
));

create or replace function public.manage_portal_administrator_access(
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

    insert into public.billing_access_managers (user_id, granted_by)
    values (p_target_user_id, p_actor_user_id)
    on conflict (user_id) do nothing;

    if p_invited then
      insert into public.billing_access_audit_log (
        actor_user_id, target_user_id, target_email, action
      ) values (
        p_actor_user_id, p_target_user_id, lower(p_target_email), 'portal_admin_invited'
      );
    end if;

    insert into public.billing_access_audit_log (
      actor_user_id, target_user_id, target_email, action
    ) values (
      p_actor_user_id, p_target_user_id, lower(p_target_email), 'portal_admin_granted'
    );
  elsif p_operation = 'revoke' then
    if p_target_user_id = p_actor_user_id then
      raise exception 'self_revocation_forbidden';
    end if;

    -- A replacement is usable only after confirmation and a successful sign-in.
    -- This prevents removing the current access manager merely because another
    -- invitation is pending.
    if not exists (
      select 1
      from public.home_guard_admins h
      join public.billing_internal_admins i on i.user_id = h.user_id
      join public.billing_access_managers m on m.user_id = h.user_id
      join auth.users u on u.id = h.user_id
      where h.user_id <> p_target_user_id
        and u.email_confirmed_at is not null
        and u.last_sign_in_at is not null
        and coalesce(u.banned_until, '-infinity'::timestamptz) <= now()
    ) then
      raise exception 'last_usable_administrator';
    end if;

    delete from public.billing_access_managers where user_id = p_target_user_id;
    delete from public.billing_internal_admins where user_id = p_target_user_id;
    delete from public.home_guard_admins where user_id = p_target_user_id;

    insert into public.billing_access_audit_log (
      actor_user_id, target_user_id, target_email, action
    ) values (
      p_actor_user_id, p_target_user_id, lower(p_target_email), 'portal_admin_revoked'
    );
  else
    raise exception 'unsupported_operation';
  end if;
end;
$$;

revoke all on function public.manage_portal_administrator_access(uuid,uuid,text,text,boolean)
from public, anon, authenticated;
grant execute on function public.manage_portal_administrator_access(uuid,uuid,text,text,boolean)
to service_role;

comment on function public.manage_portal_administrator_access(uuid,uuid,text,text,boolean) is
  'Atomically manages Portal administrators for a verified billing access manager and prevents administrative lockout.';
