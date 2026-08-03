alter table public.orders
  add column archived_at timestamptz,
  add column archived_by uuid references auth.users(id);

create index orders_admin_queue_active_idx
  on public.orders (created_at desc)
  where archived_at is null;

comment on column public.orders.archived_at is
  'Administrative soft-delete marker. Archived orders remain available for history and restoration.';
