-- Explicit history-preserving correction path; direct table updates remain unavailable.
create or replace function public.void_billing_invoice(p_invoice_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_invoice public.billing_invoices;
begin
  if not public.is_billing_internal_admin() then raise exception 'Internal billing administrator access required'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Void reason is required'; end if;
  select * into v_invoice from public.billing_invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'Invoice not found'; end if;
  if v_invoice.status not in ('issued','paid') then raise exception 'Only issued or paid invoices may be voided'; end if;
  update public.billing_invoices set status='void',amount_remaining_cents=0,updated_at=now() where id=p_invoice_id;
  insert into public.billing_audit_log(billing_account_id,billing_period_id,invoice_id,actor_user_id,action,reason,before_state,after_state)
  values(v_invoice.billing_account_id,v_invoice.billing_period_id,v_invoice.id,auth.uid(),'billing_invoice_voided',trim(p_reason),
    jsonb_build_object('status',v_invoice.status,'amountRemainingCents',v_invoice.amount_remaining_cents),
    jsonb_build_object('status','void','amountRemainingCents',0));
  return jsonb_build_object('invoiceId',v_invoice.id,'invoiceNumber',v_invoice.invoice_number,'status','void');
end $$;
revoke all on function public.void_billing_invoice(uuid,text) from public,anon;
grant execute on function public.void_billing_invoice(uuid,text) to authenticated;
comment on function public.void_billing_invoice(uuid,text) is 'Internal-only explicit void action. Preserves issued invoice identity, dates, line items, and financial snapshot.';
