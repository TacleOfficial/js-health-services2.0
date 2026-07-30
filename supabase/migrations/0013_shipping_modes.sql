begin;

create type public.shipping_mode as enum ('shippo','manual_free','manual_fixed');

create table public.commerce_shipping_settings (
  singleton boolean primary key default true check (singleton),
  mode public.shipping_mode not null default 'shippo',
  fixed_price_cents integer not null default 0 check (fixed_price_cents >= 0),
  version bigint not null default 1 check (version > 0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into public.commerce_shipping_settings(singleton) values(true);

create table public.shipping_settings_audit (
  id uuid primary key default gen_random_uuid(),
  previous_mode public.shipping_mode not null,
  new_mode public.shipping_mode not null,
  previous_fixed_price_cents integer not null,
  new_fixed_price_cents integer not null,
  previous_version bigint not null,
  new_version bigint not null,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.orders
  add column shipping_mode public.shipping_mode not null default 'shippo',
  add column shipping_settings_version bigint not null default 1,
  add column shipping_source text not null default 'shippo'
    check (shipping_source in ('shippo','manual_free','manual_fixed'));
update public.orders set shipping_mode='manual_fixed',shipping_source='manual_fixed'
  where commerce_mode='staging';

create table public.manual_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  commerce_mode public.commerce_mode not null,
  shipping_mode public.shipping_mode not null check (shipping_mode in ('manual_free','manual_fixed')),
  carrier text not null check (char_length(trim(carrier)) between 2 and 80),
  tracking_number text not null check (char_length(trim(tracking_number)) between 3 and 160),
  tracking_url text,
  status text not null default 'shipped' check (status in ('shipped','delivered')),
  idempotency_key uuid not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  delivered_by uuid references auth.users(id),
  delivered_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.apply_shipping_snapshot()
returns trigger language plpgsql set search_path=''
as $$
declare v_settings public.commerce_shipping_settings;
begin
  if new.commerce_mode='staging' then
    new.shipping_mode := 'manual_fixed';
    new.shipping_settings_version := 1;
    new.shipping_source := 'manual_fixed';
    return new;
  end if;
  select * into v_settings from public.commerce_shipping_settings where singleton;
  new.shipping_mode := v_settings.mode;
  new.shipping_settings_version := v_settings.version;
  new.shipping_source := v_settings.mode::text;
  return new;
end;
$$;
create trigger orders_apply_shipping_snapshot before insert on public.orders
  for each row execute function public.apply_shipping_snapshot();

create or replace function public.prevent_shipping_snapshot_change()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.shipping_mode <> old.shipping_mode
    or new.shipping_settings_version <> old.shipping_settings_version
    or new.shipping_source <> old.shipping_source
    or new.shipping_cents <> old.shipping_cents then
    raise exception 'shipping_snapshot_is_immutable' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger orders_immutable_shipping_snapshot before update on public.orders
  for each row execute function public.prevent_shipping_snapshot_change();

create or replace function public.set_shipping_settings(
  p_actor_id uuid,
  p_mode public.shipping_mode,
  p_fixed_price_cents integer,
  p_expected_version bigint
) returns public.commerce_shipping_settings
language plpgsql security definer set search_path=''
as $$
declare v_current public.commerce_shipping_settings; v_result public.commerce_shipping_settings;
begin
  if not exists(select 1 from public.admin_role_assignments where user_id=p_actor_id and role='super_admin' and is_active)
    then raise exception 'super_admin_required' using errcode='42501'; end if;
  if p_fixed_price_cents < 0 then raise exception 'invalid_fixed_shipping_price'; end if;
  select * into v_current from public.commerce_shipping_settings where singleton for update;
  if v_current.version <> p_expected_version then raise exception 'stale_shipping_settings_version'; end if;
  update public.commerce_shipping_settings set mode=p_mode,fixed_price_cents=p_fixed_price_cents,
    version=version+1,updated_by=p_actor_id,updated_at=now()
  where singleton returning * into v_result;
  insert into public.shipping_settings_audit(previous_mode,new_mode,previous_fixed_price_cents,new_fixed_price_cents,
    previous_version,new_version,actor_id)
  values(v_current.mode,p_mode,v_current.fixed_price_cents,p_fixed_price_cents,v_current.version,v_result.version,p_actor_id);
  return v_result;
end;
$$;

alter table public.commerce_shipping_settings enable row level security;
alter table public.shipping_settings_audit enable row level security;
alter table public.manual_shipments enable row level security;
create policy "admins read shipping settings" on public.commerce_shipping_settings for select
  using(public.has_admin_role(array['support','payment_reviewer','fulfillment','manager','super_admin']::public.admin_role[]));
create policy "managers read shipping audit" on public.shipping_settings_audit for select
  using(public.has_admin_role(array['manager','super_admin']::public.admin_role[]));
create policy "fulfillment reads manual shipments" on public.manual_shipments for select
  using(public.has_admin_role(array['fulfillment','manager','super_admin']::public.admin_role[]));

revoke all on function public.set_shipping_settings(uuid,public.shipping_mode,integer,bigint) from public;
grant execute on function public.set_shipping_settings(uuid,public.shipping_mode,integer,bigint) to service_role;

commit;
