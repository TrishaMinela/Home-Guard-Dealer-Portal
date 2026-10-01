alter table public.ai_generation_usage
  add column if not exists entrance_stage_duration_ms integer;

alter table public.ai_generation_usage
  add constraint ai_generation_usage_entrance_stage_duration_check
  check (entrance_stage_duration_ms is null or entrance_stage_duration_ms >= 0);

comment on column public.ai_generation_usage.entrance_stage_duration_ms is
  'Customer-visible wall-clock time from entrance analysis start until detection, validation, and compatibility evaluation are complete.';
