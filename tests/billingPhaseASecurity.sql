-- Run against HGI Portal Dev after the foundation migration. Every fixture is rolled back.
begin;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
('10000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase-a-internal@example.invalid','',now(),now(),now()),
('10000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase-a-client@example.invalid','',now(),now(),now()),
('10000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase-a-dealer@example.invalid','',now(),now(),now()),
('10000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase-a-other-client@example.invalid','',now(),now(),now());

insert into public.home_guard_admins(user_id) values ('10000000-0000-4000-8000-000000000001');
insert into public.billing_internal_admins(user_id) values ('10000000-0000-4000-8000-000000000001');
insert into public.billing_accounts(id,account_key,name) values
('20000000-0000-4000-8000-000000000001','phase-a-hgi','HGI Phase A'),
('20000000-0000-4000-8000-000000000002','phase-a-other','Other Phase A');
insert into public.billing_account_users(billing_account_id,user_id) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004');
insert into public.billing_client_usage_daily(billing_account_id,usage_date,ai_usage_charge_cents,image_generation_count)
values ('20000000-0000-4000-8000-000000000001','2026-10-01',100,2),('20000000-0000-4000-8000-000000000002','2026-10-01',999,9);

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select count(*) from public.billing_accounts) <> 1 then raise exception 'billing client account isolation failed'; end if;
  if (select count(*) from public.billing_client_usage_daily) <> 1 then raise exception 'billing client charge isolation failed'; end if;
  if (select count(*) from public.billing_pricing_versions) <> 0 then raise exception 'billing client can read pricing'; end if;
  if (select count(*) from public.ai_generation_usage) <> 0 then raise exception 'billing client can read raw telemetry'; end if;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$ begin
  if (select count(*) from public.billing_accounts) <> 0 then raise exception 'dealer can read billing'; end if;
  if (select count(*) from public.billing_client_usage_daily) <> 0 then raise exception 'dealer can read charges'; end if;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
  if (select count(*) from public.billing_accounts) <> 2 then raise exception 'internal admin missing account access'; end if;
  perform count(*) from public.billing_pricing_versions;
  perform count(*) from public.ai_generation_usage;
end $$;

set local role anon;
do $$ begin
  begin perform count(*) from public.billing_accounts; raise exception 'anonymous billing access was not blocked'; exception when insufficient_privilege then null; end;
end $$;

rollback;
