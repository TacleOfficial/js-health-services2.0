begin;

create or replace function public.submit_payment(
  p_order_id uuid,
  p_method public.payment_method,
  p_sender_name text,
  p_sender_contact text,
  p_amount_reported_cents integer,
  p_payment_date date,
  p_approximate_time time,
  p_transaction_reference text,
  p_customer_note text,
  p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_order public.orders; v_submission_id uuid; v_risk text;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.customer_user_id <> auth.uid() then
    raise exception 'order_not_found' using errcode='42501';
  end if;
  if v_order.order_status <> 'awaiting_payment' or v_order.payment_status <> 'unpaid' then
    raise exception 'order_not_eligible';
  end if;
  if v_order.expires_at <= now() then raise exception 'order_expired'; end if;
  if p_method <> v_order.payment_method then raise exception 'payment_method_mismatch'; end if;
  if p_amount_reported_cents <= 0 then raise exception 'invalid_amount'; end if;

  update public.payment_submissions set is_active=false
    where order_id=v_order.id and is_active;
  v_risk := case when p_amount_reported_cents <> v_order.total_cents
    then 'payment_amount_mismatch' else 'payment_submission_created' end;
  insert into public.payment_submissions(
    order_id,method,sender_name,sender_contact,amount_reported_cents,payment_date,
    approximate_time,transaction_reference,customer_note,idempotency_key
  ) values(
    v_order.id,p_method,left(trim(p_sender_name),120),left(trim(p_sender_contact),160),
    p_amount_reported_cents,p_payment_date,p_approximate_time,
    nullif(left(trim(p_transaction_reference),120),''),
    nullif(left(trim(p_customer_note),500),''),p_idempotency_key
  ) returning id into v_submission_id;

  update public.orders set order_status='payment_review',payment_status='submitted',updated_at=now()
    where id=v_order.id;
  insert into public.audit_events(order_id,event_type,actor_type,actor_id,new_value)
    values(v_order.id,'payment.submitted','customer',auth.uid(),jsonb_build_object('submission_id',v_submission_id));
  insert into public.notification_outbox(idempotency_key,event_type,aggregate_type,aggregate_id,payload,priority)
    values(v_risk||':'||v_submission_id,v_risk,'order',v_order.id,
      jsonb_build_object('orderId',v_order.id,'orderNumber',v_order.order_number,'paymentSubmissionId',v_submission_id),
      case when v_risk='payment_amount_mismatch' then 'high' else 'normal' end)
    on conflict(idempotency_key) do nothing;
  return v_submission_id;
exception when unique_violation then
  select id into v_submission_id from public.payment_submissions where idempotency_key=p_idempotency_key;
  return v_submission_id;
end;
$$;

create or replace function public.reject_payment(
  p_submission_id uuid,
  p_reason text,
  p_request_more_information boolean default false
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_submission public.payment_submissions; v_order public.orders;
begin
  perform public.require_admin_aal2(array['payment_reviewer','manager','super_admin']::public.admin_role[]);
  if length(trim(p_reason)) < 3 then raise exception 'rejection_reason_required'; end if;
  select * into v_submission from public.payment_submissions where id=p_submission_id for update;
  if not found then raise exception 'submission_not_found'; end if;
  select * into v_order from public.orders where id=v_submission.order_id for update;
  if v_order.payment_status='verified' then raise exception 'verified_payment_cannot_be_rejected'; end if;
  update public.payment_submissions
    set status='rejected',reviewed_at=now(),reviewed_by=auth.uid(),rejection_reason=left(trim(p_reason),500)
    where id=v_submission.id;
  update public.orders
    set payment_status='rejected',order_status=case when p_request_more_information then 'on_hold' else 'cancelled' end,
        cancellation_reason=case when p_request_more_information then null else left(trim(p_reason),500) end,
        updated_at=now()
    where id=v_order.id;
  if not p_request_more_information then
    update public.inventory_reservations set status='released',released_at=now()
      where order_id=v_order.id and status='active';
  end if;
  insert into public.audit_events(order_id,event_type,actor_type,actor_id,new_value)
    values(v_order.id,case when p_request_more_information then 'payment.information_requested' else 'payment.rejected' end,
      'admin',auth.uid(),jsonb_build_object('submission_id',v_submission.id,'reason',left(trim(p_reason),500)));
  return v_order.id;
end;
$$;

revoke all on function public.submit_payment(uuid,public.payment_method,text,text,integer,date,time,text,text,uuid) from public;
grant execute on function public.submit_payment(uuid,public.payment_method,text,text,integer,date,time,text,text,uuid) to authenticated;
revoke all on function public.approve_payment(uuid,text) from public;
grant execute on function public.approve_payment(uuid,text) to authenticated;
revoke all on function public.reject_payment(uuid,text,boolean) from public;
grant execute on function public.reject_payment(uuid,text,boolean) to authenticated;

commit;
