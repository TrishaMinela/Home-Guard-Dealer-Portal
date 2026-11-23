-- ZIP lead routing for main HGI Door Builder leads.
-- This file is not applied by the pull request. Routing stays off until
-- lead_routing_settings.routing_enabled is set true by an operator, and
-- notification modes stay disabled until they are changed the same way.
-- Rollback: supabase/rollbacks/20261117160000_add_zip_lead_routing_rollback.sql

create table public.lead_routing_settings (
  singleton boolean primary key default true check (singleton),
  routing_enabled boolean not null default false,
  personify_mode text not null default 'disabled' check (personify_mode in ('disabled', 'dry_run', 'live')),
  dealer_notifications_mode text not null default 'disabled' check (dealer_notifications_mode in ('disabled', 'dry_run', 'live')),
  updated_at timestamptz not null default now()
);

insert into public.lead_routing_settings (singleton) values (true);

create table public.salespeople (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null,
  email text not null,
  personify_contact_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.zip_territory_assignments (
  zip_code text primary key check (zip_code ~ '^[0-9]{5}$'),
  salesperson_id uuid references public.salespeople (id) on delete restrict,
  is_active boolean not null default true,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dealer_zip_coverage (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  zip_code text not null check (zip_code ~ '^[0-9]{5}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealer_zip_coverage_dealer_zip_key unique (dealer_id, zip_code)
);

create table public.zip_rotation_state (
  zip_code text primary key check (zip_code ~ '^[0-9]{5}$'),
  last_dealer_id uuid references public.dealers (id) on delete set null,
  last_advanced_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.lead_routing_cases (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads (id) on delete cascade,
  normalized_zip text check (normalized_zip ~ '^[0-9]{5}$'),
  status text not null check (status in (
    'awaiting_approval',
    'notification_sending',
    'notified',
    'notification_failed',
    'blocked_dealer_inactive',
    'unassigned',
    'no_eligible_dealer'
  )),
  unassigned_reason text check (unassigned_reason in (
    'missing_or_invalid_zip',
    'unknown_zip',
    'inactive_salesperson',
    'inactive_assignment'
  )),
  salesperson_id uuid references public.salespeople (id) on delete set null,
  proposed_dealer_id uuid references public.dealers (id) on delete set null,
  proposal_generated_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_routing_cases_unassigned_has_reason check (status <> 'unassigned' or unassigned_reason is not null)
);

create table public.lead_routing_audit_log (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.lead_routing_cases (id) on delete cascade,
  lead_id uuid not null,
  actor_user_id uuid,
  actor_role text not null,
  action text not null,
  result text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.lead_notification_attempts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.lead_routing_cases (id) on delete cascade,
  lead_id uuid not null,
  channel text not null check (channel in ('personify_salesperson', 'dealer_email')),
  recipient_id uuid,
  idempotency_key text not null unique,
  status text not null check (status in ('sending', 'succeeded', 'failed', 'dry_run')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  last_error text,
  provider_reference text,
  requested_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index lead_routing_cases_salesperson_status_idx
  on public.lead_routing_cases (salesperson_id, status, created_at desc);

create index lead_routing_cases_unassigned_idx
  on public.lead_routing_cases (created_at desc)
  where status = 'unassigned';

create index dealer_zip_coverage_zip_idx
  on public.dealer_zip_coverage (zip_code)
  where is_active;

create index lead_notification_attempts_case_idx
  on public.lead_notification_attempts (case_id, created_at desc);

create index lead_routing_audit_log_case_idx
  on public.lead_routing_audit_log (case_id, created_at desc);

alter table public.lead_routing_settings enable row level security;
alter table public.salespeople enable row level security;
alter table public.zip_territory_assignments enable row level security;
alter table public.dealer_zip_coverage enable row level security;
alter table public.zip_rotation_state enable row level security;
alter table public.lead_routing_cases enable row level security;
alter table public.lead_routing_audit_log enable row level security;
alter table public.lead_notification_attempts enable row level security;

create policy "Home Guard admins read lead routing settings"
on public.lead_routing_settings
for select to authenticated
using (exists (
  select 1 from public.home_guard_admins admins
  where admins.user_id = (select auth.uid())
));

create policy "Home Guard admins read salespeople"
on public.salespeople
for select to authenticated
using (exists (
  select 1 from public.home_guard_admins admins
  where admins.user_id = (select auth.uid())
));

create policy "Salespeople read their own profile"
on public.salespeople
for select to authenticated
using (user_id = (select auth.uid()));

create policy "Home Guard admins read ZIP territories"
on public.zip_territory_assignments
for select to authenticated
using (exists (
  select 1 from public.home_guard_admins admins
  where admins.user_id = (select auth.uid())
));

create policy "Home Guard admins read dealer ZIP coverage"
on public.dealer_zip_coverage
for select to authenticated
using (exists (
  select 1 from public.home_guard_admins admins
  where admins.user_id = (select auth.uid())
));

create policy "Home Guard admins read ZIP rotation"
on public.zip_rotation_state
for select to authenticated
using (exists (
  select 1 from public.home_guard_admins admins
  where admins.user_id = (select auth.uid())
));

create policy "Assigned readers can read routing cases"
on public.lead_routing_cases
for select to authenticated
using (
  exists (
    select 1 from public.home_guard_admins admins
    where admins.user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.salespeople people
    where people.id = lead_routing_cases.salesperson_id
      and people.user_id = (select auth.uid())
      and people.is_active
  )
);

create policy "Assigned readers can read routing audit"
on public.lead_routing_audit_log
for select to authenticated
using (
  exists (
    select 1 from public.home_guard_admins admins
    where admins.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.lead_routing_cases cases
    join public.salespeople people on people.id = cases.salesperson_id
    where cases.id = lead_routing_audit_log.case_id
      and people.user_id = (select auth.uid())
      and people.is_active
  )
);

create policy "Assigned readers can read notification attempts"
on public.lead_notification_attempts
for select to authenticated
using (
  exists (
    select 1 from public.home_guard_admins admins
    where admins.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.lead_routing_cases cases
    join public.salespeople people on people.id = cases.salesperson_id
    where cases.id = lead_notification_attempts.case_id
      and people.user_id = (select auth.uid())
      and people.is_active
  )
);

create policy "Salespeople can read leads assigned to them"
on public.leads
for select to authenticated
using (
  exists (
    select 1
    from public.lead_routing_cases cases
    join public.salespeople people on people.id = cases.salesperson_id
    where cases.lead_id = leads.id
      and people.user_id = (select auth.uid())
      and people.is_active
  )
);

create policy "Salespeople can read the dealer proposed on their lead"
on public.dealers
for select to authenticated
using (
  exists (
    select 1
    from public.lead_routing_cases cases
    join public.salespeople people on people.id = cases.salesperson_id
    where cases.proposed_dealer_id = dealers.id
      and people.user_id = (select auth.uid())
      and people.is_active
  )
);

revoke all on public.lead_routing_settings, public.salespeople, public.zip_territory_assignments,
  public.dealer_zip_coverage, public.zip_rotation_state, public.lead_routing_cases,
  public.lead_routing_audit_log, public.lead_notification_attempts
from public, anon, authenticated;

grant select on public.lead_routing_settings, public.salespeople, public.zip_territory_assignments,
  public.dealer_zip_coverage, public.zip_rotation_state, public.lead_routing_cases,
  public.lead_routing_audit_log, public.lead_notification_attempts
to authenticated;

grant select, insert, update, delete on public.salespeople, public.zip_territory_assignments,
  public.dealer_zip_coverage, public.zip_rotation_state, public.lead_routing_cases,
  public.lead_routing_audit_log, public.lead_notification_attempts
to service_role;

grant select on public.lead_routing_settings to service_role;

create or replace function public.lead_routing_normalize_zip(p_zip text)
returns text
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
declare
  v_zip text := btrim(p_zip);
begin
  if v_zip is null or v_zip = '' then
    return null;
  end if;
  if v_zip ~ '^[0-9]{5}$' then
    return v_zip;
  end if;
  if v_zip ~ '^[0-9]{5}[- ][0-9]{4}$' then
    return left(v_zip, 5);
  end if;
  if v_zip ~ '^[0-9]{9}$' then
    return left(v_zip, 5);
  end if;
  if v_zip ~ '^[0-9]{3,4}$' then
    return lpad(v_zip, 5, '0');
  end if;
  return null;
end;
$$;

create or replace function public.lead_routing_actor_role(p_actor uuid, p_salesperson_id uuid)
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select case
    when p_actor is not null and exists (
      select 1 from public.home_guard_admins admins where admins.user_id = p_actor
    ) then 'home_guard_admin'
    when p_actor is not null and exists (
      select 1 from public.salespeople people
      where people.user_id = p_actor
        and people.id = p_salesperson_id
        and people.is_active
    ) then 'salesperson'
    else null
  end;
$$;

create or replace function public.lead_routing_next_dealer(p_zip text)
returns uuid
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  v_last uuid;
  v_next uuid;
begin
  select rotation.last_dealer_id into v_last
  from public.zip_rotation_state rotation
  where rotation.zip_code = p_zip;

  select dealers.id into v_next
  from public.dealer_zip_coverage coverage
  join public.dealers dealers on dealers.id = coverage.dealer_id
  where coverage.zip_code = p_zip
    and coverage.is_active
    and dealers.is_active
    and dealers.id > coalesce(v_last, '00000000-0000-0000-0000-000000000000'::uuid)
  order by dealers.id
  limit 1;

  if v_next is null then
    select dealers.id into v_next
    from public.dealer_zip_coverage coverage
    join public.dealers dealers on dealers.id = coverage.dealer_id
    where coverage.zip_code = p_zip
      and coverage.is_active
      and dealers.is_active
    order by dealers.id
    limit 1;
  end if;

  return v_next;
end;
$$;

create or replace function public.lead_routing_audit(
  p_case_id uuid,
  p_lead_id uuid,
  p_actor uuid,
  p_role text,
  p_action text,
  p_result text,
  p_detail jsonb
)
returns void
language sql
security invoker
set search_path = pg_catalog
as $$
  insert into public.lead_routing_audit_log (case_id, lead_id, actor_user_id, actor_role, action, result, detail)
  values (p_case_id, p_lead_id, p_actor, p_role, p_action, p_result, coalesce(p_detail, '{}'::jsonb));
$$;

create or replace function public.lead_routing_on_lead_insert()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_enabled boolean;
  v_zip text;
  v_salesperson uuid;
  v_salesperson_active boolean;
  v_assignment_active boolean;
  v_dealer uuid;
  v_case_id uuid;
  v_status text;
  v_reason text;
begin
  select settings.routing_enabled into v_enabled
  from public.lead_routing_settings settings
  where settings.singleton;

  if coalesce(v_enabled, false) is not true then
    return new;
  end if;

  if new.dealer_id is not null or new.source is distinct from 'door_builder' then
    return new;
  end if;

  v_zip := public.lead_routing_normalize_zip(new.zip);
  if v_zip is null then
    v_status := 'unassigned';
    v_reason := 'missing_or_invalid_zip';
  else
    select assignments.salesperson_id, assignments.is_active, people.is_active
      into v_salesperson, v_assignment_active, v_salesperson_active
    from public.zip_territory_assignments assignments
    left join public.salespeople people on people.id = assignments.salesperson_id
    where assignments.zip_code = v_zip;

    if not found then
      v_status := 'unassigned';
      v_reason := 'unknown_zip';
      v_salesperson := null;
    elsif coalesce(v_assignment_active, false) is not true then
      v_status := 'unassigned';
      v_reason := 'inactive_assignment';
      v_salesperson := null;
    elsif v_salesperson is null or coalesce(v_salesperson_active, false) is not true then
      v_status := 'unassigned';
      v_reason := 'inactive_salesperson';
      v_salesperson := null;
    else
      v_dealer := public.lead_routing_next_dealer(v_zip);
      v_status := case when v_dealer is null then 'no_eligible_dealer' else 'awaiting_approval' end;
      v_reason := null;
    end if;
  end if;

  insert into public.lead_routing_cases (
    lead_id, normalized_zip, status, unassigned_reason, salesperson_id, proposed_dealer_id, proposal_generated_at
  ) values (
    new.id,
    v_zip,
    v_status,
    v_reason,
    v_salesperson,
    case when v_status = 'awaiting_approval' then v_dealer else null end,
    case when v_status = 'awaiting_approval' then now() else null end
  )
  returning id into v_case_id;

  perform public.lead_routing_audit(
    v_case_id,
    new.id,
    null,
    'system',
    'route_lead',
    v_status,
    jsonb_build_object('zip', v_zip, 'reason', v_reason, 'proposedDealerId', v_dealer)
  );

  return new;
end;
$$;

create trigger lead_routing_after_lead_insert
after insert on public.leads
for each row
execute function public.lead_routing_on_lead_insert();

create or replace function public.lead_routing_on_salesperson_inactive()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_case public.lead_routing_cases%rowtype;
begin
  for v_case in
    select *
    from public.lead_routing_cases cases
    where cases.salesperson_id = new.id
      and cases.status in ('awaiting_approval', 'notification_failed', 'blocked_dealer_inactive', 'no_eligible_dealer')
    for update
  loop
    update public.lead_routing_cases
      set status = 'unassigned',
          unassigned_reason = 'inactive_salesperson',
          salesperson_id = null,
          proposed_dealer_id = null,
          updated_at = now()
      where id = v_case.id;

    perform public.lead_routing_audit(
      v_case.id,
      v_case.lead_id,
      null,
      'system',
      'salesperson_deactivated',
      'unassigned',
      jsonb_build_object('salespersonId', new.id)
    );
  end loop;
  return new;
end;
$$;

create trigger lead_routing_salesperson_inactive
after update of is_active on public.salespeople
for each row
when (old.is_active and not new.is_active)
execute function public.lead_routing_on_salesperson_inactive();

create or replace function public.lead_routing_claim_dealer_send(
  p_case_id uuid,
  p_actor uuid,
  p_dealer_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_enabled boolean;
  v_mode text;
  v_case public.lead_routing_cases%rowtype;
  v_role text;
  v_dealer_active boolean;
  v_coverage_active boolean;
  v_key text;
  v_attempt public.lead_notification_attempts%rowtype;
begin
  select settings.routing_enabled, settings.dealer_notifications_mode
    into v_enabled, v_mode
  from public.lead_routing_settings settings
  where settings.singleton;

  if coalesce(v_enabled, false) is not true or coalesce(v_mode, 'disabled') = 'disabled' then
    return jsonb_build_object('result', 'disabled');
  end if;

  select * into v_case
  from public.lead_routing_cases
  where id = p_case_id
  for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  v_role := public.lead_routing_actor_role(p_actor, v_case.salesperson_id);
  if v_role is null then
    return jsonb_build_object('result', 'not_authorized');
  end if;

  if v_case.status = 'notified' then
    return jsonb_build_object('result', 'already_sent', 'leadId', v_case.lead_id);
  end if;

  if v_case.status = 'notification_sending' then
    return jsonb_build_object('result', 'in_progress', 'leadId', v_case.lead_id);
  end if;

  if v_case.proposed_dealer_id is null then
    return jsonb_build_object('result', 'no_proposal', 'leadId', v_case.lead_id);
  end if;

  if v_case.proposed_dealer_id <> p_dealer_id then
    return jsonb_build_object('result', 'dealer_mismatch', 'leadId', v_case.lead_id, 'dealerId', v_case.proposed_dealer_id);
  end if;

  if v_case.status not in ('awaiting_approval', 'notification_failed', 'blocked_dealer_inactive') then
    return jsonb_build_object('result', 'wrong_status', 'leadId', v_case.lead_id);
  end if;

  select dealers.is_active into v_dealer_active
  from public.dealers dealers
  where dealers.id = v_case.proposed_dealer_id;

  select coverage.is_active into v_coverage_active
  from public.dealer_zip_coverage coverage
  where coverage.dealer_id = v_case.proposed_dealer_id
    and coverage.zip_code = v_case.normalized_zip;

  if coalesce(v_dealer_active, false) is not true or coalesce(v_coverage_active, false) is not true then
    update public.lead_routing_cases
      set status = 'blocked_dealer_inactive', updated_at = now()
      where id = v_case.id;
    perform public.lead_routing_audit(v_case.id, v_case.lead_id, p_actor, v_role, 'dealer_notification', 'blocked_inactive', jsonb_build_object('dealerId', v_case.proposed_dealer_id));
    return jsonb_build_object('result', 'blocked_inactive', 'leadId', v_case.lead_id, 'dealerId', v_case.proposed_dealer_id);
  end if;

  v_key := 'dealer-email:' || v_case.lead_id::text || ':' || v_case.proposed_dealer_id::text;

  select * into v_attempt
  from public.lead_notification_attempts
  where idempotency_key = v_key
  for update;

  if found then
    if v_attempt.status = 'succeeded' then
      return jsonb_build_object('result', 'already_sent', 'attemptId', v_attempt.id, 'idempotencyKey', v_key, 'leadId', v_case.lead_id, 'dealerId', v_case.proposed_dealer_id);
    elsif v_attempt.status = 'sending' then
      return jsonb_build_object('result', 'in_progress', 'attemptId', v_attempt.id, 'idempotencyKey', v_key, 'leadId', v_case.lead_id, 'dealerId', v_case.proposed_dealer_id);
    end if;

    update public.lead_notification_attempts
      set status = 'sending',
          attempt_count = attempt_count + 1,
          last_error = null,
          updated_at = now(),
          requested_by = p_actor
      where id = v_attempt.id
      returning * into v_attempt;
  else
    insert into public.lead_notification_attempts (
      case_id, lead_id, channel, recipient_id, idempotency_key, status, attempt_count, requested_by
    ) values (
      v_case.id, v_case.lead_id, 'dealer_email', v_case.proposed_dealer_id, v_key, 'sending', 1, p_actor
    )
    returning * into v_attempt;
  end if;

  update public.lead_routing_cases
    set status = 'notification_sending', updated_at = now()
    where id = v_case.id;

  perform public.lead_routing_audit(
    v_case.id, v_case.lead_id, p_actor, v_role, 'dealer_notification', 'claimed',
    jsonb_build_object('dealerId', v_case.proposed_dealer_id, 'idempotencyKey', v_key, 'attempt', v_attempt.attempt_count)
  );

  return jsonb_build_object(
    'result', 'claimed',
    'attemptId', v_attempt.id,
    'idempotencyKey', v_key,
    'leadId', v_case.lead_id,
    'dealerId', v_case.proposed_dealer_id
  );
exception
  when unique_violation then
    return jsonb_build_object('result', 'in_progress', 'leadId', v_case.lead_id);
end;
$$;

create or replace function public.lead_routing_complete_dealer_send(
  p_attempt_id uuid,
  p_result text,
  p_error text default null,
  p_provider_reference text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_mode text;
  v_case_id uuid;
  v_case public.lead_routing_cases%rowtype;
  v_attempt public.lead_notification_attempts%rowtype;
  v_error text;
  v_reference text;
begin
  select settings.dealer_notifications_mode into v_mode
  from public.lead_routing_settings settings
  where settings.singleton;

  if p_result = 'succeeded' and v_mode is distinct from 'live' then
    return jsonb_build_object('result', 'disabled');
  end if;
  if p_result = 'dry_run' and v_mode is distinct from 'dry_run' then
    return jsonb_build_object('result', 'disabled');
  end if;
  if p_result not in ('succeeded', 'failed', 'dry_run') then
    return jsonb_build_object('result', 'ignored');
  end if;

  select attempts.case_id into v_case_id
  from public.lead_notification_attempts attempts
  where attempts.id = p_attempt_id;

  if v_case_id is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  select * into v_case
  from public.lead_routing_cases
  where id = v_case_id
  for update;

  select * into v_attempt
  from public.lead_notification_attempts
  where id = p_attempt_id
  for update;

  if v_attempt.status = 'succeeded' then
    return jsonb_build_object('result', 'already_complete', 'attemptId', v_attempt.id);
  end if;
  if v_attempt.status <> 'sending' or v_case.status <> 'notification_sending' then
    return jsonb_build_object('result', 'ignored', 'attemptId', v_attempt.id);
  end if;

  v_error := left(regexp_replace(coalesce(p_error, ''), '[^A-Za-z0-9_.:-]', '', 'g'), 80);
  if v_error = '' then
    v_error := null;
  end if;
  v_reference := left(regexp_replace(coalesce(p_provider_reference, ''), '[^A-Za-z0-9_-]', '', 'g'), 80);
  if v_reference = '' then
    v_reference := null;
  end if;

  if p_result = 'succeeded' then
    update public.lead_notification_attempts
      set status = 'succeeded', last_error = null, provider_reference = v_reference, sent_at = now(), updated_at = now()
      where id = v_attempt.id;
    update public.lead_routing_cases
      set status = 'notified', approved_by = v_attempt.requested_by, approved_at = now(), updated_at = now()
      where id = v_case.id;
    insert into public.zip_rotation_state (zip_code, last_dealer_id, last_advanced_at)
    values (v_case.normalized_zip, v_case.proposed_dealer_id, now())
    on conflict (zip_code) do update
      set last_dealer_id = excluded.last_dealer_id,
          last_advanced_at = excluded.last_advanced_at,
          updated_at = now();
    perform public.lead_routing_audit(v_case.id, v_case.lead_id, v_attempt.requested_by, 'system', 'dealer_notification', 'succeeded', jsonb_build_object('dealerId', v_case.proposed_dealer_id));
    return jsonb_build_object('result', 'completed');
  end if;

  if p_result = 'dry_run' then
    update public.lead_notification_attempts
      set status = 'dry_run', last_error = null, updated_at = now()
      where id = v_attempt.id;
    update public.lead_routing_cases
      set status = 'awaiting_approval', updated_at = now()
      where id = v_case.id;
    perform public.lead_routing_audit(v_case.id, v_case.lead_id, v_attempt.requested_by, 'system', 'dealer_notification', 'dry_run', jsonb_build_object('dealerId', v_case.proposed_dealer_id));
    return jsonb_build_object('result', 'completed');
  end if;

  update public.lead_notification_attempts
    set status = 'failed', last_error = coalesce(v_error, 'delivery_failed'), updated_at = now()
    where id = v_attempt.id;
  update public.lead_routing_cases
    set status = 'notification_failed', updated_at = now()
    where id = v_case.id;
  perform public.lead_routing_audit(v_case.id, v_case.lead_id, v_attempt.requested_by, 'system', 'dealer_notification', 'failed', jsonb_build_object('dealerId', v_case.proposed_dealer_id, 'error', coalesce(v_error, 'delivery_failed')));
  return jsonb_build_object('result', 'completed');
end;
$$;

create or replace function public.lead_routing_repropose_dealer(p_case_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_enabled boolean;
  v_case public.lead_routing_cases%rowtype;
  v_role text;
  v_dealer_active boolean;
  v_coverage_active boolean;
  v_next uuid;
begin
  select settings.routing_enabled into v_enabled
  from public.lead_routing_settings settings
  where settings.singleton;
  if coalesce(v_enabled, false) is not true then
    return jsonb_build_object('result', 'disabled');
  end if;

  select * into v_case from public.lead_routing_cases where id = p_case_id for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  v_role := public.lead_routing_actor_role(p_actor, v_case.salesperson_id);
  if v_role is null then
    return jsonb_build_object('result', 'not_authorized');
  end if;
  if v_case.status in ('notified', 'notification_sending') then
    return jsonb_build_object('result', 'wrong_status');
  end if;

  select dealers.is_active into v_dealer_active from public.dealers dealers where dealers.id = v_case.proposed_dealer_id;
  select coverage.is_active into v_coverage_active
  from public.dealer_zip_coverage coverage
  where coverage.dealer_id = v_case.proposed_dealer_id
    and coverage.zip_code = v_case.normalized_zip;

  if v_case.proposed_dealer_id is not null and coalesce(v_dealer_active, false) and coalesce(v_coverage_active, false) then
    return jsonb_build_object('result', 'dealer_still_eligible', 'dealerId', v_case.proposed_dealer_id);
  end if;

  v_next := public.lead_routing_next_dealer(v_case.normalized_zip);
  update public.lead_routing_cases
    set proposed_dealer_id = v_next,
        status = case when v_next is null then 'no_eligible_dealer' else 'awaiting_approval' end,
        proposal_generated_at = case when v_next is null then null else now() end,
        unassigned_reason = null,
        updated_at = now()
    where id = v_case.id;

  perform public.lead_routing_audit(v_case.id, v_case.lead_id, p_actor, v_role, 'repropose_dealer', 'proposed', jsonb_build_object('previousDealerId', v_case.proposed_dealer_id, 'dealerId', v_next));
  return jsonb_build_object('result', 'claimed', 'dealerId', v_next);
end;
$$;

create or replace function public.lead_routing_claim_salesperson_notify(p_case_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_enabled boolean;
  v_mode text;
  v_case public.lead_routing_cases%rowtype;
  v_role text;
  v_key text;
  v_attempt public.lead_notification_attempts%rowtype;
begin
  select settings.routing_enabled, settings.personify_mode into v_enabled, v_mode
  from public.lead_routing_settings settings
  where settings.singleton;
  if coalesce(v_enabled, false) is not true or coalesce(v_mode, 'disabled') = 'disabled' then
    return jsonb_build_object('result', 'disabled');
  end if;

  select * into v_case from public.lead_routing_cases where id = p_case_id for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_case.salesperson_id is null then
    return jsonb_build_object('result', 'no_proposal');
  end if;
  v_role := public.lead_routing_actor_role(p_actor, v_case.salesperson_id);
  if v_role is null then
    return jsonb_build_object('result', 'not_authorized');
  end if;

  v_key := 'personify:' || v_case.lead_id::text || ':' || v_case.salesperson_id::text;
  select * into v_attempt from public.lead_notification_attempts where idempotency_key = v_key for update;
  if found and v_attempt.status = 'succeeded' then
    return jsonb_build_object('result', 'already_sent', 'attemptId', v_attempt.id, 'idempotencyKey', v_key);
  elsif found and v_attempt.status = 'sending' then
    return jsonb_build_object('result', 'in_progress', 'attemptId', v_attempt.id, 'idempotencyKey', v_key);
  elsif found then
    update public.lead_notification_attempts
      set status = 'sending', attempt_count = attempt_count + 1, last_error = null, updated_at = now(), requested_by = p_actor
      where id = v_attempt.id
      returning * into v_attempt;
  else
    insert into public.lead_notification_attempts (
      case_id, lead_id, channel, recipient_id, idempotency_key, status, attempt_count, requested_by
    ) values (
      v_case.id, v_case.lead_id, 'personify_salesperson', v_case.salesperson_id, v_key, 'sending', 1, p_actor
    ) returning * into v_attempt;
  end if;

  perform public.lead_routing_audit(v_case.id, v_case.lead_id, p_actor, v_role, 'salesperson_notification', 'claimed', jsonb_build_object('idempotencyKey', v_key));
  return jsonb_build_object('result', 'claimed', 'attemptId', v_attempt.id, 'idempotencyKey', v_key, 'leadId', v_case.lead_id);
exception
  when unique_violation then
    return jsonb_build_object('result', 'in_progress');
end;
$$;

create or replace function public.lead_routing_complete_salesperson_notify(
  p_attempt_id uuid,
  p_result text,
  p_error text default null,
  p_provider_reference text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_mode text;
  v_attempt public.lead_notification_attempts%rowtype;
  v_error text;
  v_reference text;
begin
  select settings.personify_mode into v_mode from public.lead_routing_settings settings where settings.singleton;
  if p_result = 'succeeded' and v_mode is distinct from 'live' then
    return jsonb_build_object('result', 'disabled');
  end if;
  if p_result = 'dry_run' and v_mode is distinct from 'dry_run' then
    return jsonb_build_object('result', 'disabled');
  end if;
  if p_result not in ('succeeded', 'failed', 'dry_run') then
    return jsonb_build_object('result', 'ignored');
  end if;

  select * into v_attempt from public.lead_notification_attempts where id = p_attempt_id for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_attempt.channel <> 'personify_salesperson' then
    return jsonb_build_object('result', 'ignored');
  end if;
  if v_attempt.status = 'succeeded' then
    return jsonb_build_object('result', 'already_complete');
  end if;
  if v_attempt.status <> 'sending' then
    return jsonb_build_object('result', 'ignored');
  end if;

  v_error := nullif(left(regexp_replace(coalesce(p_error, ''), '[^A-Za-z0-9_.:-]', '', 'g'), 80), '');
  v_reference := nullif(left(regexp_replace(coalesce(p_provider_reference, ''), '[^A-Za-z0-9_-]', '', 'g'), 80), '');

  if p_result = 'succeeded' then
    update public.lead_notification_attempts
      set status = 'succeeded', provider_reference = v_reference, sent_at = now(), updated_at = now(), last_error = null
      where id = v_attempt.id;
  elsif p_result = 'dry_run' then
    update public.lead_notification_attempts
      set status = 'dry_run', updated_at = now(), last_error = null
      where id = v_attempt.id;
  else
    update public.lead_notification_attempts
      set status = 'failed', last_error = coalesce(v_error, 'delivery_failed'), updated_at = now()
      where id = v_attempt.id;
  end if;

  perform public.lead_routing_audit(v_attempt.case_id, v_attempt.lead_id, v_attempt.requested_by, 'system', 'salesperson_notification', p_result, jsonb_build_object('error', v_error));
  return jsonb_build_object('result', 'completed');
end;
$$;

create or replace function public.lead_routing_require_admin(p_actor uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select exists (select 1 from public.home_guard_admins admins where admins.user_id = p_actor);
$$;

create or replace function public.lead_routing_save_salesperson(
  p_actor uuid,
  p_user_id uuid,
  p_display_name text,
  p_email text,
  p_personify_contact_id text,
  p_is_active boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_enabled boolean;
  v_name text := btrim(p_display_name);
  v_email text := btrim(p_email);
  v_contact text := nullif(btrim(p_personify_contact_id), '');
begin
  select settings.routing_enabled into v_enabled from public.lead_routing_settings settings where settings.singleton;
  if coalesce(v_enabled, false) is not true then
    return jsonb_build_object('result', 'disabled');
  end if;
  if not public.lead_routing_require_admin(p_actor) then
    return jsonb_build_object('result', 'not_authorized');
  end if;
  if p_user_id is null or v_name = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    return jsonb_build_object('result', 'invalid');
  end if;
  if v_contact is not null and v_contact !~ '^[A-Za-z0-9_-]{1,80}$' then
    return jsonb_build_object('result', 'invalid');
  end if;

  insert into public.salespeople (user_id, display_name, email, personify_contact_id, is_active)
  values (p_user_id, left(v_name, 120), left(v_email, 160), v_contact, coalesce(p_is_active, true))
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        email = excluded.email,
        personify_contact_id = excluded.personify_contact_id,
        is_active = excluded.is_active,
        updated_at = now();
  return jsonb_build_object('result', 'saved');
end;
$$;

create or replace function public.lead_routing_save_territory(
  p_actor uuid,
  p_zip text,
  p_salesperson_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_enabled boolean;
  v_zip text := public.lead_routing_normalize_zip(p_zip);
begin
  select settings.routing_enabled into v_enabled from public.lead_routing_settings settings where settings.singleton;
  if coalesce(v_enabled, false) is not true then
    return jsonb_build_object('result', 'disabled');
  end if;
  if not public.lead_routing_require_admin(p_actor) then
    return jsonb_build_object('result', 'not_authorized');
  end if;
  if v_zip is null then
    return jsonb_build_object('result', 'invalid');
  end if;
  if p_salesperson_id is not null and not exists (select 1 from public.salespeople people where people.id = p_salesperson_id) then
    return jsonb_build_object('result', 'invalid');
  end if;

  insert into public.zip_territory_assignments (zip_code, salesperson_id, is_active, updated_by)
  values (v_zip, p_salesperson_id, coalesce(p_is_active, true), p_actor)
  on conflict (zip_code) do update
    set salesperson_id = excluded.salesperson_id,
        is_active = excluded.is_active,
        updated_by = excluded.updated_by,
        updated_at = now();
  return jsonb_build_object('result', 'saved', 'zip', v_zip);
end;
$$;

create or replace function public.lead_routing_save_coverage(
  p_actor uuid,
  p_dealer_id uuid,
  p_zip text,
  p_is_active boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_enabled boolean;
  v_zip text := public.lead_routing_normalize_zip(p_zip);
begin
  select settings.routing_enabled into v_enabled from public.lead_routing_settings settings where settings.singleton;
  if coalesce(v_enabled, false) is not true then
    return jsonb_build_object('result', 'disabled');
  end if;
  if not public.lead_routing_require_admin(p_actor) then
    return jsonb_build_object('result', 'not_authorized');
  end if;
  if v_zip is null or p_dealer_id is null or not exists (select 1 from public.dealers dealers where dealers.id = p_dealer_id) then
    return jsonb_build_object('result', 'invalid');
  end if;

  insert into public.dealer_zip_coverage (dealer_id, zip_code, is_active)
  values (p_dealer_id, v_zip, coalesce(p_is_active, true))
  on conflict (dealer_id, zip_code) do update
    set is_active = excluded.is_active, updated_at = now();
  return jsonb_build_object('result', 'saved', 'zip', v_zip);
end;
$$;

revoke all on function public.lead_routing_normalize_zip(text) from public, anon, authenticated;
revoke all on function public.lead_routing_actor_role(uuid, uuid) from public, anon, authenticated;
revoke all on function public.lead_routing_next_dealer(text) from public, anon, authenticated;
revoke all on function public.lead_routing_audit(uuid, uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.lead_routing_on_lead_insert() from public, anon, authenticated;
revoke all on function public.lead_routing_on_salesperson_inactive() from public, anon, authenticated;
revoke all on function public.lead_routing_claim_dealer_send(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.lead_routing_complete_dealer_send(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.lead_routing_repropose_dealer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.lead_routing_claim_salesperson_notify(uuid, uuid) from public, anon, authenticated;
revoke all on function public.lead_routing_complete_salesperson_notify(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.lead_routing_require_admin(uuid) from public, anon, authenticated;
revoke all on function public.lead_routing_save_salesperson(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.lead_routing_save_territory(uuid, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.lead_routing_save_coverage(uuid, uuid, text, boolean) from public, anon, authenticated;

grant execute on function public.lead_routing_normalize_zip(text) to service_role;
grant execute on function public.lead_routing_actor_role(uuid, uuid) to service_role;
grant execute on function public.lead_routing_next_dealer(text) to service_role;
grant execute on function public.lead_routing_audit(uuid, uuid, uuid, text, text, text, jsonb) to service_role;
grant execute on function public.lead_routing_on_lead_insert() to service_role;
grant execute on function public.lead_routing_on_salesperson_inactive() to service_role;
grant execute on function public.lead_routing_claim_dealer_send(uuid, uuid, uuid) to service_role;
grant execute on function public.lead_routing_complete_dealer_send(uuid, text, text, text) to service_role;
grant execute on function public.lead_routing_repropose_dealer(uuid, uuid) to service_role;
grant execute on function public.lead_routing_claim_salesperson_notify(uuid, uuid) to service_role;
grant execute on function public.lead_routing_complete_salesperson_notify(uuid, text, text, text) to service_role;
grant execute on function public.lead_routing_require_admin(uuid) to service_role;
grant execute on function public.lead_routing_save_salesperson(uuid, uuid, text, text, text, boolean) to service_role;
grant execute on function public.lead_routing_save_territory(uuid, text, uuid, boolean) to service_role;
grant execute on function public.lead_routing_save_coverage(uuid, uuid, text, boolean) to service_role;

comment on table public.lead_routing_settings is
  'ZIP routing master switches. Defaults keep routing and both notification channels off. Application env flags must also be enabled before the Portal API writes.';

comment on function public.lead_routing_on_lead_insert() is
  'Routes a main HGI Door Builder lead after insert when routing_enabled is true. Never creates a dealer notification.';
