-- Synthetic ZIP routing scenarios. Fails the session on the first broken expectation.

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333');

insert into public.home_guard_admins (user_id) values ('11111111-1111-4111-8111-111111111111');

insert into public.salespeople (id, user_id, display_name, email, personify_contact_id, is_active) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '22222222-2222-4222-8222-222222222222', 'Jordan Hale', 'jordan.hale@example.com', 'contact_jordan', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '33333333-3333-4333-8333-333333333333', 'Riley Chen', 'riley.chen@example.com', null, false);

insert into public.dealers (id, company_name, slug, email, is_active) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Northwind Exteriors', 'northwind', 'northwind@example.com', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Lakeshore Home Improvements', 'lakeshore', 'lakeshore@example.com', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', 'America''s Best Windows and Doors', 'americas-best-windows-and-doors', 'ab@example.com', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5', 'Windows Doors and More', 'wdm', 'wdm@example.com', true);

insert into public.zip_territory_assignments (zip_code, salesperson_id, is_active) values
  ('46204', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true),
  ('00501', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true),
  ('30301', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', false);

insert into public.dealer_zip_coverage (dealer_id, zip_code, is_active) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '46204', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '46204', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '00501', true);

create temp table scenario_ids (name text primary key, id uuid);

do $$
declare
  v_result jsonb;
  v_lead uuid;
