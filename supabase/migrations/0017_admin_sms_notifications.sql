begin;

alter table public.notification_outbox
  add column sms_fanned_out_at timestamptz;

create table public.admin_sms_preferences (
  admin_user_id uuid primary key references auth.users(id) on delete cascade,
  phone_e164 text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  is_enabled boolean not null default false,
  verified_at timestamptz,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_enabled or verified_at is not null)
);

create table public.admin_sms_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  code_salt text not null,
  code_hash text not null,
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index admin_sms_challenge_active_idx
  on public.admin_sms_verification_challenges(admin_user_id, expires_at desc)
  where consumed_at is null;

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.notification_outbox(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('sms','push')),
  status text not null default 'pending'
    check (status in ('pending','processing','sent','delivered','failed','soft_bounce','hard_bounce','rejected','replied')),
  provider text not null,
  provider_message_id text,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  last_error_code text,
  provider_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(outbox_id, recipient_user_id, channel)
);
create index notification_deliveries_pending_idx
  on public.notification_deliveries(channel, next_attempt_at)
  where status = 'pending';
create unique index notification_deliveries_provider_message_idx
  on public.notification_deliveries(provider, provider_message_id)
  where provider_message_id is not null;

alter table public.admin_sms_preferences enable row level security;
alter table public.admin_sms_verification_challenges enable row level security;
alter table public.notification_deliveries enable row level security;

create policy "super admins read sms preferences" on public.admin_sms_preferences for select
  using (public.has_admin_role(array['super_admin']::public.admin_role[]));
create policy "admins read own sms preference" on public.admin_sms_preferences for select
  using (admin_user_id = auth.uid());
create policy "super admins read sms challenges" on public.admin_sms_verification_challenges for select
  using (public.has_admin_role(array['super_admin']::public.admin_role[]));
create policy "super admins read notification deliveries" on public.notification_deliveries for select
  using (public.has_admin_role(array['super_admin']::public.admin_role[]));

create or replace function public.admin_set_sms_phone(p_admin_user_id uuid, p_phone_e164 text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_admin_aal2(array['super_admin']::public.admin_role[]);
  if p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'invalid_e164_phone'; end if;
  if not exists (
    select 1 from public.admin_role_assignments
    where user_id=p_admin_user_id and is_active
      and role=any(array['payment_reviewer','manager','super_admin']::public.admin_role[])
  ) then raise exception 'sms_recipient_role_required'; end if;

  insert into public.admin_sms_preferences(
    admin_user_id,phone_e164,is_enabled,verified_at,created_by,updated_by
  ) values(p_admin_user_id,p_phone_e164,false,null,auth.uid(),auth.uid())
  on conflict(admin_user_id) do update set
    phone_e164=excluded.phone_e164,is_enabled=false,verified_at=null,
    updated_by=auth.uid(),updated_at=now();
  update public.admin_sms_verification_challenges
    set consumed_at=now()
    where admin_user_id=p_admin_user_id and consumed_at is null;
end;
$$;

create or replace function public.admin_create_sms_challenge(
  p_admin_user_id uuid, p_code_salt text, p_code_hash text
) returns table(challenge_id uuid, phone_e164 text)
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_admin_aal2(array['super_admin']::public.admin_role[]);
  update public.admin_sms_verification_challenges set consumed_at=now()
    where admin_user_id=p_admin_user_id and consumed_at is null;
  return query
    insert into public.admin_sms_verification_challenges as challenge(
      admin_user_id,phone_e164,code_salt,code_hash,expires_at,created_by
    )
    select p.admin_user_id,p.phone_e164,p_code_salt,p_code_hash,now()+interval '10 minutes',auth.uid()
    from public.admin_sms_preferences p where p.admin_user_id=p_admin_user_id
    returning challenge.id,challenge.phone_e164;
end;
$$;

create or replace function public.admin_confirm_sms_challenge(
  p_admin_user_id uuid, p_code text
) returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_challenge public.admin_sms_verification_challenges;
begin
  perform public.require_admin_aal2(array['super_admin']::public.admin_role[]);
  select * into v_challenge from public.admin_sms_verification_challenges
    where admin_user_id=p_admin_user_id and consumed_at is null
    order by created_at desc limit 1 for update;
  if not found or v_challenge.expires_at <= now() or v_challenge.attempt_count >= 5 then return false; end if;
  update public.admin_sms_verification_challenges
    set attempt_count=attempt_count+1 where id=v_challenge.id;
  if encode(digest(p_code||v_challenge.code_salt,'sha256'),'hex') <> v_challenge.code_hash then return false; end if;
  update public.admin_sms_verification_challenges set consumed_at=now() where id=v_challenge.id;
  update public.admin_sms_preferences
    set verified_at=now(),updated_by=auth.uid(),updated_at=now()
    where admin_user_id=p_admin_user_id and phone_e164=v_challenge.phone_e164;
  return found;
end;
$$;

create or replace function public.admin_set_sms_enabled(p_admin_user_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_admin_aal2(array['super_admin']::public.admin_role[]);
  update public.admin_sms_preferences set
    is_enabled=p_enabled,updated_by=auth.uid(),updated_at=now()
    where admin_user_id=p_admin_user_id and (not p_enabled or verified_at is not null);
  if not found then raise exception 'verified_sms_preference_required'; end if;
end;
$$;

create or replace function public.claim_admin_sms_deliveries(p_limit integer default 50)
returns table(
  delivery_id uuid, outbox_id uuid, recipient_user_id uuid, phone_e164 text,
  event_type text, payload jsonb, commerce_mode public.commerce_mode, attempt_count integer
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
    select o.id from public.notification_outbox o
    where o.sms_fanned_out_at is null
      and o.event_type in ('payment_submission_created','payment_amount_mismatch')
    order by o.created_at for update skip locked limit p_limit
  ), inserted as (
    insert into public.notification_deliveries(outbox_id,recipient_user_id,channel,provider)
    select e.id,p.admin_user_id,'sms','brevo'
    from events e
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
  select c.id,c.outbox_id,c.recipient_user_id,p.phone_e164,o.event_type,o.payload,o.commerce_mode,c.attempt_count
    from claimed c
    join public.admin_sms_preferences p on p.admin_user_id=c.recipient_user_id
    join public.notification_outbox o on o.id=c.outbox_id;
end;
$$;

revoke all on function public.claim_admin_sms_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_admin_sms_deliveries(integer) to service_role;
revoke all on function public.admin_set_sms_phone(uuid,text) from public, anon;
revoke all on function public.admin_create_sms_challenge(uuid,text,text) from public, anon;
revoke all on function public.admin_confirm_sms_challenge(uuid,text) from public, anon;
revoke all on function public.admin_set_sms_enabled(uuid,boolean) from public, anon;
grant execute on function public.admin_set_sms_phone(uuid,text) to authenticated;
grant execute on function public.admin_create_sms_challenge(uuid,text,text) to authenticated;
grant execute on function public.admin_confirm_sms_challenge(uuid,text) to authenticated;
grant execute on function public.admin_set_sms_enabled(uuid,boolean) to authenticated;

commit;
