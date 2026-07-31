begin;

create table public.notification_routing_settings (
  event_type text not null check (event_type in (
    'order_created',
    'payment_submission_created',
    'payment_amount_mismatch',
    'payment_approved'
  )),
  channel text not null check (channel in ('sms','hark')),
  is_enabled boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (event_type, channel)
);

insert into public.notification_routing_settings(event_type,channel,is_enabled)
values
  ('order_created','sms',false),
  ('payment_submission_created','sms',true),
  ('payment_amount_mismatch','sms',true),
  ('payment_approved','sms',false),
  ('order_created','hark',false),
  ('payment_submission_created','hark',false),
  ('payment_amount_mismatch','hark',false),
  ('payment_approved','hark',false);

alter table public.notification_routing_settings enable row level security;
create policy "super admins read notification routing" on public.notification_routing_settings for select
  using (public.has_admin_role(array['super_admin']::public.admin_role[]));

alter table public.notification_outbox
  add column hark_fanned_out_at timestamptz;

-- Hark selections are prospective. Never deliver events created before this
-- channel existed when a super-admin enables a route later.
update public.notification_outbox set hark_fanned_out_at=now();

alter table public.notification_deliveries
  drop constraint notification_deliveries_channel_check,
  alter column recipient_user_id drop not null,
  add constraint notification_deliveries_channel_check check (channel in ('sms','push','hark')),
  add constraint notification_deliveries_recipient_check check (
    (channel='hark' and recipient_user_id is null)
    or (channel<>'hark' and recipient_user_id is not null)
  ),
  add column accepted_device_count integer check (accepted_device_count is null or accepted_device_count >= 0),
  add column provider_response jsonb;

create unique index notification_deliveries_hark_event_idx
  on public.notification_deliveries(outbox_id,channel)
  where channel='hark';

create or replace function public.admin_set_notification_route(
  p_event_type text, p_channel text, p_enabled boolean
) returns void language plpgsql security definer set search_path = ''
as $$
declare v_previous boolean;
begin
  perform public.require_admin_aal2(array['super_admin']::public.admin_role[]);
  if p_event_type not in (
    'order_created','payment_submission_created','payment_amount_mismatch','payment_approved'
  ) or p_channel not in ('sms','hark') then
    raise exception 'invalid_notification_route';
  end if;

  select is_enabled into v_previous
    from public.notification_routing_settings
    where event_type=p_event_type and channel=p_channel for update;
  if not found then raise exception 'notification_route_not_found'; end if;

  -- Close the current evaluation window before changing the route so the new
  -- selection applies only to events inserted afterward.
  if p_channel='sms' then
    update public.notification_outbox
      set sms_fanned_out_at=now(),updated_at=now()
      where event_type=p_event_type and sms_fanned_out_at is null;
  else
    update public.notification_outbox
      set hark_fanned_out_at=now(),updated_at=now()
      where event_type=p_event_type and hark_fanned_out_at is null;
  end if;

  update public.notification_routing_settings set
    is_enabled=p_enabled,updated_by=auth.uid(),updated_at=now()
    where event_type=p_event_type and channel=p_channel;

  if v_previous is distinct from p_enabled then
    insert into public.audit_events(event_type,actor_type,actor_id,previous_value,new_value,metadata)
    values(
      'notification.routing_updated','admin',auth.uid(),
      jsonb_build_object('enabled',v_previous),
      jsonb_build_object('enabled',p_enabled),
      jsonb_build_object('notification_event_type',p_event_type,'channel',p_channel)
    );
  end if;
end;
$$;

