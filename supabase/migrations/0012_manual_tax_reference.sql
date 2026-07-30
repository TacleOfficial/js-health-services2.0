alter table public.orders
  add constraint orders_manual_rate_reference_required
  check (tax_source not in ('manual_rate','manual_fallback') or manual_tax_rate_id is not null);
