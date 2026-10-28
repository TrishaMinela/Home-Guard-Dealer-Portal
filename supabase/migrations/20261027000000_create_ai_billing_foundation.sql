-- Phase A foundation. Existing AI telemetry policies and resolve_ai_admin_issue stay unchanged.
create extension if not exists btree_gist with schema extensions;

create table public.billing_internal_admins (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.billing_accounts (
  id uuid primary key default gen_random_uuid(), account_key text not null unique, name text not null,
  currency text not null default 'usd' check (currency = 'usd'), next_billing_date date,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.billing_account_users (
  id uuid primary key default gen_random_uuid(), billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer','account_admin')), created_at timestamptz not null default now(),
  unique (billing_account_id,user_id)
);
create table public.billing_pricing_versions (
  id uuid primary key default gen_random_uuid(), billing_account_id uuid not null references public.billing_accounts(id) on delete restrict,
  currency text not null default 'usd' check (currency = 'usd'), pricing_scope text not null default 'ai_visualizer' check (pricing_scope = 'ai_visualizer'),
  markup_basis_points integer not null check (markup_basis_points between 0 and 10000), effective_from date not null, effective_until date,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
  check (effective_until is null or effective_until > effective_from), unique (id,billing_account_id),
  unique (billing_account_id,currency,pricing_scope,effective_from),
  exclude using gist (billing_account_id with =, currency with =, pricing_scope with =, daterange(effective_from,effective_until,'[)') with &&)
);
create table public.billing_periods (
  id uuid primary key default gen_random_uuid(), billing_account_id uuid not null references public.billing_accounts(id) on delete restrict,
  pricing_version_id uuid not null, period_start date not null, period_end date not null,
  status text not null default 'open' check (status in ('open','ready','finalized','void')),
  provider_data_complete boolean not null default false, data_complete_through date, finalized_at timestamptz,
  finalized_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (period_end > period_start), check (data_complete_through is null or (data_complete_through >= period_start and data_complete_through < period_end)),
  check (status <> 'finalized' or (provider_data_complete and finalized_at is not null)),
  unique (id,billing_account_id), unique (billing_account_id,period_start,period_end),
  exclude using gist (billing_account_id with =, daterange(period_start,period_end,'[)') with &&),
  foreign key (pricing_version_id,billing_account_id) references public.billing_pricing_versions(id,billing_account_id) on delete restrict
);
create table public.billing_provider_period_costs (
  id uuid primary key default gen_random_uuid(), billing_period_id uuid not null unique, billing_account_id uuid not null,
  provider text not null default 'openai', provider_project_id text not null, provider_cost_micros bigint not null check (provider_cost_micros >= 0),
  provider_request_count integer not null check (provider_request_count >= 0), source_fingerprint text not null,
  reconciled_at timestamptz not null, created_at timestamptz not null default now(),
  foreign key (billing_period_id,billing_account_id) references public.billing_periods(id,billing_account_id) on delete restrict
);
create table public.billing_client_usage_daily (
  id uuid primary key default gen_random_uuid(), billing_account_id uuid not null references public.billing_accounts(id) on delete restrict,
  usage_date date not null, ai_usage_charge_cents integer not null check (ai_usage_charge_cents >= 0),
  image_generation_count integer check (image_generation_count is null or image_generation_count >= 0),
  is_provisional boolean not null default true, updated_at timestamptz not null default now(), unique (billing_account_id,usage_date)
);
create table public.billing_charge_summaries (
  id uuid primary key default gen_random_uuid(), billing_period_id uuid not null unique, billing_account_id uuid not null,
  billing_period_start date not null, billing_period_end date not null, ai_usage_charge_cents integer not null check (ai_usage_charge_cents >= 0),
  image_generation_count integer check (image_generation_count is null or image_generation_count >= 0),
  status text not null check (status in ('provisional','finalized')), data_complete_through date, updated_at timestamptz not null default now(),
  check (billing_period_end > billing_period_start), unique (billing_account_id,billing_period_start,billing_period_end),
  foreign key (billing_period_id,billing_account_id) references public.billing_periods(id,billing_account_id) on delete restrict
);
create table public.billing_invoices (
  id uuid primary key default gen_random_uuid(), billing_account_id uuid not null, billing_period_id uuid not null unique,
  invoice_number text not null unique, billing_period_start date not null, billing_period_end date not null,
  ai_usage_charge_cents integer not null check (ai_usage_charge_cents >= 0), total_due_cents integer not null check (total_due_cents >= 0),
  amount_remaining_cents integer not null check (amount_remaining_cents >= 0), status text not null default 'draft' check (status in ('draft','open','paid','overdue','void')),
  issued_at timestamptz, due_at timestamptz, finalized_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (billing_period_end > billing_period_start), check (status = 'draft' or finalized_at is not null), unique (id,billing_account_id),
  foreign key (billing_period_id,billing_account_id) references public.billing_periods(id,billing_account_id) on delete restrict
);
create table public.billing_invoice_items (
  id uuid primary key default gen_random_uuid(), invoice_id uuid not null, billing_account_id uuid not null,
  description text not null check (description = 'AI Usage Charges'), amount_cents integer not null check (amount_cents >= 0), created_at timestamptz not null default now(),
  foreign key (invoice_id,billing_account_id) references public.billing_invoices(id,billing_account_id) on delete restrict
);
-- Provider identifiers remain physically isolated from client-readable tables.
create table public.billing_stripe_accounts (
  billing_account_id uuid primary key references public.billing_accounts(id) on delete restrict,
  stripe_customer_id text not null unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.billing_stripe_invoices (
  invoice_id uuid primary key references public.billing_invoices(id) on delete restrict,
  stripe_invoice_id text not null unique, hosted_invoice_url text, invoice_pdf_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.billing_payment_references (
  id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.billing_invoices(id) on delete restrict,
  provider text not null default 'stripe' check (provider = 'stripe'), provider_payment_id text not null unique,
  status text not null check (status in ('pending','succeeded','failed','refunded')), amount_cents integer not null check (amount_cents >= 0),
  occurred_at timestamptz not null, created_at timestamptz not null default now()
);
create table public.billing_audit_log (
  id uuid primary key default gen_random_uuid(), billing_account_id uuid references public.billing_accounts(id) on delete restrict,
  billing_period_id uuid references public.billing_periods(id) on delete restrict, invoice_id uuid references public.billing_invoices(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null, action text not null, reason text,
  before_state jsonb, after_state jsonb, created_at timestamptz not null default now()
);

create or replace function public.is_billing_internal_admin() returns boolean language sql stable security definer set search_path=public,pg_temp
as $$ select exists(select 1 from public.billing_internal_admins where user_id=(select auth.uid())); $$;
create or replace function public.can_access_billing_account(p_billing_account_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp
as $$ select public.is_billing_internal_admin() or exists(select 1 from public.billing_account_users where user_id=(select auth.uid()) and billing_account_id=p_billing_account_id); $$;
revoke all on function public.is_billing_internal_admin() from public,anon;
revoke all on function public.can_access_billing_account(uuid) from public,anon;
grant execute on function public.is_billing_internal_admin() to authenticated;
grant execute on function public.can_access_billing_account(uuid) to authenticated;

create or replace function public.protect_finalized_billing_record() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if (tg_table_name='billing_periods' and old.status='finalized') or (tg_table_name='billing_charge_summaries' and old.status='finalized') or (tg_table_name='billing_invoices' and old.status<>'draft') then
    raise exception 'Finalized billing records are immutable; use an explicit adjustment workflow';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger protect_finalized_billing_period before update or delete on public.billing_periods for each row execute function public.protect_finalized_billing_record();
create trigger protect_finalized_billing_summary before update or delete on public.billing_charge_summaries for each row execute function public.protect_finalized_billing_record();
create trigger protect_finalized_billing_invoice before update or delete on public.billing_invoices for each row execute function public.protect_finalized_billing_record();

create or replace function public.protect_finalized_period_input() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_period_id uuid;
begin
  if tg_table_name='billing_provider_period_costs' then v_period_id:=old.billing_period_id;
  elsif tg_table_name='billing_pricing_versions' then
    if exists(select 1 from public.billing_periods where pricing_version_id=old.id and status='finalized') then raise exception 'Pricing used by a finalized period is immutable'; end if;
    return case when tg_op='DELETE' then old else new end;
  elsif tg_table_name='billing_client_usage_daily' then
    if exists(select 1 from public.billing_periods where billing_account_id=old.billing_account_id and status='finalized' and old.usage_date>=period_start and old.usage_date<period_end) then raise exception 'Usage for a finalized period is immutable'; end if;
    return case when tg_op='DELETE' then old else new end;
  end if;
  if exists(select 1 from public.billing_periods where id=v_period_id and status='finalized') then raise exception 'Inputs for a finalized period are immutable'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger protect_finalized_provider_cost before update or delete on public.billing_provider_period_costs for each row execute function public.protect_finalized_period_input();
create trigger protect_finalized_pricing before update or delete on public.billing_pricing_versions for each row execute function public.protect_finalized_period_input();
create trigger protect_finalized_daily_usage before update or delete on public.billing_client_usage_daily for each row execute function public.protect_finalized_period_input();

create or replace function public.protect_finalized_invoice_child() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_invoice_id uuid:=case when tg_table_name='billing_stripe_invoices' then old.invoice_id else old.invoice_id end;
begin
  if exists(select 1 from public.billing_invoices where id=v_invoice_id and status<>'draft') then raise exception 'Finalized invoice details are immutable'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger protect_finalized_invoice_item before update or delete on public.billing_invoice_items for each row execute function public.protect_finalized_invoice_child();
create trigger protect_finalized_stripe_invoice before update or delete on public.billing_stripe_invoices for each row execute function public.protect_finalized_invoice_child();

create or replace function public.validate_billing_period_snapshot() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_period public.billing_periods;
begin
  select * into v_period from public.billing_periods where id=new.billing_period_id and billing_account_id=new.billing_account_id;
  if v_period.id is null or new.billing_period_start<>v_period.period_start or new.billing_period_end<>v_period.period_end then
    raise exception 'Billing snapshot must match its account and period';
  end if;
  return new;
end $$;
create trigger validate_billing_summary_period before insert or update on public.billing_charge_summaries for each row execute function public.validate_billing_period_snapshot();
create trigger validate_billing_invoice_period before insert or update on public.billing_invoices for each row execute function public.validate_billing_period_snapshot();

alter table public.billing_internal_admins enable row level security;
alter table public.billing_accounts enable row level security;
alter table public.billing_account_users enable row level security;
alter table public.billing_pricing_versions enable row level security;
alter table public.billing_periods enable row level security;
alter table public.billing_provider_period_costs enable row level security;
alter table public.billing_client_usage_daily enable row level security;
alter table public.billing_charge_summaries enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_invoice_items enable row level security;
alter table public.billing_stripe_accounts enable row level security;
alter table public.billing_stripe_invoices enable row level security;
alter table public.billing_payment_references enable row level security;
alter table public.billing_audit_log enable row level security;
revoke all on public.billing_internal_admins,public.billing_accounts,public.billing_account_users,public.billing_pricing_versions,public.billing_periods,public.billing_provider_period_costs,public.billing_client_usage_daily,public.billing_charge_summaries,public.billing_invoices,public.billing_invoice_items,public.billing_stripe_accounts,public.billing_stripe_invoices,public.billing_payment_references,public.billing_audit_log from anon,authenticated;

create policy "Users can read their billing membership" on public.billing_account_users for select to authenticated using(user_id=(select auth.uid()) or public.is_billing_internal_admin());
create policy "Authorized users can read billing accounts" on public.billing_accounts for select to authenticated using(public.can_access_billing_account(id));
create policy "Authorized users can read client daily charges" on public.billing_client_usage_daily for select to authenticated using(public.can_access_billing_account(billing_account_id));
create policy "Authorized users can read client charge summaries" on public.billing_charge_summaries for select to authenticated using(public.can_access_billing_account(billing_account_id));
create policy "Authorized users can read invoices" on public.billing_invoices for select to authenticated using(public.can_access_billing_account(billing_account_id));
create policy "Authorized users can read invoice items" on public.billing_invoice_items for select to authenticated using(public.can_access_billing_account(billing_account_id));
create policy "Internal billing admins can read principals" on public.billing_internal_admins for select to authenticated using(public.is_billing_internal_admin());
create policy "Internal billing admins can read pricing" on public.billing_pricing_versions for select to authenticated using(public.is_billing_internal_admin());
create policy "Internal billing admins can read periods" on public.billing_periods for select to authenticated using(public.is_billing_internal_admin());
create policy "Internal billing admins can read provider costs" on public.billing_provider_period_costs for select to authenticated using(public.is_billing_internal_admin());
create policy "Internal billing admins can read Stripe accounts" on public.billing_stripe_accounts for select to authenticated using(public.is_billing_internal_admin());
create policy "Internal billing admins can read Stripe invoices" on public.billing_stripe_invoices for select to authenticated using(public.is_billing_internal_admin());
create policy "Internal billing admins can read payments" on public.billing_payment_references for select to authenticated using(public.is_billing_internal_admin());
create policy "Internal billing admins can read audit" on public.billing_audit_log for select to authenticated using(public.is_billing_internal_admin());
grant select on public.billing_internal_admins,public.billing_accounts,public.billing_account_users,public.billing_pricing_versions,public.billing_periods,public.billing_provider_period_costs,public.billing_client_usage_daily,public.billing_charge_summaries,public.billing_invoices,public.billing_invoice_items,public.billing_stripe_accounts,public.billing_stripe_invoices,public.billing_payment_references,public.billing_audit_log to authenticated;

create index billing_account_users_user_idx on public.billing_account_users(user_id);
create index billing_client_usage_daily_account_date_idx on public.billing_client_usage_daily(billing_account_id,usage_date desc);
create index billing_invoices_account_period_idx on public.billing_invoices(billing_account_id,billing_period_start desc);
create index billing_audit_log_account_created_idx on public.billing_audit_log(billing_account_id,created_at desc);
comment on table public.billing_provider_period_costs is 'CONFIDENTIAL: provider costs; never expose through client APIs.';
comment on table public.billing_pricing_versions is 'CONFIDENTIAL: versioned internal pricing; never expose through client APIs.';
comment on table public.billing_charge_summaries is 'Client-safe AI Usage Charges without provider cost or margin.';
