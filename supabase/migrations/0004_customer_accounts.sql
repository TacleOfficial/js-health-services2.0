begin;

alter table public.profiles
  add column if not exists phone text,
  add column if not exists organization text,
  add column if not exists stripe_customer_id text unique,
  add column if not exists preferred_payment_method public.payment_method default 'zelle',
  add column if not exists payment_sender_name text,
  add column if not exists payment_sender_contact text;

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 50),
  recipient_name text not null,
  line1 text not null,
  line2 text,
  city text not null,
  region text not null,
  postal_code text not null,
  country text not null default 'US',
  phone text,
  is_default_shipping boolean not null default false,
  is_default_billing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_default_shipping_per_customer on public.customer_addresses(user_id) where is_default_shipping;
create unique index one_default_billing_per_customer on public.customer_addresses(user_id) where is_default_billing;

create table public.saved_products (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_slug text not null references public.products(slug) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, product_slug)
);

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_orders boolean not null default true,
  email_payments boolean not null default true,
  email_rewards boolean not null default true,
  email_support boolean not null default true,
  email_marketing boolean not null default false,
  in_app_orders boolean not null default true,
  in_app_payments boolean not null default true,
  in_app_rewards boolean not null default true,
  in_app_support boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('order','payment','reward','support','account')),
  title text not null,
  body text not null,
  route text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index customer_notifications_inbox_idx on public.customer_notifications(user_id, created_at desc);

create table public.customer_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  user_agent text,
  ip_hint text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(user_id, session_id)
);

create type public.support_ticket_status as enum ('open','awaiting_customer','in_progress','resolved','closed');
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  subject text not null check (char_length(subject) between 3 and 120),
  status public.support_ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  author_type text not null check (author_type in ('customer','admin')),
  body text not null check (char_length(body) between 1 and 5000),
  attachment_path text,
  created_at timestamptz not null default now()
);

create table public.reward_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  entry_type text not null check (entry_type in ('earn','adjustment','reversal')),
  points integer not null check (points <> 0),
  description text not null,
  qualifying_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(order_id, entry_type)
);

create table public.stripe_payment_methods (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  brand text not null,
  last4 text not null check (last4 ~ '^[0-9]{4}$'),
  exp_month integer not null check (exp_month between 1 and 12),
  exp_year integer not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index one_default_card_per_customer on public.stripe_payment_methods(user_id) where is_default;

create table public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.customer_addresses enable row level security;
alter table public.saved_products enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.customer_notifications enable row level security;
alter table public.customer_sessions enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.reward_ledger enable row level security;
alter table public.stripe_payment_methods enable row level security;
alter table public.stripe_webhook_events enable row level security;

create policy "customers manage own profile" on public.profiles for all
  using (id = auth.uid()) with check (id = auth.uid());
create policy "customers manage own addresses" on public.customer_addresses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "customers manage own saved products" on public.saved_products for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "customers manage own notification preferences" on public.notification_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "customers read own notifications" on public.customer_notifications for select
  using (user_id = auth.uid());
create policy "customers update own notifications" on public.customer_notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "customers manage own sessions" on public.customer_sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "customers manage own tickets" on public.support_tickets for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "customers read own ticket messages" on public.support_messages for select
  using (exists(select 1 from public.support_tickets t where t.id=ticket_id and t.user_id=auth.uid()));
create policy "customers add own ticket messages" on public.support_messages for insert
  with check (author_user_id=auth.uid() and author_type='customer' and exists(
    select 1 from public.support_tickets t where t.id=ticket_id and t.user_id=auth.uid()
  ));
create policy "customers read own rewards" on public.reward_ledger for select
  using (user_id = auth.uid());
create policy "customers read own cards" on public.stripe_payment_methods for select
  using (user_id = auth.uid());
create policy "managers update payment configs" on public.payment_method_configs for update
  using (public.has_admin_role(array['manager','super_admin']::public.admin_role[]))
  with check (public.has_admin_role(array['manager','super_admin']::public.admin_role[]));

create or replace function public.award_completed_order_rewards(p_order_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_order public.orders; v_points integer;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.order_status <> 'completed' then return 0; end if;
  v_points := floor(v_order.total_cents / 100.0);
  insert into public.reward_ledger(user_id,order_id,entry_type,points,description,qualifying_at)
    values(v_order.customer_user_id,v_order.id,'earn',v_points,'Completed order '||v_order.order_number,v_order.updated_at)
    on conflict(order_id,entry_type) do nothing;
  return case when found then v_points else 0 end;
end;
$$;

create or replace function public.reverse_order_rewards(p_order_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_earn public.reward_ledger;
begin
  select * into v_earn from public.reward_ledger where order_id=p_order_id and entry_type='earn';
  if not found then return 0; end if;
  insert into public.reward_ledger(user_id,order_id,entry_type,points,description)
    values(v_earn.user_id,p_order_id,'reversal',-v_earn.points,'Refund reward reversal')
    on conflict(order_id,entry_type) do nothing;
  return case when found then -v_earn.points else 0 end;
end;
$$;

grant execute on function public.award_completed_order_rewards(uuid) to service_role;
grant execute on function public.reverse_order_rewards(uuid) to service_role;

insert into public.payment_method_configs(method,display_name,destination_name,destination_value,customer_instructions,is_active)
values ('stripe_card','Credit or debit card','Stripe','managed by Stripe','Cards are processed securely by Stripe.',false)
on conflict(method) do nothing;

commit;
