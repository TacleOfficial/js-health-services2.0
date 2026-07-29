-- Draft fixtures only. Public storefront queries must filter for status = 'active'.
insert into public.products(slug,title,description,category,status) values
  ('atlas-10','Atlas 10','Reference peptide standard','Reference standards','draft'),
  ('helix-b7','Helix B7','Sequence-calibrated research material','Peptides','draft'),
  ('nexus-29','Nexus 29','Analytical peptide reference','Reference standards','draft')
on conflict (slug) do nothing;

insert into public.payment_method_configs(method,display_name,destination_name,destination_value,customer_instructions,is_active)
values
  ('zelle','Zelle','STAGING — NOT CONFIGURED','disabled@example.invalid','Use the exact order number as the memo.',false),
  ('cash_app','Cash App','STAGING — NOT CONFIGURED','$disabled','Use the exact order number as the note.',false)
on conflict (method) do nothing;
