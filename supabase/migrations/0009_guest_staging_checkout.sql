begin;

alter table public.orders alter column customer_user_id drop not null;
alter table public.orders
  add column if not exists guest_access_token_hash text unique,
  add column if not exists guest_access_expires_at timestamptz,
  add column if not exists address_validation_status text not null default 'not_checked'
    check (address_validation_status in ('validated','unverified','not_checked')),
  add column if not exists address_validation_snapshot jsonb not null default '{}'::jsonb;

create table if not exists public.staging_rate_limits (
  key_hash text primary key,
  request_count integer not null default 0,
  window_started_at timestamptz not null default now()
);
alter table public.staging_rate_limits enable row level security;

create or replace function public.consume_staging_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_row public.staging_rate_limits;
begin
  if p_limit < 1 or p_window_seconds < 1 then return false; end if;
  insert into public.staging_rate_limits(key_hash,request_count,window_started_at)
    values(p_key_hash,1,now())
  on conflict(key_hash) do update set
    request_count = case
      when public.staging_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
        then 1
      else public.staging_rate_limits.request_count + 1
    end,
    window_started_at = case
      when public.staging_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
        then now()
      else public.staging_rate_limits.window_started_at
    end
  returning * into v_row;
  return v_row.request_count <= p_limit;
end;
$$;

