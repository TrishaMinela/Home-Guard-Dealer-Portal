-- Step 6: invoice rules and invoice preparation. No invoices are created by this migration.
create table public.billing_invoice_number_sequences (
  invoice_year integer primary key check (invoice_year between 2000 and 9999),
  last_number integer not null check (last_number > 0),
  updated_at timestamptz not null default now()
);
alter table public.billing_invoice_number_sequences enable row level security;
revoke all on public.billing_invoice_number_sequences from public, anon, authenticated;
create policy "Internal billing admins can read invoice sequences" on public.billing_invoice_number_sequences
for select to authenticated using (public.is_billing_internal_admin());
grant select on public.billing_invoice_number_sequences to authenticated;

alter table public.billing_invoices
  drop constraint billing_invoices_status_check,
  add column currency text not null default 'usd' check (currency = 'usd'),
  add column subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  add column tax_status text not null default 'not_configured' check (tax_status = 'not_configured'),
  add column tax_amount_cents integer check (tax_amount_cents is null),
  add constraint billing_invoices_status_check check (status in ('draft','issued','paid','void')),
  add constraint billing_invoices_amounts_match check (subtotal_cents=ai_usage_charge_cents and total_due_cents=subtotal_cents and amount_remaining_cents between 0 and total_due_cents),
  add constraint billing_invoices_issue_dates_check check ((status='draft' and issued_at is null and due_at is null and finalized_at is null) or (status<>'draft' and issued_at is not null and due_at=issued_at+interval '15 days' and finalized_at is not null)),
  add constraint billing_invoices_number_format check (invoice_number ~ '^HGI-[0-9]{4}-[0-9]{4}$');

alter table public.billing_invoice_items
  add column quantity integer not null default 1 check (quantity=1),
  add column unit_amount_cents integer not null default 0 check (unit_amount_cents>=0),
  add column line_total_cents integer not null default 0 check (line_total_cents>=0),
  add constraint billing_invoice_items_amounts_match check (amount_cents=line_total_cents and line_total_cents=quantity*unit_amount_cents);

create unique index billing_invoices_one_per_account_period_idx on public.billing_invoices(billing_account_id,billing_period_id);

create or replace function public.protect_finalized_billing_record() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if (tg_table_name='billing_periods' and old.status='finalized') or (tg_table_name='billing_charge_summaries' and old.status='finalized') then
    raise exception 'Finalized billing records are immutable; use an explicit adjustment workflow';
  end if;
  if tg_table_name='billing_invoices' and old.status<>'draft' then
    if tg_op='DELETE' then raise exception 'Issued invoices cannot be deleted; void them instead'; end if;
    if new.invoice_number<>old.invoice_number or new.billing_account_id<>old.billing_account_id or new.billing_period_id<>old.billing_period_id
      or new.billing_period_start<>old.billing_period_start or new.billing_period_end<>old.billing_period_end or new.currency<>old.currency
      or new.issued_at<>old.issued_at or new.due_at<>old.due_at or new.ai_usage_charge_cents<>old.ai_usage_charge_cents
      or new.subtotal_cents<>old.subtotal_cents or new.tax_status<>old.tax_status or new.tax_amount_cents is distinct from old.tax_amount_cents
      or new.total_due_cents<>old.total_due_cents or new.finalized_at<>old.finalized_at then
      raise exception 'Issued invoice financial and identity fields are immutable';
    end if;
    if old.status='void' and new.status<>'void' then raise exception 'Void invoices cannot be reopened'; end if;
    if old.status='paid' and new.status not in ('paid','void') then raise exception 'Paid invoices cannot be reopened'; end if;
    if old.status='issued' and new.status not in ('issued','paid','void') then raise exception 'Invalid issued invoice transition'; end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

