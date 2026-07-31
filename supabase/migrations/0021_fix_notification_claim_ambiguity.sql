begin;

create or replace function public.claim_admin_sms_deliveries(p_limit integer default 50)
returns table(
  delivery_id uuid, outbox_id uuid, recipient_user_id uuid, phone_e164 text,
  event_type text, aggregate_id uuid, payload jsonb,
  commerce_mode public.commerce_mode, attempt_count integer
) language plpgsql security definer set search_path = ''
as $$
begin
  update public.notification_deliveries d
    set status='pending',processing_started_at=null,next_attempt_at=now(),updated_at=now()
    where d.channel='sms' and d.status='processing'
      and d.processing_started_at < now()-interval '10 minutes' and d.attempt_count < 5;
  update public.notification_deliveries d
    set status='failed',processing_started_at=null,last_error_code='retry_exhausted',updated_at=now()
    where d.channel='sms' and d.status='processing'
      and d.processing_started_at < now()-interval '10 minutes' and d.attempt_count >= 5;

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
  update public.notification_deliveries d
    set status='pending',processing_started_at=null,next_attempt_at=now(),updated_at=now()
    where d.channel='hark' and d.status='processing'
      and d.processing_started_at < now()-interval '10 minutes' and d.attempt_count < 5;
  update public.notification_deliveries d
    set status='failed',processing_started_at=null,last_error_code='retry_exhausted',updated_at=now()
    where d.channel='hark' and d.status='processing'
      and d.processing_started_at < now()-interval '10 minutes' and d.attempt_count >= 5;

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

revoke all on function public.claim_admin_sms_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_admin_sms_deliveries(integer) to service_role;
revoke all on function public.claim_admin_hark_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_admin_hark_deliveries(integer) to service_role;

commit;
