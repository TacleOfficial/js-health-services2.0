begin;

drop trigger if exists payment_inherits_commerce_mode on public.payment_submissions;
drop trigger if exists notification_inherits_commerce_mode on public.notification_outbox;
drop trigger if exists audit_inherits_commerce_mode on public.audit_events;
drop function if exists public.inherit_order_commerce_mode();

create function public.payment_inherit_order_commerce_mode()
returns trigger language plpgsql set search_path=''
as $$
begin
  select commerce_mode into new.commerce_mode
  from public.orders where id=new.order_id;
  return new;
end;
$$;

create function public.notification_inherit_order_commerce_mode()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.aggregate_type='order' then
    select commerce_mode into new.commerce_mode
    from public.orders where id=new.aggregate_id;
  end if;
  return new;
end;
$$;

create function public.audit_inherit_order_commerce_mode()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.order_id is not null then
    select commerce_mode into new.commerce_mode
    from public.orders where id=new.order_id;
  end if;
  return new;
end;
$$;

create trigger payment_inherits_commerce_mode before insert on public.payment_submissions
  for each row execute function public.payment_inherit_order_commerce_mode();
create trigger notification_inherits_commerce_mode before insert on public.notification_outbox
  for each row execute function public.notification_inherit_order_commerce_mode();
create trigger audit_inherits_commerce_mode before insert on public.audit_events
  for each row execute function public.audit_inherit_order_commerce_mode();

commit;
