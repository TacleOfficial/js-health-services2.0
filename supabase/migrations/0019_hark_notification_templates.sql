begin;

create table public.notification_hark_templates (
  event_type text primary key check (event_type in (
    'order_created',
    'payment_submission_created',
    'payment_amount_mismatch',
    'payment_approved'
  )),
  title_template text not null check (char_length(trim(title_template)) between 1 and 80),
  body_template text not null check (char_length(trim(body_template)) between 1 and 2000),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.notification_hark_templates(event_type,title_template,body_template)
values
  ('order_created','Velle · New order','{orderNumber} was created for {total}.'),
  ('payment_submission_created','Velle · Payment submitted','Payment submitted for {orderNumber}: {reportedAmount} via {method}.'),
  ('payment_amount_mismatch','Velle · Payment mismatch','{orderNumber} reported {reportedAmount} via {method}; expected {expectedAmount}.'),
  ('payment_approved','Velle · Payment approved','Payment for {orderNumber} was approved.');

alter table public.notification_hark_templates enable row level security;
create policy "super admins read Hark templates" on public.notification_hark_templates for select
  using (public.has_admin_role(array['super_admin']::public.admin_role[]));

create function public.admin_update_hark_template(
  p_event_type text, p_title_template text, p_body_template text
) returns void language plpgsql security definer set search_path = ''
as $$
declare v_previous public.notification_hark_templates;
begin
  perform public.require_admin_aal2(array['super_admin']::public.admin_role[]);
  if p_event_type not in (
    'order_created','payment_submission_created','payment_amount_mismatch','payment_approved'
  ) or char_length(trim(p_title_template)) not between 1 and 80
    or char_length(trim(p_body_template)) not between 1 and 2000 then
    raise exception 'invalid_hark_notification_template';
  end if;

  select * into v_previous from public.notification_hark_templates
    where event_type=p_event_type for update;
  if not found then raise exception 'hark_notification_template_not_found'; end if;

  update public.notification_hark_templates set
    title_template=trim(p_title_template),body_template=trim(p_body_template),
    updated_by=auth.uid(),updated_at=now()
    where event_type=p_event_type;

  insert into public.audit_events(event_type,actor_type,actor_id,previous_value,new_value,metadata)
  values(
    'notification.hark_template_updated','admin',auth.uid(),
    jsonb_build_object('title_template',v_previous.title_template,'body_template',v_previous.body_template),
    jsonb_build_object('title_template',trim(p_title_template),'body_template',trim(p_body_template)),
    jsonb_build_object('notification_event_type',p_event_type)
  );
end;
$$;

revoke all on function public.admin_update_hark_template(text,text,text) from public, anon;
grant execute on function public.admin_update_hark_template(text,text,text) to authenticated;

commit;
