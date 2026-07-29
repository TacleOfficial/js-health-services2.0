begin;

create extension if not exists pgcrypto;

create type public.order_status as enum (
  'draft','awaiting_payment','payment_review','processing','completed',
  'cancelled','expired','refunded','on_hold'
);
create type public.payment_status as enum (
  'unpaid','submitted','under_review','verified','rejected','expired',
  'refunded','partially_refunded','possible_duplicate'
);
create type public.fulfillment_status as enum (
  'unfulfilled','ready_for_fulfillment','processing','shipped','delivered','cancelled'
);
create type public.reservation_status as enum ('active','committed','released','expired');
create type public.payment_method as enum ('zelle','cash_app');
create type public.admin_role as enum ('support','payment_reviewer','fulfillment','manager','super_admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  first_name text,
  last_name text,
  account_activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_role_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.admin_role not null,
  is_active boolean not null default true,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  category text not null,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  research_use_only boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique,
  title text not null,
  price_cents integer not null check (price_cents >= 0),
  weight_grams integer not null default 0 check (weight_grams >= 0),
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_at timestamptz not null default now()
);

create table public.inventory_items (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  on_hand integer not null default 0 check (on_hand >= 0),
  committed integer not null default 0 check (committed >= 0),
  updated_at timestamptz not null default now(),
  check (committed <= on_hand)
);

create table public.payment_method_configs (
  id uuid primary key default gen_random_uuid(),
  method public.payment_method not null unique,
  display_name text not null,
  destination_name text not null,
  destination_value text not null,
  qr_storage_path text,
  customer_instructions text not null,
  minimum_cents integer not null default 0 check (minimum_cents >= 0),
  maximum_cents integer check (maximum_cents is null or maximum_cents >= minimum_cents),
  is_active boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_user_id uuid not null references auth.users(id),
  customer_email text not null,
  customer_phone text not null,
  currency text not null default 'USD' check (currency = 'USD'),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  shipping_cents integer not null check (shipping_cents >= 0),
  tax_cents integer not null check (tax_cents >= 0),
  payment_adjustment_cents integer not null default 0 check (payment_adjustment_cents = 0),
  total_cents integer not null check (total_cents >= 0),
  payment_method public.payment_method not null,
  order_status public.order_status not null default 'awaiting_payment',
  payment_status public.payment_status not null default 'unpaid',
  fulfillment_status public.fulfillment_status not null default 'unfulfilled',
  shipping_address jsonb not null,
  billing_address jsonb not null,
  customer_snapshot jsonb not null,
  pricing_snapshot jsonb not null,
  stripe_tax_calculation_id text,
  shippo_rate_id text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  cancellation_reason text,
  expiration_reason text,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_cents = subtotal_cents - discount_cents + shipping_cents + tax_cents)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  variant_id uuid not null references public.product_variants(id),
  sku text not null,
  product_title text not null,
  variant_title text not null,
  quantity integer not null check (quantity > 0 and quantity <= 20),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0),
  product_snapshot jsonb not null
);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  quantity integer not null check (quantity > 0),
  status public.reservation_status not null default 'active',
  expires_at timestamptz not null,
  committed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, variant_id)
);
create index inventory_reservations_active_idx
  on public.inventory_reservations(variant_id, expires_at) where status = 'active';

create table public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method public.payment_method not null,
  sender_name text not null,
  sender_contact text not null,
  amount_reported_cents integer not null check (amount_reported_cents > 0),
  payment_date date not null,
  approximate_time time not null,
  transaction_reference text,
  screenshot_storage_path text,
  screenshot_sha256 text,
  customer_note text,
  status public.payment_status not null default 'submitted',
  is_active boolean not null default true,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  rejection_reason text,
  internal_admin_note text,
  idempotency_key uuid not null unique,
  submitted_at timestamptz not null default now()
);
create unique index one_active_payment_submission_per_order
  on public.payment_submissions(order_id) where is_active;
