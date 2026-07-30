begin;

create type public.commerce_mode as enum ('staging','production');
create type public.tax_source as enum ('staging_zero','stripe_tax','manual_fallback');

create table public.commerce_runtime_settings (
  singleton boolean primary key default true check (singleton),
  mode public.commerce_mode not null default 'staging',
  version bigint not null default 1 check (version > 0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  production_acknowledged_at timestamptz,
  production_acknowledgment text
);
insert into public.commerce_runtime_settings(singleton) values(true);

create table public.commerce_mode_audit (
  id uuid primary key default gen_random_uuid(),
  previous_mode public.commerce_mode not null,
  new_mode public.commerce_mode not null,
  previous_version bigint not null,
  new_version bigint not null,
  actor_id uuid not null references auth.users(id),
  acknowledgment text not null,
  readiness_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.orders
  add column commerce_mode public.commerce_mode not null default 'staging',
  add column tax_source public.tax_source not null default 'staging_zero',
  add column manual_tax_rate_id uuid,
  add column guest_access_renewed_at timestamptz,
  add column claimed_at timestamptz,
  add column claimed_by uuid references auth.users(id),
  add column shipping_rate_snapshot jsonb not null default '{}'::jsonb;
alter table public.payment_submissions
  add column commerce_mode public.commerce_mode not null default 'staging';
alter table public.notification_outbox
  add column commerce_mode public.commerce_mode not null default 'staging';
alter table public.audit_events
  add column commerce_mode public.commerce_mode not null default 'staging';

create table public.manual_tax_rates (
  id uuid primary key default gen_random_uuid(),
  country_code text not null default 'US' check (char_length(country_code)=2),
  region_code text not null,
  postal_pattern text,
  rate_basis_points integer not null check (rate_basis_points between 0 and 10000),
  effective_from timestamptz not null,
  effective_to timestamptz,
  version integer not null default 1 check (version > 0),
  is_approved boolean not null default false,
  legal_review_acknowledgment text not null,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  supersedes_id uuid references public.manual_tax_rates(id),
  check (effective_to is null or effective_to > effective_from),
  unique(country_code,region_code,postal_pattern,version)
);
alter table public.orders add constraint orders_manual_tax_rate_fkey
  foreign key (manual_tax_rate_id) references public.manual_tax_rates(id);

create table public.shippo_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  commerce_mode public.commerce_mode not null,
  status text not null default 'quoted'
    check (status in ('quoted','label_pending','label_purchased','in_transit','delivered','refund_pending','refunded','error')),
  shippo_shipment_id text not null,
  shippo_rate_id text not null,
  rate_snapshot jsonb not null,
  transaction_id text,
  transaction_status text,
  label_url text,
  tracking_number text,
  tracking_url text,
  carrier text,
  service_level text,
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  provider_response jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id,shippo_rate_id)
);
create unique index one_shippo_transaction_per_order
  on public.shippo_shipments(order_id) where transaction_id is not null;

