import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("commerce mode switch is versioned, super-admin only, confirmed, and reversible only when settled", async () => {
  const sql = await read("supabase/migrations/0010_commerce_runtime_mode.sql");
  assert.match(sql, /create table public\.commerce_runtime_settings/);
  assert.match(sql, /role='super_admin'/);
  assert.match(sql, /p_confirmation <> 'ENABLE PRODUCTION'/);
  assert.match(sql, /v_current\.version <> p_expected_version/);
  assert.match(sql, /production_orders_block_staging/);
  assert.match(sql, /prevent_commerce_mode_change/);
});

test("production checkout isolates staging items and uses audited effective manual tax rates", async () => {
  const action = await read("app/checkout/actions.ts");
  assert.match(action, /staging_item_in_production|Staging catalog items cannot enter a production order/);
  assert.match(action, /manual_tax_rates/);
  assert.match(action, /manual_rate/);
  assert.doesNotMatch(action, /createStripeTaxQuote/);
  assert.match(action, /retrieveShippoRate/);
});

test("labels require verified payment, production mode, an explicit hard gate, and idempotency", async () => {
  const action = await read("app/admin/actions.ts");
  assert.match(action, /SHIPPO_LABEL_PURCHASE_ENABLED/);
  assert.match(action, /order\.commerce_mode !== "production"/);
  assert.match(action, /order\.payment_status !== "verified"/);
  assert.match(action, /idempotency_key/);
});

test("shipping modes isolate Shippo and manual fulfillment", async () => {
  const sql = await read("supabase/migrations/0013_shipping_modes.sql");
  const checkout = await read("app/checkout/actions.ts");
  const admin = await read("app/admin/actions.ts");
  assert.match(sql, /'shippo','manual_free','manual_fixed'/);
  assert.match(sql, /shipping_snapshot_is_immutable/);
  assert.match(sql, /stale_shipping_settings_version/);
  assert.match(checkout, /shippingSettings\.mode === "manual_free" \? 0/);
  assert.match(admin, /order\.shipping_mode !== "shippo"/);
  assert.match(admin, /recordManualShipment/);
  assert.match(admin, /markManualShipmentDelivered/);
});

test("commerce-mode inheritance uses table-specific triggers", async () => {
  const sql = await read("supabase/migrations/0015_fix_commerce_mode_triggers.sql");
  assert.match(sql, /notification_inherit_order_commerce_mode/);
  assert.match(sql, /audit_inherit_order_commerce_mode/);
  assert.match(sql, /payment_inherit_order_commerce_mode/);
  const auditFunction = sql.match(/create function public\.audit_inherit_order_commerce_mode\(\)[\s\S]*?end;\n\$\$;/)?.[0] ?? "";
  assert.doesNotMatch(auditFunction, /aggregate_type/);
});
