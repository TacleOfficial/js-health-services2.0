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
  if v_settings.mode='manual_free' and new.shipping_cents<>0 then
    raise exception 'shipping_settings_changed';
  end if;
  if v_settings.mode='manual_fixed' and new.shipping_cents<>v_settings.fixed_price_cents then
    raise exception 'shipping_settings_changed';
  end if;
  if v_settings.mode='shippo' and new.shippo_rate_id like 'manual_%:%' then
    raise exception 'shipping_settings_changed';
  end if;
  new.shipping_mode := v_settings.mode;
  new.shipping_settings_version := v_settings.version;
  new.shipping_source := v_settings.mode::text;
  return new;
end;
$$;