create table public.shippo_label_attempts (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shippo_shipments(id) on delete restrict,
  commerce_mode public.commerce_mode not null,
  idempotency_key uuid not null unique,
  actor_id uuid not null references auth.users(id),
  status text not null check (status in ('started','succeeded','failed')),
  provider_transaction_id text,
  error_code text,
  provider_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.provider_alerts (
  id uuid primary key default gen_random_uuid(),
  commerce_mode public.commerce_mode not null,
  order_id uuid references public.orders(id) on delete cascade,
  provider text not null check (provider in ('stripe_tax','shippo','brevo')),
  code text not null,
  severity text not null default 'high' check (severity in ('normal','high','critical')),
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.prevent_commerce_mode_change()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.commerce_mode <> old.commerce_mode then
    raise exception 'commerce_mode_is_immutable' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger orders_immutable_commerce_mode before update on public.orders
  for each row execute function public.prevent_commerce_mode_change();
create trigger payments_immutable_commerce_mode before update on public.payment_submissions
  for each row execute function public.prevent_commerce_mode_change();
create trigger notifications_immutable_commerce_mode before update on public.notification_outbox
  for each row execute function public.prevent_commerce_mode_change();
create trigger shipments_immutable_commerce_mode before update on public.shippo_shipments
  for each row execute function public.prevent_commerce_mode_change();
create trigger label_attempts_immutable_commerce_mode before update on public.shippo_label_attempts
  for each row execute function public.prevent_commerce_mode_change();

create or replace function public.inherit_order_commerce_mode()
returns trigger language plpgsql set search_path=''
as $$
begin
  if tg_table_name='notification_outbox' and new.aggregate_type='order' then
    select commerce_mode into new.commerce_mode from public.orders where id=new.aggregate_id;
  elsif tg_table_name in ('payment_submissions','audit_events') and new.order_id is not null then
    select commerce_mode into new.commerce_mode from public.orders where id=new.order_id;
  end if;
  return new;
end;
$$;
create trigger payment_inherits_commerce_mode before insert on public.payment_submissions
  for each row execute function public.inherit_order_commerce_mode();
create trigger notification_inherits_commerce_mode before insert on public.notification_outbox
  for each row execute function public.inherit_order_commerce_mode();
create trigger audit_inherits_commerce_mode before insert on public.audit_events
  for each row execute function public.inherit_order_commerce_mode();

create or replace function public.set_commerce_runtime_mode(
  p_actor_id uuid,
  p_target public.commerce_mode,
  p_expected_version bigint,
  p_confirmation text,
  p_readiness_snapshot jsonb
) returns public.commerce_runtime_settings
language plpgsql security definer set search_path=''
as $$
declare v_current public.commerce_runtime_settings; v_result public.commerce_runtime_settings;
begin
  if not exists(
    select 1 from public.admin_role_assignments
    where user_id=p_actor_id and role='super_admin' and is_active
  ) then raise exception 'super_admin_required' using errcode='42501'; end if;
  select * into v_current from public.commerce_runtime_settings where singleton for update;
  if v_current.version <> p_expected_version then raise exception 'stale_runtime_version'; end if;
  if v_current.mode = p_target then return v_current; end if;
  if p_target='production' then
    if p_confirmation <> 'ENABLE PRODUCTION' then raise exception 'confirmation_phrase_mismatch'; end if;
    if coalesce((p_readiness_snapshot->>'ready')::boolean,false) is not true then
      raise exception 'production_readiness_failed';
    end if;
  else
    if exists(
      select 1 from public.orders
      where commerce_mode='production'
        and order_status not in ('completed','cancelled','expired','refunded')
        and (payment_status in ('unpaid','submitted','under_review','verified')
          or fulfillment_status in ('ready_for_fulfillment','processing','shipped'))
    ) then raise exception 'production_orders_block_staging'; end if;
  end if;
  update public.commerce_runtime_settings set
    mode=p_target, version=version+1, updated_by=p_actor_id, updated_at=now(),
    production_acknowledged_at=case when p_target='production' then now() else production_acknowledged_at end,
    production_acknowledgment=case when p_target='production' then p_confirmation else production_acknowledgment end
  where singleton returning * into v_result;
  insert into public.commerce_mode_audit(previous_mode,new_mode,previous_version,new_version,actor_id,acknowledgment,readiness_snapshot)
  values(v_current.mode,p_target,v_current.version,v_result.version,p_actor_id,p_confirmation,p_readiness_snapshot);
  return v_result;
end;
$$;

create or replace function public.create_guest_commerce_order(
  p_mode public.commerce_mode,
  p_order_number text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping_address jsonb,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_shipping_cents integer,
  p_tax_cents integer,
  p_tax_source public.tax_source,
  p_stripe_tax_calculation_id text,
  p_manual_tax_rate_id uuid,
  p_shippo_rate_id text,
  p_shipping_rate_snapshot jsonb,
  p_idempotency_key uuid,
  p_guest_token_hash text,
  p_payment_expires_at timestamptz,
  p_guest_access_expires_at timestamptz,
  p_address_validation_status text,
  p_address_validation_snapshot jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_runtime public.commerce_runtime_settings; v_existing public.orders; v_order public.orders;
  v_item record; v_variant record; v_subtotal integer := 0; v_reserved integer;
begin
  select * into v_runtime from public.commerce_runtime_settings where singleton;
  if v_runtime.mode <> p_mode then raise exception 'commerce_mode_changed'; end if;
  select * into v_existing from public.orders where idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('id',v_existing.id,'order_number',v_existing.order_number,'total_cents',v_existing.total_cents); end if;
  if p_shipping_cents < 0 or p_tax_cents < 0 then raise exception 'invalid_amount'; end if;
  if p_payment_expires_at <= now() or p_guest_access_expires_at <= p_payment_expires_at then raise exception 'invalid_expiration'; end if;
  if jsonb_array_length(p_items) < 1 then raise exception 'empty_order'; end if;
  if p_mode='production' and p_tax_source='staging_zero' then raise exception 'invalid_production_tax_source'; end if;
  if p_tax_source='manual_fallback' and p_manual_tax_rate_id is null then raise exception 'fallback_rate_required'; end if;
  if not exists(select 1 from public.payment_method_configs where method=p_payment_method and is_active) then raise exception 'payment_method_unavailable'; end if;
  for v_item in select * from jsonb_to_recordset(p_items) as x(variant_id uuid,quantity integer)
  loop
    if v_item.quantity < 1 or v_item.quantity > 20 then raise exception 'invalid_quantity'; end if;
    select v.id variant_id,v.product_id,v.sku,v.title variant_title,v.price_cents,p.title product_title,
      p.description,p.category,i.on_hand,i.committed into v_variant
    from public.product_variants v join public.products p on p.id=v.product_id
      join public.inventory_items i on i.variant_id=v.id
    where v.id=v_item.variant_id and v.status='active' and p.status='active' for update of i;
    if not found then raise exception 'product_unavailable'; end if;
    if p_mode='production' and (v_variant.sku like '%-STAGING' or v_variant.category='Staging') then raise exception 'staging_item_in_production'; end if;
    select coalesce(sum(quantity),0) into v_reserved from public.inventory_reservations
      where variant_id=v_item.variant_id and status='active' and expires_at>now();
    if v_variant.on_hand-v_variant.committed-v_reserved < v_item.quantity then raise exception 'insufficient_inventory'; end if;
    v_subtotal := v_subtotal + v_variant.price_cents*v_item.quantity;
  end loop;
  insert into public.orders(order_number,customer_email,customer_phone,subtotal_cents,shipping_cents,tax_cents,total_cents,
    payment_method,shipping_address,billing_address,customer_snapshot,pricing_snapshot,stripe_tax_calculation_id,
    shippo_rate_id,expires_at,idempotency_key,guest_access_token_hash,guest_access_expires_at,address_validation_status,
    address_validation_snapshot,commerce_mode,tax_source,manual_tax_rate_id,shipping_rate_snapshot)
  values(p_order_number,lower(trim(p_customer_email)),trim(p_customer_phone),v_subtotal,p_shipping_cents,p_tax_cents,
    v_subtotal+p_shipping_cents+p_tax_cents,p_payment_method,p_shipping_address,p_shipping_address,
    jsonb_build_object('email',lower(trim(p_customer_email)),'phone',trim(p_customer_phone),'guest',true),
    jsonb_build_object('subtotal_cents',v_subtotal,'shipping_cents',p_shipping_cents,'tax_cents',p_tax_cents,'tax_source',p_tax_source),
    p_stripe_tax_calculation_id,p_shippo_rate_id,p_payment_expires_at,p_idempotency_key,p_guest_token_hash,
    p_guest_access_expires_at,p_address_validation_status,p_address_validation_snapshot,p_mode,p_tax_source,
    p_manual_tax_rate_id,p_shipping_rate_snapshot) returning * into v_order;
  for v_item in select * from jsonb_to_recordset(p_items) as x(variant_id uuid,quantity integer)
  loop
    select v.id variant_id,v.product_id,v.sku,v.title variant_title,v.price_cents,p.title product_title,
      p.description,p.category into v_variant from public.product_variants v join public.products p on p.id=v.product_id
      where v.id=v_item.variant_id;
    insert into public.order_items(order_id,product_id,variant_id,sku,product_title,variant_title,quantity,unit_price_cents,line_total_cents,product_snapshot)
    values(v_order.id,v_variant.product_id,v_variant.variant_id,v_variant.sku,v_variant.product_title,v_variant.variant_title,
      v_item.quantity,v_variant.price_cents,v_variant.price_cents*v_item.quantity,
      jsonb_build_object('title',v_variant.product_title,'description',v_variant.description,'category',v_variant.category,'sku',v_variant.sku));
    insert into public.inventory_reservations(order_id,variant_id,quantity,expires_at)
      values(v_order.id,v_item.variant_id,v_item.quantity,p_payment_expires_at);
  end loop;
  insert into public.audit_events(order_id,event_type,actor_type,new_value,commerce_mode)
    values(v_order.id,'order.created','system',jsonb_build_object('guest',true,'mode',p_mode),p_mode);
  insert into public.notification_outbox(idempotency_key,event_type,aggregate_type,aggregate_id,payload,commerce_mode)
    values('order_created:'||v_order.id,'order_created','order',v_order.id,
      jsonb_build_object('orderId',v_order.id,'orderNumber',v_order.order_number),p_mode) on conflict do nothing;
  return jsonb_build_object('id',v_order.id,'order_number',v_order.order_number,'total_cents',v_order.total_cents);
end;
$$;

alter table public.commerce_runtime_settings enable row level security;
alter table public.commerce_mode_audit enable row level security;
alter table public.manual_tax_rates enable row level security;
alter table public.shippo_shipments enable row level security;
alter table public.shippo_label_attempts enable row level security;
alter table public.provider_alerts enable row level security;
create policy "admins read runtime settings" on public.commerce_runtime_settings for select
  using(public.has_admin_role(array['support','payment_reviewer','fulfillment','manager','super_admin']::public.admin_role[]));
create policy "admins read mode audit" on public.commerce_mode_audit for select
  using(public.has_admin_role(array['manager','super_admin']::public.admin_role[]));
create policy "admins read tax rates" on public.manual_tax_rates for select
  using(public.has_admin_role(array['manager','super_admin']::public.admin_role[]));
create policy "fulfillment reads shipments" on public.shippo_shipments for select
  using(public.has_admin_role(array['fulfillment','manager','super_admin']::public.admin_role[]));
create policy "fulfillment reads label attempts" on public.shippo_label_attempts for select
  using(public.has_admin_role(array['fulfillment','manager','super_admin']::public.admin_role[]));
create policy "admins read provider alerts" on public.provider_alerts for select
  using(public.has_admin_role(array['support','manager','super_admin']::public.admin_role[]));

revoke all on function public.set_commerce_runtime_mode(uuid,public.commerce_mode,bigint,text,jsonb) from public;
revoke all on function public.create_guest_commerce_order(public.commerce_mode,text,text,text,jsonb,public.payment_method,jsonb,integer,integer,public.tax_source,text,uuid,text,jsonb,uuid,text,timestamptz,timestamptz,text,jsonb) from public;
grant execute on function public.set_commerce_runtime_mode(uuid,public.commerce_mode,bigint,text,jsonb) to service_role;
grant execute on function public.create_guest_commerce_order(public.commerce_mode,text,text,text,jsonb,public.payment_method,jsonb,integer,integer,public.tax_source,text,uuid,text,jsonb,uuid,text,timestamptz,timestamptz,text,jsonb) to service_role;

commit;