create or replace function public.billing_invoice_readiness(p_billing_period_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_period public.billing_periods; v_summary public.billing_charge_summaries; v_account public.billing_accounts; v_invoice public.billing_invoices; v_blockers jsonb:='[]'::jsonb;
begin
  if not public.is_billing_internal_admin() then raise exception 'Internal billing administrator access required'; end if;
  select * into v_period from public.billing_periods where id=p_billing_period_id;
  if v_period.id is null then v_blockers:=v_blockers||jsonb_build_array('billing_period_missing'); elsif v_period.status<>'finalized' then v_blockers:=v_blockers||jsonb_build_array('billing_period_not_finalized'); end if;
  select * into v_account from public.billing_accounts where id=v_period.billing_account_id;
  if v_account.id is null or not v_account.is_active then v_blockers:=v_blockers||jsonb_build_array('billing_account_inactive'); elsif v_account.currency<>'usd' then v_blockers:=v_blockers||jsonb_build_array('billing_account_currency_invalid'); end if;
  select * into v_summary from public.billing_charge_summaries where billing_period_id=p_billing_period_id;
  if v_summary.id is null then v_blockers:=v_blockers||jsonb_build_array('charge_summary_missing');
  elsif v_summary.status<>'finalized' then v_blockers:=v_blockers||jsonb_build_array('charge_summary_not_finalized');
  elsif v_summary.billing_account_id<>v_period.billing_account_id or v_summary.billing_period_start<>v_period.period_start or v_summary.billing_period_end<>v_period.period_end then v_blockers:=v_blockers||jsonb_build_array('charge_summary_period_mismatch'); end if;
  select * into v_invoice from public.billing_invoices where billing_period_id=p_billing_period_id;
  if v_invoice.id is not null then v_blockers:=v_blockers||jsonb_build_array('invoice_already_exists'); end if;
  return jsonb_build_object('billingPeriodId',p_billing_period_id,'billingAccountId',v_period.billing_account_id,'periodStart',v_period.period_start,'periodEndExclusive',v_period.period_end,
    'aiUsageChargeCents',v_summary.ai_usage_charge_cents,'existingInvoiceId',v_invoice.id,'ready',jsonb_array_length(v_blockers)=0,'blockers',v_blockers);
end $$;

create or replace function public.issue_billing_invoice(p_billing_period_id uuid,p_issue_date date default (now() at time zone 'utc')::date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_ready jsonb; v_period public.billing_periods; v_summary public.billing_charge_summaries; v_number integer; v_invoice_number text; v_invoice_id uuid; v_item_id uuid; v_issued_at timestamptz; v_due_at timestamptz;
begin
  if not public.is_billing_internal_admin() then raise exception 'Internal billing administrator access required'; end if;
  if p_issue_date is null then raise exception 'Invoice issue date is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hgi-invoice:'||extract(year from p_issue_date)::text,0));
  perform pg_advisory_xact_lock(hashtextextended('hgi-invoice-period:'||p_billing_period_id::text,0));
  v_ready:=public.billing_invoice_readiness(p_billing_period_id);
  if not coalesce((v_ready->>'ready')::boolean,false) then raise exception 'Invoice is not ready: %',v_ready->'blockers'; end if;
  select * into v_period from public.billing_periods where id=p_billing_period_id for share;
  select * into v_summary from public.billing_charge_summaries where billing_period_id=p_billing_period_id for share;
  insert into public.billing_invoice_number_sequences(invoice_year,last_number) values(extract(year from p_issue_date)::integer,1)
  on conflict(invoice_year) do update set last_number=public.billing_invoice_number_sequences.last_number+1,updated_at=now() returning last_number into v_number;
  if v_number>9999 then raise exception 'Annual HGI invoice number capacity exceeded'; end if;
  v_invoice_number:=format('HGI-%s-%s',extract(year from p_issue_date)::integer,lpad(v_number::text,4,'0'));
  v_issued_at:=p_issue_date::timestamp at time zone 'UTC'; v_due_at:=v_issued_at+interval '15 days';
  insert into public.billing_invoices(billing_account_id,billing_period_id,invoice_number,billing_period_start,billing_period_end,currency,ai_usage_charge_cents,subtotal_cents,tax_status,tax_amount_cents,total_due_cents,amount_remaining_cents,status,issued_at,due_at,finalized_at)
  values(v_period.billing_account_id,v_period.id,v_invoice_number,v_period.period_start,v_period.period_end,'usd',v_summary.ai_usage_charge_cents,v_summary.ai_usage_charge_cents,'not_configured',null,v_summary.ai_usage_charge_cents,v_summary.ai_usage_charge_cents,'issued',v_issued_at,v_due_at,now()) returning id into v_invoice_id;
  insert into public.billing_invoice_items(invoice_id,billing_account_id,description,quantity,unit_amount_cents,line_total_cents,amount_cents)
  values(v_invoice_id,v_period.billing_account_id,'AI Usage Charges',1,v_summary.ai_usage_charge_cents,v_summary.ai_usage_charge_cents,v_summary.ai_usage_charge_cents) returning id into v_item_id;
  insert into public.billing_audit_log(billing_account_id,billing_period_id,invoice_id,actor_user_id,action,reason,after_state)
  values(v_period.billing_account_id,v_period.id,v_invoice_id,auth.uid(),'billing_invoice_issued','Issued from immutable finalized AI Usage Charges.',jsonb_build_object('invoiceNumber',v_invoice_number,'issueDate',p_issue_date,'dueDate',p_issue_date+15,'currency','usd','description','AI Usage Charges','quantity',1,'subtotalCents',v_summary.ai_usage_charge_cents,'taxStatus','not_configured','totalDueCents',v_summary.ai_usage_charge_cents));
  return jsonb_build_object('invoiceId',v_invoice_id,'invoiceItemId',v_item_id,'invoiceNumber',v_invoice_number,'issueDate',p_issue_date,'dueDate',p_issue_date+15,'status','issued','aiUsageChargeCents',v_summary.ai_usage_charge_cents);
end $$;

revoke all on function public.billing_invoice_readiness(uuid) from public,anon;
revoke all on function public.issue_billing_invoice(uuid,date) from public,anon;
grant execute on function public.billing_invoice_readiness(uuid) to authenticated;
grant execute on function public.issue_billing_invoice(uuid,date) to authenticated;
comment on function public.issue_billing_invoice(uuid,date) is 'Internal-only atomic issuance from an immutable finalized charge summary. No pricing recalculation, tax, Stripe, or payment action.';
comment on column public.billing_invoices.tax_status is 'Tax is not configured; no tax determination or calculation has been applied.';
