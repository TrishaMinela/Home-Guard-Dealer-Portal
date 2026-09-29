alter table public.ai_generation_usage
  add column if not exists environment text,
  add column if not exists total_visualization_duration_ms integer,
  add column if not exists completion_token_hash text;

alter table public.ai_generation_usage
  add constraint ai_generation_usage_environment_check
    check (environment is null or environment in ('production', 'preview', 'development')),
  add constraint ai_generation_usage_total_visualization_duration_check
    check (total_visualization_duration_ms is null or total_visualization_duration_ms >= 0),
  add constraint ai_generation_usage_completion_token_hash_key
    unique (completion_token_hash);

create index if not exists ai_generation_usage_environment_created_at_idx
  on public.ai_generation_usage (environment, created_at desc);

comment on column public.ai_generation_usage.environment is
  'Door Builder runtime: production, preview, or development. NULL means the pre-environment record is unknown.';

comment on column public.ai_generation_usage.total_visualization_duration_ms is
  'Successful customer-facing duration from AI workflow start until the generated visualization is rendered and ready.';

comment on column public.ai_generation_usage.completion_token_hash is
  'One-time server-side capability hash used to attach browser-measured total visualization time to its generation record.';