create or replace function public.create_guest_staging_order(
  p_order_number text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping_address jsonb,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_shipping_cents integer,
  p_idempotency_key uuid,
  p_guest_token_hash text,
  p_expires_at timestamptz,
  p_address_validation_status text,
  p_address_validation_snapshot jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_existing public.orders;
  v_order public.orders;
  v_item record;
  v_variant record;
  v_subtotal integer := 0;
  v_reserved integer;
begin
  select * into v_existing from public.orders where idempotency_key=p_idempotency_key;
  if found then
    return jsonb_build_object('id',v_existing.id,'order_number',v_existing.order_number,'total_cents',v_existing.total_cents);
  end if;
  if p_payment_method not in ('zelle','cash_app') then raise exception 'invalid_staging_payment_method'; end if;
  if not exists(select 1 from public.payment_method_configs where method=p_payment_method and is_active) then
    raise exception 'payment_method_unavailable';
  end if;
  if p_shipping_cents < 0 then raise exception 'invalid_shipping_amount'; end if;
  if p_expires_at <= now() then raise exception 'invalid_expiration'; end if;
  if jsonb_array_length(p_items) < 1 then raise exception 'empty_order'; end if;

  for v_item in select * from jsonb_to_recordset(p_items) as x(variant_id uuid,quantity integer)
  loop
    if v_item.quantity < 1 or v_item.quantity > 20 then raise exception 'invalid_quantity'; end if;
    select v.id as variant_id,v.product_id,v.sku,v.title as variant_title,v.price_cents,
      p.title as product_title,p.description,p.category,i.on_hand,i.committed
      into v_variant
      from public.product_variants v
      join public.products p on p.id=v.product_id
      join public.inventory_items i on i.variant_id=v.id
      where v.id=v_item.variant_id and v.status='active' and p.status='active'
      for update of i;
    if not found then raise exception 'product_unavailable'; end if;
    select coalesce(sum(quantity),0) into v_reserved
      from public.inventory_reservations
      where variant_id=v_item.variant_id and status='active' and expires_at>now();
    if v_variant.on_hand - v_variant.committed - v_reserved < v_item.quantity then
      raise exception 'insufficient_inventory';
    end if;
    v_subtotal := v_subtotal + (v_variant.price_cents * v_item.quantity);
  end loop;

  insert into public.orders(
    order_number,customer_user_id,customer_email,customer_phone,subtotal_cents,
    shipping_cents,tax_cents,total_cents,payment_method,shipping_address,billing_address,
    customer_snapshot,pricing_snapshot,shippo_rate_id,expires_at,idempotency_key,
    guest_access_token_hash,guest_access_expires_at,address_validation_status,
    address_validation_snapshot
  ) values(
    p_order_number,null,lower(trim(p_customer_email)),trim(p_customer_phone),v_subtotal,
    p_shipping_cents,0,v_subtotal+p_shipping_cents,p_payment_method,p_shipping_address,p_shipping_address,
    jsonb_build_object('email',lower(trim(p_customer_email)),'phone',trim(p_customer_phone),'guest',true),
    jsonb_build_object('subtotal_cents',v_subtotal,'shipping_cents',p_shipping_cents,'tax_cents',0,'tax_status','skipped_staging_test'),
    case when p_address_validation_status='validated' then 'shippo-address-validated' else 'staging-flat-handling' end,
    p_expires_at,p_idempotency_key,p_guest_token_hash,p_expires_at,
    p_address_validation_status,p_address_validation_snapshot
  ) returning * into v_order;

  for v_item in select * from jsonb_to_recordset(p_items) as x(variant_id uuid,quantity integer)
  loop
    select v.id as variant_id,v.product_id,v.sku,v.title as variant_title,v.price_cents,
      p.title as product_title,p.description,p.category
      into v_variant
      from public.product_variants v join public.products p on p.id=v.product_id
      where v.id=v_item.variant_id;
    insert into public.order_items(
      order_id,product_id,variant_id,sku,product_title,variant_title,quantity,
      unit_price_cents,line_total_cents,product_snapshot
    ) values(
      v_order.id,v_variant.product_id,v_variant.variant_id,v_variant.sku,
      v_variant.product_title,v_variant.variant_title,v_item.quantity,
      v_variant.price_cents,v_variant.price_cents*v_item.quantity,
      jsonb_build_object('title',v_variant.product_title,'description',v_variant.description,'category',v_variant.category,'sku',v_variant.sku)
    );
    insert into public.inventory_reservations(order_id,variant_id,quantity,expires_at)
      values(v_order.id,v_item.variant_id,v_item.quantity,p_expires_at);
  end loop;

  insert into public.audit_events(order_id,event_type,actor_type,new_value)
    values(v_order.id,'order.created','system',jsonb_build_object('guest',true,'staging',true));
  insert into public.notification_outbox(idempotency_key,event_type,aggregate_type,aggregate_id,payload)
    values('order_created:'||v_order.id,'order_created','order',v_order.id,
      jsonb_build_object('orderId',v_order.id,'orderNumber',v_order.order_number,'staging',true))
    on conflict(idempotency_key) do nothing;
  return jsonb_build_object('id',v_order.id,'order_number',v_order.order_number,'total_cents',v_order.total_cents);
end;
$$;

create or replace function public.submit_guest_payment(
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
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_order public.orders; v_submission_id uuid; v_risk text;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.customer_user_id is not null then raise exception 'guest_order_not_found'; end if;
  if v_order.order_status <> 'awaiting_payment' or v_order.payment_status <> 'unpaid' then raise exception 'order_not_eligible'; end if;
  if v_order.expires_at <= now() then raise exception 'order_expired'; end if;
  if p_method <> v_order.payment_method then raise exception 'payment_method_mismatch'; end if;
  if p_amount_reported_cents <= 0 then raise exception 'invalid_amount'; end if;
  v_risk := case when p_amount_reported_cents <> v_order.total_cents then 'payment_amount_mismatch' else 'payment_submission_created' end;
  insert into public.payment_submissions(
    order_id,method,sender_name,sender_contact,amount_reported_cents,payment_date,
    approximate_time,transaction_reference,customer_note,idempotency_key
  ) values(
    v_order.id,p_method,left(trim(p_sender_name),120),left(trim(p_sender_contact),160),
    p_amount_reported_cents,p_payment_date,p_approximate_time,
    nullif(left(trim(p_transaction_reference),120),''),
    nullif(left(trim(p_customer_note),500),''),p_idempotency_key
  ) returning id into v_submission_id;
  update public.orders set order_status='payment_review',payment_status='submitted',updated_at=now() where id=v_order.id;
  insert into public.audit_events(order_id,event_type,actor_type,new_value)
    values(v_order.id,'payment.submitted','customer',jsonb_build_object('submission_id',v_submission_id,'guest',true));
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

revoke all on function public.consume_staging_rate_limit(text,integer,integer) from public;
revoke all on function public.create_guest_staging_order(text,text,text,jsonb,public.payment_method,jsonb,integer,uuid,text,timestamptz,text,jsonb) from public;
revoke all on function public.submit_guest_payment(uuid,public.payment_method,text,text,integer,date,time,text,text,uuid) from public;
grant execute on function public.consume_staging_rate_limit(text,integer,integer) to service_role;
grant execute on function public.create_guest_staging_order(text,text,text,jsonb,public.payment_method,jsonb,integer,uuid,text,timestamptz,text,jsonb) to service_role;
grant execute on function public.submit_guest_payment(uuid,public.payment_method,text,text,integer,date,time,text,text,uuid) to service_role;

insert into public.products(slug,title,description,category,status,research_use_only)
values
  ('atlas-10','Atlas 10','Fictional staging research material','Staging','active',true),
  ('helix-b7','Helix B7','Fictional staging research material','Staging','active',true)
on conflict(slug) do update set status='active',updated_at=now();

insert into public.product_variants(product_id,sku,title,price_cents,weight_grams,status)
select id,'ATL-5MG-STAGING','5 mg',5800,25,'active' from public.products where slug='atlas-10'
on conflict(sku) do update set price_cents=excluded.price_cents,status='active';
insert into public.product_variants(product_id,sku,title,price_cents,weight_grams,status)
select id,'HLX-5MG-STAGING','5 mg',6800,25,'active' from public.products where slug='helix-b7'
on conflict(sku) do update set price_cents=excluded.price_cents,status='active';

insert into public.inventory_items(variant_id,on_hand,committed)
select id,100,0 from public.product_variants where sku in ('ATL-5MG-STAGING','HLX-5MG-STAGING')
on conflict(variant_id) do nothing;

insert into public.payment_method_configs(method,display_name,destination_name,destination_value,customer_instructions,is_active)
values
  ('zelle','Zelle','TEST ONLY','test-only@example.invalid','Do not send funds. Submit fictional payment details only.',true),
  ('cash_app','Cash App','TEST ONLY','$TEST-NO-FUNDS','Do not send funds. Submit fictional payment details only.',true)
on conflict(method) do update set
  display_name=excluded.display_name,destination_name=excluded.destination_name,
  destination_value=excluded.destination_value,customer_instructions=excluded.customer_instructions,is_active=true;

commit;
