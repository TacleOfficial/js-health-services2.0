begin;

-- Keep the legacy function name because existing transactional RPCs call it,
-- but authorization is now based only on the signed-in user's admin role.
create or replace function public.require_admin_aal2(allowed public.admin_role[])
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_admin_role(allowed) then
    raise exception 'insufficient_admin_authorization' using errcode = '42501';
  end if;
end;
$$;

drop function if exists public.admin_aal2_is_required();
drop table if exists public.admin_security_settings;

commit;
