begin;

create or replace function public.admin_save_product(
  p_product_id uuid,
  p_product jsonb,
  p_variants jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_variant jsonb;
  v_variant_id uuid;
  v_existing public.products;
  v_previous jsonb;
  v_keep_ids uuid[] := '{}';
  v_removed uuid;
begin
  perform public.require_admin_aal2(array['manager','super_admin']::public.admin_role[]);
  if jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) < 1 then
    raise exception 'at_least_one_variant_required' using errcode = '22023';
  end if;

  if p_product_id is null then
    insert into public.products(slug,title,description,category,status,research_use_only)
    values(
      p_product->>'slug',p_product->>'title',p_product->>'description',
      p_product->>'category',p_product->>'status',true
    ) returning id into v_product_id;
    v_previous := null;
  else
    select * into v_existing from public.products where id=p_product_id for update;
    if not found then raise exception 'product_not_found'; end if;
    v_previous := to_jsonb(v_existing);
    update public.products set
      slug=p_product->>'slug', title=p_product->>'title',
      description=p_product->>'description', category=p_product->>'category',
      status=p_product->>'status', updated_at=now()
    where id=p_product_id;
    v_product_id := p_product_id;
  end if;

  for v_variant in select value from jsonb_array_elements(p_variants)
  loop
    v_variant_id := nullif(v_variant->>'id','')::uuid;
    if v_variant_id is null then
      insert into public.product_variants(product_id,sku,title,price_cents,weight_grams,status)
      values(
        v_product_id,v_variant->>'sku',v_variant->>'title',
        (v_variant->>'price_cents')::integer,(v_variant->>'weight_grams')::integer,
        v_variant->>'status'
      ) returning id into v_variant_id;
      insert into public.inventory_items(variant_id,on_hand,committed)
      values(v_variant_id,(v_variant->>'on_hand')::integer,0);
    else
      if not exists(select 1 from public.product_variants where id=v_variant_id and product_id=v_product_id) then
        raise exception 'variant_not_found';
      end if;
      if (v_variant->>'on_hand')::integer < coalesce((select committed from public.inventory_items where variant_id=v_variant_id),0) then
        raise exception 'on_hand_below_committed' using errcode = '23514';
      end if;
      update public.product_variants set
        sku=v_variant->>'sku',title=v_variant->>'title',
        price_cents=(v_variant->>'price_cents')::integer,
        weight_grams=(v_variant->>'weight_grams')::integer,
        status=v_variant->>'status'
      where id=v_variant_id;
      insert into public.inventory_items(variant_id,on_hand,committed,updated_at)
      values(v_variant_id,(v_variant->>'on_hand')::integer,0,now())
      on conflict(variant_id) do update set on_hand=excluded.on_hand,updated_at=now();
    end if;
    v_keep_ids := array_append(v_keep_ids,v_variant_id);
  end loop;

  for v_removed in
    select id from public.product_variants
    where product_id=v_product_id and not(id=any(v_keep_ids))
  loop
    if exists(select 1 from public.order_items where variant_id=v_removed)
       or exists(select 1 from public.inventory_reservations where variant_id=v_removed) then
      update public.product_variants set status='archived' where id=v_removed;
    else
      delete from public.product_variants where id=v_removed;
    end if;
  end loop;

  insert into public.audit_events(event_type,actor_type,actor_id,previous_value,new_value,metadata)
  values(
    case when p_product_id is null then 'product_created' else 'product_updated' end,
    'admin',auth.uid(),v_previous,
    (select to_jsonb(p) from public.products p where p.id=v_product_id),
    jsonb_build_object('product_id',v_product_id)
  );
  return v_product_id;
end;
$$;

create or replace function public.admin_set_product_archived(
  p_product_id uuid,
  p_archived boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_previous public.products;
begin
  perform public.require_admin_aal2(array['manager','super_admin']::public.admin_role[]);
  select * into v_previous from public.products where id=p_product_id for update;
  if not found then raise exception 'product_not_found'; end if;
  update public.products
    set status=case when p_archived then 'archived' else 'draft' end,updated_at=now()
    where id=p_product_id;
  update public.product_variants
    set status=case when p_archived then 'archived' else 'draft' end
    where product_id=p_product_id;
  insert into public.audit_events(event_type,actor_type,actor_id,previous_value,new_value,metadata)
  values(
    case when p_archived then 'product_archived' else 'product_restored' end,
    'admin',auth.uid(),to_jsonb(v_previous),
    (select to_jsonb(p) from public.products p where p.id=p_product_id),
    jsonb_build_object('product_id',p_product_id)
  );
end;
$$;

revoke all on function public.admin_save_product(uuid,jsonb,jsonb) from public;
revoke all on function public.admin_set_product_archived(uuid,boolean) from public;
grant execute on function public.admin_save_product(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.admin_set_product_archived(uuid,boolean) to authenticated;

commit;