begin
  v_result := public.lead_routing_save_territory('11111111-1111-4111-8111-111111111111', '11111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
  if v_result->>'result' <> 'disabled' then
    raise exception 'disabled save returned %', v_result;
  end if;
  if exists (select 1 from public.zip_territory_assignments where zip_code = '11111') then
    raise exception 'disabled save wrote a territory';
  end if;

  insert into public.leads (first_name, last_name, email, zip, source, dealer_id)
  values ('Before', 'Enable', 'before@example.com', '46204', 'door_builder', null)
  returning id into v_lead;
  if exists (select 1 from public.lead_routing_cases where lead_id = v_lead) then
    raise exception 'routing wrote a case while disabled';
  end if;
end $$;

update public.lead_routing_settings
  set routing_enabled = true, dealer_notifications_mode = 'live', personify_mode = 'disabled';

do $$
declare
  v_result jsonb;
  v_lead uuid;
  v_case public.lead_routing_cases%rowtype;
begin
  v_result := public.lead_routing_save_territory('22222222-2222-4222-8222-222222222222', '11111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
  if v_result->>'result' <> 'not_authorized' then
    raise exception 'salesperson save returned %', v_result;
  end if;

  insert into public.leads (first_name, last_name, email, zip, source, door_configuration)
  values ('Avery', 'Stone', 'avery@example.com', '46204-1234', 'door_builder', '{"schemaVersion":1,"configuration":{"doorLine":"Smooth-Star"}}'::jsonb)
  returning id into v_lead;
  insert into scenario_ids values ('lead1', v_lead);
  select * into v_case from public.lead_routing_cases where lead_id = v_lead;
  if v_case.normalized_zip <> '46204' or v_case.status <> 'awaiting_approval' or v_case.proposed_dealer_id <> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1' then
    raise exception 'first proposal was % % %', v_case.normalized_zip, v_case.status, v_case.proposed_dealer_id;
  end if;
  if exists (select 1 from public.lead_notification_attempts where lead_id = v_lead) then
    raise exception 'dealer notification existed before approval';
  end if;

  insert into public.leads (first_name, last_name, email, zip, source, dealer_id)
  values ('Dealer', 'Slug', 'slug@example.com', '46204', 'door_builder', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4');
  insert into public.leads (first_name, last_name, email, zip, source, dealer_id)
  values ('Wdm', 'Lead', 'wdm@example.com', '46204', 'door_builder', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5');
  if (select count(*) from public.lead_routing_cases) <> 1 then
    raise exception 'dealer-specific leads were routed';
  end if;

  insert into public.leads (first_name, last_name, email, zip, source) values ('Bad', 'Zip', 'bad@example.com', 'ZIP', 'door_builder');
  insert into public.leads (first_name, last_name, email, zip, source) values ('No', 'Zip', 'nozip@example.com', null, 'door_builder');
  insert into public.leads (first_name, last_name, email, zip, source) values ('Short', 'Zip', 'short@example.com', '501', 'door_builder');
  insert into public.leads (first_name, last_name, email, zip, source) values ('Unknown', 'Zip', 'unknown@example.com', '99999', 'door_builder');
  insert into public.leads (first_name, last_name, email, zip, source) values ('Inactive', 'Assignment', 'inactive-assignment@example.com', '30301', 'door_builder');

  if (select count(*) from public.lead_routing_cases where unassigned_reason = 'missing_or_invalid_zip') <> 2 then
    raise exception 'invalid ZIP handling failed';
  end if;
  if not exists (select 1 from public.lead_routing_cases where normalized_zip = '00501' and unassigned_reason = 'inactive_salesperson' and salesperson_id is null) then
    raise exception 'inactive salesperson was not queued as unassigned';
  end if;
  if not exists (select 1 from public.lead_routing_cases where normalized_zip = '99999' and unassigned_reason = 'unknown_zip') then
    raise exception 'unknown ZIP was not queued';
  end if;
  if not exists (select 1 from public.lead_routing_cases where normalized_zip = '30301' and unassigned_reason = 'inactive_assignment') then
    raise exception 'inactive assignment was not queued';
  end if;
end $$;

do $$
declare
  v_lead uuid;
  v_case_id uuid;
  v_dealer uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  v_other uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_actor uuid := '22222222-2222-4222-8222-222222222222';
  v_admin uuid := '11111111-1111-4111-8111-111111111111';
  v_other_actor uuid := '33333333-3333-4333-8333-333333333333';
  v_claim jsonb;
  v_complete jsonb;
  v_attempt uuid;
  v_key text;
  v_pointer uuid;
begin
  select id into v_lead from scenario_ids where name = 'lead1';
  select id into v_case_id from public.lead_routing_cases where lead_id = v_lead;
  v_claim := public.lead_routing_claim_dealer_send(v_case_id, v_other_actor, v_dealer);
  if v_claim->>'result' <> 'not_authorized' then
    raise exception 'forwarded salesperson claim returned %', v_claim;
  end if;
  v_claim := public.lead_routing_claim_dealer_send(v_case_id, v_actor, v_other);
  if v_claim->>'result' <> 'dealer_mismatch' then
    raise exception 'substituted dealer returned %', v_claim;
  end if;
  if exists (select 1 from public.lead_notification_attempts where lead_id = v_lead) then
    raise exception 'rejected claim created a notification';
  end if;

  v_claim := public.lead_routing_claim_dealer_send(v_case_id, v_actor, v_dealer);
  if v_claim->>'result' <> 'claimed' then
    raise exception 'first claim returned %', v_claim;
  end if;
  v_attempt := (v_claim->>'attemptId')::uuid;
  v_key := v_claim->>'idempotencyKey';
  v_claim := public.lead_routing_claim_dealer_send(v_case_id, v_admin, v_dealer);
  if v_claim->>'result' <> 'in_progress' then
    raise exception 'duplicate click returned %', v_claim;
  end if;
  if (select count(*) from public.lead_notification_attempts where idempotency_key = v_key) <> 1 then
    raise exception 'duplicate click created another attempt';
  end if;

  v_complete := public.lead_routing_complete_dealer_send(v_attempt, 'failed', 'dealer_notification_http_502 Bearer secret-token', null);
  if v_complete->>'result' <> 'completed' then
    raise exception 'failure complete returned %', v_complete;
  end if;
  if (select last_error from public.lead_notification_attempts where id = v_attempt) <> 'dealer_notification_http_502Bearersecret-token' then
    raise exception 'error text was not sanitized: %', (select last_error from public.lead_notification_attempts where id = v_attempt);
  end if;
  if exists (select 1 from public.zip_rotation_state where zip_code = '46204') then
    raise exception 'failed delivery advanced rotation';
  end if;
  if (select proposed_dealer_id::text from public.lead_routing_cases where id = v_case_id) <> v_dealer::text then
    raise exception 'failed delivery changed the proposed dealer';
  end if;

  v_claim := public.lead_routing_claim_dealer_send(v_case_id, v_actor, v_dealer);
  if v_claim->>'result' <> 'claimed' or v_claim->>'idempotencyKey' <> v_key then
    raise exception 'retry did not reuse the idempotency key: %', v_claim;
  end if;
  if (select attempt_count from public.lead_notification_attempts where id = v_attempt) <> 2 then
    raise exception 'retry did not increment the same attempt';
  end if;
  v_complete := public.lead_routing_complete_dealer_send((v_claim->>'attemptId')::uuid, 'succeeded', null, null);
  v_complete := public.lead_routing_complete_dealer_send((v_claim->>'attemptId')::uuid, 'succeeded', null, null);
  if v_complete->>'result' <> 'already_complete' then
    raise exception 'second complete returned %', v_complete;
  end if;
  select last_dealer_id into v_pointer from public.zip_rotation_state where zip_code = '46204';
  if v_pointer <> v_dealer then
    raise exception 'rotation pointer is %', v_pointer;
  end if;

  insert into public.leads (first_name, last_name, email, zip, source) values ('Second', 'Lead', 'second@example.com', '462041234', 'door_builder') returning id into v_lead;
  insert into scenario_ids values ('lead2', v_lead);
  if (select proposed_dealer_id from public.lead_routing_cases where lead_id = v_lead) <> v_other then
    raise exception 'second lead did not rotate to the next dealer';
  end if;
  select id into v_case_id from public.lead_routing_cases where lead_id = v_lead;
  v_claim := public.lead_routing_claim_dealer_send(v_case_id, v_actor, v_other);
  perform public.lead_routing_complete_dealer_send((v_claim->>'attemptId')::uuid, 'succeeded', null, null);

  insert into public.leads (first_name, last_name, email, zip, source) values ('Third', 'Lead', 'third@example.com', '46204', 'door_builder') returning id into v_lead;
  if (select proposed_dealer_id from public.lead_routing_cases where lead_id = v_lead) <> v_dealer then
    raise exception 'third lead did not wrap rotation';
  end if;

  update public.dealers set is_active = false where id = v_dealer;
  select id into v_case_id from public.lead_routing_cases where lead_id = v_lead;
  v_claim := public.lead_routing_claim_dealer_send(v_case_id, v_actor, v_dealer);
  if v_claim->>'result' <> 'blocked_inactive' then
    raise exception 'inactive dealer was not blocked: %', v_claim;
  end if;
  if (select status from public.lead_routing_cases where id = v_case_id) <> 'blocked_dealer_inactive' then
    raise exception 'blocked status was not stored';
  end if;
  if exists (
    select 1 from public.lead_notification_attempts attempts
    join public.lead_routing_cases cases on cases.id = attempts.case_id
    where cases.lead_id = v_lead and attempts.status = 'succeeded'
  ) then
    raise exception 'inactive dealer received a successful notification';
  end if;
  v_claim := public.lead_routing_repropose_dealer(v_case_id, v_actor);
  if v_claim->>'result' <> 'claimed' or v_claim->>'dealerId' <> v_other::text then
    raise exception 'reproposal returned %', v_claim;
  end if;
  if exists (select 1 from public.lead_notification_attempts where lead_id = v_lead and status in ('sending', 'succeeded')) then
    raise exception 'reproposal sent a dealer notification';
  end if;
end $$;

do $$
declare
  v_count int;
  v_lead uuid;
begin
  select id into v_lead from scenario_ids where name = 'lead1';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
  select count(*) into v_count from public.lead_routing_cases;
  if v_count <> 3 then
    raise exception 'assigned salesperson saw % cases', v_count;
  end if;
  select count(*) into v_count from public.leads where id = v_lead;
  if v_count <> 1 then
    raise exception 'assigned salesperson could not read the lead';
  end if;
  select count(*) into v_count from public.dealers;
  if v_count <> 2 then
    raise exception 'salesperson saw % dealers', v_count;
  end if;
  select count(*) into v_count from public.dealers where slug in ('americas-best-windows-and-doors', 'wdm');
  if v_count <> 0 then
    raise exception 'salesperson could read a dealer that is not proposed on their lead';
  end if;
  begin
    insert into public.lead_routing_cases (lead_id, status) values (v_lead, 'unassigned');
    raise exception 'salesperson insert was allowed';
  exception
    when insufficient_privilege then
      null;
  end;

  perform set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
  select count(*) into v_count from public.lead_routing_cases;
  if v_count <> 0 then
    raise exception 'forwarded salesperson saw % cases', v_count;
  end if;
  select count(*) into v_count from public.leads where id = v_lead;
  if v_count <> 0 then
    raise exception 'forwarded salesperson read the lead';
  end if;

  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  select count(*) into v_count from public.lead_routing_cases;
  if v_count < 3 then
    raise exception 'admin saw % cases', v_count;
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  select count(*) into v_count from public.lead_routing_cases;
  if v_count <> 0 then
    raise exception 'anonymous role saw routing cases';
  end if;
  reset role;
end $$;

do $$
declare
  v_case_id uuid;
  v_result jsonb;
begin
  select id into v_case_id from public.lead_routing_cases where status = 'awaiting_approval' limit 1;
  update public.salespeople set is_active = false where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  if exists (
    select 1 from public.lead_routing_cases
    where salesperson_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and status in ('awaiting_approval', 'notification_failed', 'blocked_dealer_inactive', 'no_eligible_dealer')
  ) then
    raise exception 'open cases stayed with an inactive salesperson';
  end if;
  if not exists (select 1 from public.lead_routing_cases where unassigned_reason = 'inactive_salesperson' and salesperson_id is null) then
    raise exception 'deactivation did not fall back to the unassigned queue';
  end if;
  v_result := public.lead_routing_claim_salesperson_notify(v_case_id, '11111111-1111-4111-8111-111111111111');
  if v_result->>'result' <> 'disabled' then
    raise exception 'personify claim while disabled returned %', v_result;
  end if;
  if exists (select 1 from public.lead_notification_attempts where channel = 'personify_salesperson') then
    raise exception 'disabled personify mode created an attempt';
  end if;
end $$;

update public.dealers set is_active = true where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
update public.salespeople set is_active = true where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

insert into public.leads (first_name, last_name, email, zip, source)
values ('Concurrent', 'Lead', 'concurrent@example.com', '46204', 'door_builder');
