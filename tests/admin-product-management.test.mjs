import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("product mutations are transactional and require a manager role", async () => {
  const migration = await readFile(new URL("supabase/migrations/0006_admin_product_management.sql", root), "utf8");
  assert.match(migration, /admin_save_product/);
  assert.match(migration, /admin_set_product_archived/);
  assert.match(migration, /require_admin_aal2\(array\['manager','super_admin'\]/);
  assert.match(migration, /jsonb_array_elements\(p_variants\)/);
  assert.match(migration, /insert into public\.inventory_items/);
  assert.match(migration, /insert into public\.audit_events/);
});

test("referenced variants are archived instead of deleted", async () => {
  const migration = await readFile(new URL("supabase/migrations/0006_admin_product_management.sql", root), "utf8");
  assert.match(migration, /exists\(select 1 from public\.order_items where variant_id=v_removed\)/);
  assert.match(migration, /exists\(select 1 from public\.inventory_reservations where variant_id=v_removed\)/);
  assert.match(migration, /update public\.product_variants set status='archived'/);
  assert.match(migration, /delete from public\.product_variants where id=v_removed/);
});

test("inventory UI exposes add, edit, status filters, and confirmed archival", async () => {
  const [page, actions, editor] = await Promise.all([
    readFile(new URL("app/admin/page.tsx", root), "utf8"),
    readFile(new URL("components/admin-inventory-actions.tsx", root), "utf8"),
    readFile(new URL("components/admin-product-editor.tsx", root), "utf8"),
  ]);
  assert.match(page, /Add product/);
  assert.match(page, /AdminInventoryActions/);
  assert.match(page, /inventoryStatus/);
  assert.match(actions, /DropdownMenu/);
  assert.match(actions, /AlertDialog/);
  assert.match(actions, /Archive product/);
  assert.match(editor, /Add variant/);
  assert.match(editor, /Committed/);
});

test("product validation enforces variant and inventory invariants", async () => {
  const schema = await readFile(new URL("lib/admin-products.ts", root), "utf8");
  assert.match(schema, /\.min\(1\)\.max\(50\)/);
  assert.match(schema, /SKUs must be unique/);
  assert.match(schema, /On hand cannot be below committed/);
  assert.match(schema, /price: z\.coerce\.number\(\)\.min\(0\)/);
});

test("admin authorization no longer requires an assurance level", async () => {
  const migration = await readFile(new URL("supabase/migrations/0007_remove_admin_aal2.sql", root), "utf8");
  assert.match(migration, /not public\.has_admin_role\(allowed\)/);
  assert.doesNotMatch(migration, /auth\.jwt\(\)->>'aal'/);
});