create or replace function public.claim_admin_sms_deliveries(p_limit integer default 50)
returns table(
  delivery_id uuid, outbox_id uuid, recipient_user_id uuid, phone_e164 text,
  event_type text, aggregate_id uuid, payload jsonb,
  commerce_mode public.commerce_mode, attempt_count integer
) language plpgsql security definer set search_path = ''
as $$
begin
  update public.notification_deliveries
    set status='pending',processing_started_at=null,next_attempt_at=now(),updated_at=now()
    where channel='sms' and status='processing'
      and processing_started_at < now()-interval '10 minutes' and attempt_count < 5;
  update public.notification_deliveries
    set status='failed',processing_started_at=null,last_error_code='retry_exhausted',updated_at=now()
    where channel='sms' and status='processing'
      and processing_started_at < now()-interval '10 minutes' and attempt_count >= 5;

  with events as (
    select o.id
    from public.notification_outbox o
    where o.sms_fanned_out_at is null
      and o.event_type in (
        'order_created','payment_submission_created','payment_amount_mismatch','payment_approved'
      )
    order by o.created_at for update skip locked limit p_limit
  ), inserted as (
    insert into public.notification_deliveries(outbox_id,recipient_user_id,channel,provider)
    select e.id,p.admin_user_id,'sms','brevo'
    from events e
    join public.notification_outbox o on o.id=e.id
    join public.notification_routing_settings r
      on r.event_type=o.event_type and r.channel='sms' and r.is_enabled
    join public.admin_sms_preferences p on p.is_enabled and p.verified_at is not null
    where exists (
      select 1 from public.admin_role_assignments a
      where a.user_id=p.admin_user_id and a.is_active
        and a.role=any(array['payment_reviewer','manager','super_admin']::public.admin_role[])
    )
    on conflict(outbox_id,recipient_user_id,channel) do nothing
  )
  update public.notification_outbox o set sms_fanned_out_at=now(),updated_at=now()
    where o.id in (select id from events);

  return query
  with candidates as (
    select d.id from public.notification_deliveries d
    where d.channel='sms' and d.status='pending' and d.next_attempt_at<=now() and d.attempt_count<5
    order by d.next_attempt_at,d.created_at for update skip locked limit p_limit
  ), claimed as (
    update public.notification_deliveries d set
      status='processing',attempt_count=d.attempt_count+1,
      processing_started_at=now(),updated_at=now()
    from candidates c where d.id=c.id returning d.*
  )
  select c.id,c.outbox_id,c.recipient_user_id,p.phone_e164,o.event_type,o.aggregate_id,
    o.payload,o.commerce_mode,c.attempt_count
  from claimed c
  join public.admin_sms_preferences p on p.admin_user_id=c.recipient_user_id
  join public.notification_outbox o on o.id=c.outbox_id;
end;
$$;

create or replace function public.claim_admin_hark_deliveries(p_limit integer default 50)
returns table(
  delivery_id uuid, outbox_id uuid, event_type text, aggregate_id uuid,
  payload jsonb, commerce_mode public.commerce_mode, attempt_count integer
) language plpgsql security definer set search_path = ''
as $$
begin
  update public.notification_deliveries
    set status='pending',processing_started_at=null,next_attempt_at=now(),updated_at=now()
    where channel='hark' and status='processing'
      and processing_started_at < now()-interval '10 minutes' and attempt_count < 5;
  update public.notification_deliveries
    set status='failed',processing_started_at=null,last_error_code='retry_exhausted',updated_at=now()
    where channel='hark' and status='processing'
      and processing_started_at < now()-interval '10 minutes' and attempt_count >= 5;

  with events as (
    select o.id
    from public.notification_outbox o
    where o.hark_fanned_out_at is null
      and o.event_type in (
        'order_created','payment_submission_created','payment_amount_mismatch','payment_approved'
      )
    order by o.created_at for update skip locked limit p_limit
  ), inserted as (
    insert into public.notification_deliveries(outbox_id,recipient_user_id,channel,provider)
    select e.id,null,'hark','hark'
    from events e
    join public.notification_outbox o on o.id=e.id
    join public.notification_routing_settings r
      on r.event_type=o.event_type and r.channel='hark' and r.is_enabled
    on conflict do nothing
  )
  update public.notification_outbox o set hark_fanned_out_at=now(),updated_at=now()
    where o.id in (select id from events);

  return query
  with candidates as (
    select d.id from public.notification_deliveries d
    where d.channel='hark' and d.status='pending' and d.next_attempt_at<=now() and d.attempt_count<5
    order by d.next_attempt_at,d.created_at for update skip locked limit p_limit
  ), claimed as (
    update public.notification_deliveries d set
      status='processing',attempt_count=d.attempt_count+1,
      processing_started_at=now(),updated_at=now()
    from candidates c where d.id=c.id returning d.*
  )
  select c.id,c.outbox_id,o.event_type,o.aggregate_id,o.payload,o.commerce_mode,c.attempt_count
  from claimed c join public.notification_outbox o on o.id=c.outbox_id;
end;
$$;

revoke all on function public.admin_set_notification_route(text,text,boolean) from public, anon;
grant execute on function public.admin_set_notification_route(text,text,boolean) to authenticated;
revoke all on function public.claim_admin_hark_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_admin_hark_deliveries(integer) to service_role;

commit;