create index payment_reference_idx on public.payment_submissions(transaction_reference)
  where transaction_reference is not null;

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  event_type text not null,
  actor_type text not null check (actor_type in ('customer','admin','system','provider')),
  actor_id uuid,
  previous_value jsonb,
  new_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  recipient_user_id uuid,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','partially_sent','failed','cancelled')),
  priority text not null default 'normal' check (priority in ('normal','high')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_push_devices (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  native_device_token text,
  platform text not null check (platform in ('ios','android')),
  device_name text,
  app_version text,
  installation_id uuid not null unique,
  notification_permission_status text not null,
  is_active boolean not null default true,
  last_registered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  title text not null,
  body text not null,
  order_id uuid references public.orders(id),
  payment_submission_id uuid references public.payment_submissions(id),
  route text not null,
  priority text not null default 'normal',
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.has_admin_role(allowed public.admin_role[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.admin_role_assignments a
    where a.user_id = auth.uid() and a.is_active and a.role = any(allowed)
  );
$$;

create or replace function public.require_admin_aal2(allowed public.admin_role[])
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','aal1') <> 'aal2'
     or not public.has_admin_role(allowed) then
    raise exception 'insufficient_admin_authorization' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.approve_payment(p_submission_id uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_submission public.payment_submissions;
  v_order public.orders;
  v_reservation public.inventory_reservations;
begin
  perform public.require_admin_aal2(array['payment_reviewer','manager','super_admin']::public.admin_role[]);

  select * into v_submission from public.payment_submissions
    where id = p_submission_id for update;
  if not found then raise exception 'submission_not_found'; end if;

  select * into v_order from public.orders
    where id = v_submission.order_id for update;
  if v_order.payment_status = 'verified' then return v_order.id; end if;
  if v_order.order_status in ('cancelled','expired','completed','refunded') then
    raise exception 'order_not_approvable';
  end if;
  if v_submission.amount_reported_cents <> v_order.total_cents
     and not public.has_admin_role(array['manager','super_admin']::public.admin_role[]) then
    raise exception 'manager_required_for_amount_mismatch' using errcode = '42501';
  end if;

  for v_reservation in
    select * from public.inventory_reservations
    where order_id = v_order.id and status = 'active' for update
  loop
    update public.inventory_items
      set committed = committed + v_reservation.quantity, updated_at = now()
      where variant_id = v_reservation.variant_id
        and on_hand - committed >= v_reservation.quantity;
    if not found then raise exception 'inventory_commit_failed'; end if;
    update public.inventory_reservations
      set status = 'committed', committed_at = now() where id = v_reservation.id;
  end loop;

  update public.payment_submissions
    set status = 'verified', reviewed_at = now(), reviewed_by = auth.uid(),
        internal_admin_note = p_note
    where id = v_submission.id;
  update public.orders
    set payment_status = 'verified', order_status = 'processing',
        fulfillment_status = 'ready_for_fulfillment',
        verified_at = now(), verified_by = auth.uid(), updated_at = now()
    where id = v_order.id;
  insert into public.audit_events(order_id,event_type,actor_type,actor_id,new_value)
    values(v_order.id,'payment.approved','admin',auth.uid(),jsonb_build_object('submission_id',v_submission.id));
  insert into public.notification_outbox(idempotency_key,event_type,aggregate_type,aggregate_id,payload)
    values('payment_approved:'||v_submission.id,'payment_approved','order',v_order.id,
      jsonb_build_object('orderId',v_order.id,'orderNumber',v_order.order_number))
    on conflict (idempotency_key) do nothing;
  return v_order.id;
end;
$$;

create or replace function public.expire_unpaid_orders(p_limit integer default 100)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  with candidates as (
    select id from public.orders
    where expires_at <= now()
      and order_status = 'awaiting_payment'
      and payment_status = 'unpaid'
    order by expires_at for update skip locked limit p_limit
  ), expired as (
    update public.orders o
      set order_status='expired', payment_status='expired',
          expiration_reason='payment_window_elapsed', updated_at=now()
    from candidates c where o.id=c.id returning o.id
  )
  update public.inventory_reservations r
    set status='expired', released_at=now()
    where r.order_id in (select id from expired) and r.status='active';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.payment_submissions enable row level security;
alter table public.audit_events enable row level security;
alter table public.admin_role_assignments enable row level security;
alter table public.payment_method_configs enable row level security;
alter table public.admin_push_devices enable row level security;
alter table public.admin_notifications enable row level security;
alter table public.notification_outbox enable row level security;

create policy "public reads active products" on public.products for select
  using (status = 'active' or public.has_admin_role(array['manager','super_admin']::public.admin_role[]));
create policy "public reads active variants" on public.product_variants for select
  using (status = 'active' or public.has_admin_role(array['manager','super_admin']::public.admin_role[]));
create policy "customers read own orders" on public.orders for select
  using (customer_user_id = auth.uid() or public.has_admin_role(array['support','payment_reviewer','fulfillment','manager','super_admin']::public.admin_role[]));
create policy "customers read own order items" on public.order_items for select
  using (exists(select 1 from public.orders o where o.id=order_id and o.customer_user_id=auth.uid())
    or public.has_admin_role(array['support','payment_reviewer','fulfillment','manager','super_admin']::public.admin_role[]));
create policy "customers read own submissions" on public.payment_submissions for select
  using (exists(select 1 from public.orders o where o.id=order_id and o.customer_user_id=auth.uid())
    or public.has_admin_role(array['support','payment_reviewer','manager','super_admin']::public.admin_role[]));
create policy "admins read reservations" on public.inventory_reservations for select
  using (public.has_admin_role(array['payment_reviewer','fulfillment','manager','super_admin']::public.admin_role[]));
create policy "admins read inventory" on public.inventory_items for select
  using (public.has_admin_role(array['payment_reviewer','fulfillment','manager','super_admin']::public.admin_role[]));
create policy "admins read audit" on public.audit_events for select
  using (public.has_admin_role(array['support','payment_reviewer','fulfillment','manager','super_admin']::public.admin_role[]));
create policy "admins read payment configs" on public.payment_method_configs for select
  using (public.has_admin_role(array['payment_reviewer','manager','super_admin']::public.admin_role[]));
create policy "admins manage own devices" on public.admin_push_devices for all
  using (admin_user_id=auth.uid()) with check (admin_user_id=auth.uid());
create policy "admins read own notifications" on public.admin_notifications for select
  using (admin_user_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-evidence','payment-evidence',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "customers upload own evidence" on storage.objects for insert to authenticated
  with check (bucket_id='payment-evidence' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "admins read evidence" on storage.objects for select to authenticated
  using (bucket_id='payment-evidence'
    and public.has_admin_role(array['payment_reviewer','manager','super_admin']::public.admin_role[]));

commit;
