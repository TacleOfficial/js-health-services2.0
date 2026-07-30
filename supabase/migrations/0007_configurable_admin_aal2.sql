begin;

create table public.admin_security_settings (
  singleton boolean primary key default true check (singleton),
  require_aal2 boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.admin_security_settings(singleton, require_aal2)
values (true, false)
on conflict (singleton) do nothing;

alter table public.admin_security_settings enable row level security;

create or replace function public.admin_aal2_is_required()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select require_aal2 from public.admin_security_settings where singleton = true),
    true
  );
$$;

create or replace function public.require_admin_aal2(allowed public.admin_role[])
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null
     or not public.has_admin_role(allowed)
     or (
       public.admin_aal2_is_required()
       and coalesce(auth.jwt()->>'aal','aal1') <> 'aal2'
     ) then
    raise exception 'insufficient_admin_authorization' using errcode = '42501';
  end if;
end;
$$;

revoke all on table public.admin_security_settings from public, anon, authenticated;
revoke all on function public.admin_aal2_is_required() from public;
grant execute on function public.admin_aal2_is_required() to authenticated;

commit;
