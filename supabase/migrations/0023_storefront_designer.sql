create table public.site_content_entries (
  id uuid primary key default gen_random_uuid(),
  content_key text not null unique check (content_key ~ '^[a-z0-9][a-z0-9-]*$'),
  kind text not null check (kind in ('global','page','template','custom')),
  title text not null,
  slug text unique check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]*$'),
  navigation_label text,
  include_in_navigation boolean not null default false,
  seo jsonb not null default '{}'::jsonb,
  draft_document jsonb not null,
  draft_revision integer not null default 1 check (draft_revision > 0),
  published_version_id uuid,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create table public.site_content_versions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.site_content_entries(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  document jsonb not null,
  seo jsonb not null default '{}'::jsonb,
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now(),
  restored_from_version_id uuid references public.site_content_versions(id),
  unique(entry_id, version_number)
);

alter table public.site_content_entries
  add constraint site_content_published_version_fkey
  foreign key (published_version_id) references public.site_content_versions(id);

create index site_content_active_slug_idx on public.site_content_entries(slug) where deleted_at is null;
create index site_content_versions_entry_idx on public.site_content_versions(entry_id, version_number desc);

alter table public.site_content_entries enable row level security;
alter table public.site_content_versions enable row level security;

create policy "designer admins read entries" on public.site_content_entries for select
  using (public.has_admin_role(array['manager','super_admin']::public.admin_role[]));
create policy "designer admins read versions" on public.site_content_versions for select
  using (public.has_admin_role(array['manager','super_admin']::public.admin_role[]));

