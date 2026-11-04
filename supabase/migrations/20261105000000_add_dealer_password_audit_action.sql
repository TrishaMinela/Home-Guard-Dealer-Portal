alter table public.dealer_user_access_audit_log
drop constraint if exists dealer_user_access_audit_log_action_check;

alter table public.dealer_user_access_audit_log
add constraint dealer_user_access_audit_log_action_check check (
  action in ('invited','granted','revoked','invite_resent','password_updated')
);

comment on table public.dealer_user_access_audit_log is
  'Credential-free audit history for access-manager changes to dealer memberships and authentication. Passwords are never stored.';
