-- Extend the credential-free access audit for HGI billing-client membership.
alter table public.billing_access_audit_log
drop constraint billing_access_audit_log_action_check;

alter table public.billing_access_audit_log
add constraint billing_access_audit_log_action_check check (action in (
  'invited','granted','revoked',
  'client_invited','client_granted','client_revoked','client_invite_resent'
));
