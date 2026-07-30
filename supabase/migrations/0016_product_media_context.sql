begin;

alter table public.products
  add column primary_image_path text,
  add column primary_image_alt text,
  add column context_document jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  add column context_image_path text,
  add column context_image_alt text,
  add column media_revision integer not null default 0 check (media_revision >= 0);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-media','product-media',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;

create policy "managers upload product media" on storage.objects for insert to authenticated
  with check(bucket_id='product-media' and public.has_admin_role(array['manager','super_admin']::public.admin_role[]));

create or replace function public.admin_save_product(
  p_product_id uuid,
  p_product jsonb,
  p_variants jsonb
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_product_id uuid; v_variant jsonb; v_variant_id uuid; v_existing public.products;
  v_previous jsonb; v_keep_ids uuid[] := '{}'; v_removed uuid; v_context jsonb;
begin
  perform public.require_admin_aal2(array['manager','super_admin']::public.admin_role[]);
  if jsonb_typeof(p_variants)<>'array' or jsonb_array_length(p_variants)<1 then raise exception 'at_least_one_variant_required'; end if;
  v_context := coalesce(p_product->'context_document','{"type":"doc","content":[]}'::jsonb);
  if jsonb_typeof(v_context)<>'object' or v_context->>'type'<>'doc' or jsonb_typeof(v_context->'content')<>'array' then
    raise exception 'invalid_product_context';
  end if;
  if p_product->>'status'='active' and (
    coalesce(p_product->>'primary_image_path','')='' or coalesce(p_product->>'primary_image_alt','')=''
    or coalesce(p_product->>'context_image_path','')='' or coalesce(p_product->>'context_image_alt','')=''
    or jsonb_array_length(v_context->'content')=0
  ) then raise exception 'active_product_media_and_context_required'; end if;

  if p_product_id is null then
    insert into public.products(slug,title,description,category,status,research_use_only,
      primary_image_path,primary_image_alt,context_document,context_image_path,context_image_alt,media_revision)
    values(p_product->>'slug',p_product->>'title',p_product->>'description',p_product->>'category',p_product->>'status',true,
      nullif(p_product->>'primary_image_path',''),nullif(p_product->>'primary_image_alt',''),v_context,
      nullif(p_product->>'context_image_path',''),nullif(p_product->>'context_image_alt',''),
      case when coalesce(p_product->>'primary_image_path','')<>'' or coalesce(p_product->>'context_image_path','')<>'' then 1 else 0 end)
    returning id into v_product_id;
    v_previous := null;
  else
    select * into v_existing from public.products where id=p_product_id for update;
    if not found then raise exception 'product_not_found'; end if;
    v_previous := to_jsonb(v_existing);
    update public.products set slug=p_product->>'slug',title=p_product->>'title',description=p_product->>'description',
      category=p_product->>'category',status=p_product->>'status',
      primary_image_path=nullif(p_product->>'primary_image_path',''),primary_image_alt=nullif(p_product->>'primary_image_alt',''),
      context_document=v_context,context_image_path=nullif(p_product->>'context_image_path',''),
      context_image_alt=nullif(p_product->>'context_image_alt',''),
      media_revision=media_revision+case when
        primary_image_path is distinct from nullif(p_product->>'primary_image_path','')
        or context_image_path is distinct from nullif(p_product->>'context_image_path','') then 1 else 0 end,
      updated_at=now()
    where id=p_product_id;
    v_product_id := p_product_id;
  end if;

  for v_variant in select value from jsonb_array_elements(p_variants) loop
    v_variant_id := nullif(v_variant->>'id','')::uuid;
    if v_variant_id is null then
      insert into public.product_variants(product_id,sku,title,price_cents,weight_grams,status)
      values(v_product_id,v_variant->>'sku',v_variant->>'title',(v_variant->>'price_cents')::integer,
        (v_variant->>'weight_grams')::integer,v_variant->>'status') returning id into v_variant_id;
      insert into public.inventory_items(variant_id,on_hand,committed) values(v_variant_id,(v_variant->>'on_hand')::integer,0);
    else
      if not exists(select 1 from public.product_variants where id=v_variant_id and product_id=v_product_id) then raise exception 'variant_not_found'; end if;
      if (v_variant->>'on_hand')::integer<coalesce((select committed from public.inventory_items where variant_id=v_variant_id),0) then raise exception 'on_hand_below_committed'; end if;
      update public.product_variants set sku=v_variant->>'sku',title=v_variant->>'title',
        price_cents=(v_variant->>'price_cents')::integer,weight_grams=(v_variant->>'weight_grams')::integer,status=v_variant->>'status'
      where id=v_variant_id;
      insert into public.inventory_items(variant_id,on_hand,committed,updated_at)
      values(v_variant_id,(v_variant->>'on_hand')::integer,0,now())
      on conflict(variant_id) do update set on_hand=excluded.on_hand,updated_at=now();
    end if;
    v_keep_ids:=array_append(v_keep_ids,v_variant_id);
  end loop;
  for v_removed in select id from public.product_variants where product_id=v_product_id and not(id=any(v_keep_ids)) loop
    if exists(select 1 from public.order_items where variant_id=v_removed)
      or exists(select 1 from public.inventory_reservations where variant_id=v_removed)
    then update public.product_variants set status='archived' where id=v_removed;
    else delete from public.product_variants where id=v_removed; end if;
  end loop;
  insert into public.audit_events(event_type,actor_type,actor_id,previous_value,new_value,metadata)
  values(case when p_product_id is null then 'product_created' else 'product_updated' end,'admin',auth.uid(),v_previous,
    (select to_jsonb(p) from public.products p where p.id=v_product_id),jsonb_build_object('product_id',v_product_id));
  return v_product_id;
end;
$$;

commit;
