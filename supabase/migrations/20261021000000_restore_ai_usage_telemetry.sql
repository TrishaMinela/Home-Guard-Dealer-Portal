alter table public.ai_generation_usage
  add column if not exists provider_request_id text,
  add column if not exists workflow_request_id text;

alter table public.ai_entrance_detection_usage
  add column if not exists provider_request_id text;

create unique index if not exists ai_generation_usage_provider_request_id_key
  on public.ai_generation_usage (provider_request_id)
  where provider_request_id is not null;

create index if not exists ai_generation_usage_workflow_request_id_idx
  on public.ai_generation_usage (workflow_request_id)
  where workflow_request_id is not null;

create unique index if not exists ai_entrance_detection_usage_provider_request_id_key
  on public.ai_entrance_detection_usage (provider_request_id)
  where provider_request_id is not null;

comment on column public.ai_generation_usage.provider_request_id is
  'Sanitized OpenAI request identifier used for provider-level deduplication and support correlation.';

comment on column public.ai_generation_usage.workflow_request_id is
  'Entrance-analysis workflow request identifier associated with this image-generation attempt, when available.';

comment on column public.ai_entrance_detection_usage.provider_request_id is
  'Sanitized OpenAI request identifier used for provider-level deduplication and support correlation.';
