-- Preserve a distinct, searchable audit action for the one-time baseline.
begin;

alter table public.catalog_change_log
  drop constraint catalog_change_log_action_check;

alter table public.catalog_change_log
  add constraint catalog_change_log_action_check
  check (action in ('insert', 'update', 'publish', 'retire', 'import', 'baseline_publish'));

commit;
