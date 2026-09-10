alter table public.leads
  add column submission_id uuid,
  add column door_configuration jsonb;

alter table public.leads
  add constraint leads_submission_id_key unique (submission_id);