create function public.admin_publish_site_content(
  p_entry_id uuid,
  p_actor_id uuid,
  p_restore_version_id uuid default null
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_entry public.site_content_entries;
  v_source public.site_content_versions;
  v_version_id uuid;
  v_version_number integer;
  v_document jsonb;
  v_seo jsonb;
begin
  select * into v_entry from public.site_content_entries
  where id=p_entry_id and deleted_at is null for update;
  if not found then raise exception 'designer_entry_not_found'; end if;

  if p_restore_version_id is not null then
    select * into v_source from public.site_content_versions
    where id=p_restore_version_id and entry_id=p_entry_id;
    if not found then raise exception 'designer_version_not_found'; end if;
    v_document:=v_source.document;
    v_seo:=v_source.seo;
  else
    v_document:=v_entry.draft_document;
    v_seo:=v_entry.seo;
  end if;

  select coalesce(max(version_number),0)+1 into v_version_number
  from public.site_content_versions where entry_id=p_entry_id;
  insert into public.site_content_versions(entry_id,version_number,document,seo,published_by,restored_from_version_id)
  values(p_entry_id,v_version_number,v_document,v_seo,p_actor_id,p_restore_version_id)
  returning id into v_version_id;

  update public.site_content_entries set
    draft_document=case when p_restore_version_id is null then draft_document else v_document end,
    seo=case when p_restore_version_id is null then seo else v_seo end,
    draft_revision=case when p_restore_version_id is null then draft_revision else draft_revision+1 end,
    published_version_id=v_version_id,updated_by=p_actor_id,updated_at=now()
  where id=p_entry_id;
  return v_version_id;
end;
$$;

revoke all on function public.admin_publish_site_content(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_publish_site_content(uuid,uuid,uuid) to service_role;

insert into public.site_content_entries(content_key,kind,title,slug,draft_document)
values
('globals','global','Global elements',null,'{"schemaVersion":1,"kind":"globals","logoText":"VELLE","logoSubtext":"RESEARCH","logoImage":"","logoAlt":"Velle Research","logoHref":"/","banner":{"enabled":true,"text":"DEMONSTRATION STOREFRONT · FICTIONAL RESEARCH MATERIALS · NO REAL ORDERS","href":""},"navigation":[{"id":"20000000-0000-4000-8000-000000000001","label":"Shop","href":"/shop","desktop":true,"mobile":true},{"id":"20000000-0000-4000-8000-000000000002","label":"Testing & quality","href":"/quality","desktop":true,"mobile":true},{"id":"20000000-0000-4000-8000-000000000003","label":"Batch lookup","href":"/batch","desktop":true,"mobile":true},{"id":"20000000-0000-4000-8000-000000000004","label":"Research","href":"/research","desktop":true,"mobile":true},{"id":"20000000-0000-4000-8000-000000000005","label":"Support","href":"/support","desktop":true,"mobile":true}]}'),
('home','page','Home',null,'{"schemaVersion":1,"kind":"page","headerMode":"inherit","bannerMode":"inherit","blocks":[{"id":"10000000-0000-4000-8000-000000000001","type":"locked","visible":true,"component":"legacy_home","label":"Current homepage"}]}'),
('shop','page','Shop','shop','{"schemaVersion":1,"kind":"page","headerMode":"inherit","bannerMode":"inherit","blocks":[{"id":"10000000-0000-4000-8000-000000000002","type":"locked","visible":true,"component":"shop","label":"Product catalog"}]}'),
('quality','page','Quality','quality','{"schemaVersion":1,"kind":"page","headerMode":"inherit","bannerMode":"inherit","blocks":[{"id":"10000000-0000-4000-8000-000000000003","type":"locked","visible":true,"component":"quality","label":"Quality experience"}]}'),
('batch','page','Batch Lookup','batch','{"schemaVersion":1,"kind":"page","headerMode":"inherit","bannerMode":"inherit","blocks":[{"id":"10000000-0000-4000-8000-000000000004","type":"locked","visible":true,"component":"batch","label":"Batch lookup"}]}'),
('research','page','Research','research','{"schemaVersion":1,"kind":"page","headerMode":"inherit","bannerMode":"inherit","blocks":[{"id":"10000000-0000-4000-8000-000000000005","type":"locked","visible":true,"component":"research","label":"Research library"}]}'),
('support','page','Support','support','{"schemaVersion":1,"kind":"page","headerMode":"inherit","bannerMode":"inherit","blocks":[{"id":"10000000-0000-4000-8000-000000000006","type":"locked","visible":true,"component":"support","label":"Support experience"}]}'),
('product-template','template','Product Detail Template',null,'{"schemaVersion":1,"kind":"page","headerMode":"inherit","bannerMode":"inherit","blocks":[{"id":"10000000-0000-4000-8000-000000000007","type":"locked","visible":true,"component":"product","label":"Product detail"}]}'),
('article-template','template','Research Article Template',null,'{"schemaVersion":1,"kind":"page","headerMode":"inherit","bannerMode":"inherit","blocks":[{"id":"10000000-0000-4000-8000-000000000008","type":"locked","visible":true,"component":"article","label":"Research article"}]}'),
('product-finder','page','Product Finder','get-started','{"schemaVersion":1,"kind":"page","headerMode":"inherit","bannerMode":"inherit","blocks":[{"id":"10000000-0000-4000-8000-000000000009","type":"locked","visible":true,"component":"product_finder","label":"Product finder"}]}'),
('cart','page','Cart','cart','{"schemaVersion":1,"kind":"page","headerMode":"inherit","bannerMode":"inherit","blocks":[{"id":"10000000-0000-4000-8000-000000000010","type":"locked","visible":true,"component":"cart","label":"Cart"}]}'),
('checkout','page','Checkout','checkout','{"schemaVersion":1,"kind":"page","headerMode":"inherit","bannerMode":"inherit","blocks":[{"id":"10000000-0000-4000-8000-000000000011","type":"locked","visible":true,"component":"checkout","label":"Checkout"}]}'),
('compare','page','Compare','compare','{"schemaVersion":1,"kind":"page","headerMode":"inherit","bannerMode":"inherit","blocks":[{"id":"10000000-0000-4000-8000-000000000012","type":"locked","visible":true,"component":"compare","label":"Product comparison"}]}'),
('account','page','Account','account','{"schemaVersion":1,"kind":"page","headerMode":"inherit","bannerMode":"inherit","blocks":[{"id":"10000000-0000-4000-8000-000000000013","type":"locked","visible":true,"component":"account","label":"Customer account"}]}');

do $$
declare entry record;
declare version_id uuid;
begin
  for entry in select * from public.site_content_entries loop
    insert into public.site_content_versions(entry_id,version_number,document,published_by)
    values(entry.id,1,entry.draft_document,(select user_id from public.admin_role_assignments where role='super_admin' and is_active limit 1))
    returning id into version_id;
    update public.site_content_entries set published_version_id=version_id where id=entry.id;
  end loop;
exception when not_null_violation then
  -- Fresh projects may not have an administrator yet. Drafts remain seeded and
  -- the application falls back to them until the first explicit publication.
  null;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('site-media','site-media',true,5242880,array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "designer admins upload media" on storage.objects for insert to authenticated
  with check(bucket_id='site-media' and public.has_admin_role(array['manager','super_admin']::public.admin_role[]));
create policy "designer admins update media" on storage.objects for update to authenticated
  using(bucket_id='site-media' and public.has_admin_role(array['manager','super_admin']::public.admin_role[]));
