create or replace function public.openai_provider_sync_secret_valid(p_secret text)
returns boolean
language sql
immutable
security definer
set search_path = public, extensions, pg_temp
as $$
  select p_secret is not null
    and length(p_secret) >= 48
    and encode(extensions.digest(convert_to(p_secret, 'UTF8'), 'sha256'), 'hex')
      = 'f43b0a323df273a372a31cd6b37398e15b97b88604100d32b6a254949dbdf8e1'
$$;

revoke all on function public.openai_provider_sync_secret_valid(text) from public, anon, authenticated;

comment on function public.openai_provider_sync_secret_valid(text) is
  'Validates the normalized server-only Vercel cron secret by SHA-256 digest.';
