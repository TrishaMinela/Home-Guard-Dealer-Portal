create table public.ai_generation_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null,
  model text not null,
  quality text,
  output_size text,
  output_format text,
  input_tokens bigint,
  text_input_tokens bigint,
  image_input_tokens bigint,
  output_tokens bigint,
  image_output_tokens bigint,
  total_tokens bigint,
  estimated_cost_usd numeric(12, 6),
  openai_generation_duration_ms integer,
  total_api_duration_ms integer,
  request_id text not null,
  error_code text,
  constraint ai_generation_usage_status_check
    check (status in ('succeeded', 'failed')),
  constraint ai_generation_usage_token_counts_check
    check (
      (input_tokens is null or input_tokens >= 0)
      and (text_input_tokens is null or text_input_tokens >= 0)
      and (image_input_tokens is null or image_input_tokens >= 0)
      and (output_tokens is null or output_tokens >= 0)
      and (image_output_tokens is null or image_output_tokens >= 0)
      and (total_tokens is null or total_tokens >= 0)
    ),
  constraint ai_generation_usage_cost_check
    check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  constraint ai_generation_usage_durations_check
    check (
      (openai_generation_duration_ms is null or openai_generation_duration_ms >= 0)
      and (total_api_duration_ms is null or total_api_duration_ms >= 0)
    ),
  constraint ai_generation_usage_request_id_key unique (request_id)
);

create index ai_generation_usage_created_at_idx
  on public.ai_generation_usage (created_at desc);

create index ai_generation_usage_status_idx
  on public.ai_generation_usage (status);

alter table public.ai_generation_usage enable row level security;

create policy "Home Guard admins can read AI generation usage"
on public.ai_generation_usage
for select
to authenticated
using (
  exists (
    select 1
    from public.home_guard_admins
    where home_guard_admins.user_id = (select auth.uid())
  )
);
