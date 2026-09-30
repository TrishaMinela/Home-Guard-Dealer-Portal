create table public.ai_entrance_detection_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null,
  environment text not null,
  model text not null,
  pass_type text not null,
  input_tokens bigint,
  cached_input_tokens bigint,
  output_tokens bigint,
  reasoning_tokens bigint,
  total_tokens bigint,
  estimated_cost_usd numeric(12, 6),
  detection_duration_ms integer,
  request_id text not null,
  workflow_request_id text not null,
  error_code text,
  constraint ai_entrance_detection_usage_status_check
    check (status in ('succeeded', 'failed')),
  constraint ai_entrance_detection_usage_environment_check
    check (environment in ('production', 'preview', 'development')),
  constraint ai_entrance_detection_usage_pass_type_check
    check (pass_type in ('primary', 'verification')),
  constraint ai_entrance_detection_usage_token_counts_check
    check (
      (input_tokens is null or input_tokens >= 0)
      and (cached_input_tokens is null or cached_input_tokens >= 0)
      and (output_tokens is null or output_tokens >= 0)
      and (reasoning_tokens is null or reasoning_tokens >= 0)
      and (total_tokens is null or total_tokens >= 0)
      and (cached_input_tokens is null or input_tokens is null or cached_input_tokens <= input_tokens)
    ),
  constraint ai_entrance_detection_usage_cost_check
    check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  constraint ai_entrance_detection_usage_duration_check
    check (detection_duration_ms is null or detection_duration_ms >= 0),
  constraint ai_entrance_detection_usage_request_id_key unique (request_id)
);

create index ai_entrance_detection_usage_created_at_idx
  on public.ai_entrance_detection_usage (created_at desc);

create index ai_entrance_detection_usage_environment_created_at_idx
  on public.ai_entrance_detection_usage (environment, created_at desc);

create index ai_entrance_detection_usage_workflow_request_id_idx
  on public.ai_entrance_detection_usage (workflow_request_id);

alter table public.ai_entrance_detection_usage enable row level security;

create policy "Home Guard admins can read AI entrance detection usage"
on public.ai_entrance_detection_usage
for select
to authenticated
using (
  exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);

comment on table public.ai_entrance_detection_usage is
  'Operational telemetry for real GPT entrance-analysis calls. Does not contain images, prompts, or customer data.';
