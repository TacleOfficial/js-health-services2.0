begin;

alter table public.notification_hark_templates
  add column image_url text check (
    image_url is null
    or (char_length(image_url) <= 2048 and image_url ~ '^https://')
  );

drop function public.admin_update_hark_template(text,text,text);

create function public.admin_update_hark_template(
  p_event_type text, p_title_template text, p_body_template text, p_image_url text
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_previous public.notification_hark_templates;
  v_image_url text := nullif(trim(p_image_url),'');
begin
  perform public.require_admin_aal2(array['super_admin']::public.admin_role[]);
  if p_event_type not in (
    'order_created','payment_submission_created','payment_amount_mismatch','payment_approved'
  ) or char_length(trim(p_title_template)) not between 1 and 80
    or char_length(trim(p_body_template)) not between 1 and 2000
    or (v_image_url is not null and (char_length(v_image_url)>2048 or v_image_url !~ '^https://')) then
    raise exception 'invalid_hark_notification_template';
  end if;

  select * into v_previous from public.notification_hark_templates
    where event_type=p_event_type for update;
  if not found then raise exception 'hark_notification_template_not_found'; end if;

  update public.notification_hark_templates set
    title_template=trim(p_title_template),body_template=trim(p_body_template),
    image_url=v_image_url,updated_by=auth.uid(),updated_at=now()
    where event_type=p_event_type;

  insert into public.audit_events(event_type,actor_type,actor_id,previous_value,new_value,metadata)
  values(
    'notification.hark_template_updated','admin',auth.uid(),
    jsonb_build_object(
      'title_template',v_previous.title_template,
      'body_template',v_previous.body_template,
      'image_url',v_previous.image_url
    ),
    jsonb_build_object(
      'title_template',trim(p_title_template),
      'body_template',trim(p_body_template),
      'image_url',v_image_url
    ),
    jsonb_build_object('notification_event_type',p_event_type)
  );
end;
$$;

revoke all on function public.admin_update_hark_template(text,text,text,text) from public, anon;
grant execute on function public.admin_update_hark_template(text,text,text,text) to authenticated;

commit;
