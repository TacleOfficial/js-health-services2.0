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

test("production checkout isolates staging items and limits tax fallback to technical failures", async () => {
  const action = await read("app/checkout/actions.ts");
  const tax = await read("lib/providers/stripe-tax.ts");
  assert.match(action, /staging_item_in_production|Staging catalog items cannot enter a production order/);
  assert.match(action, /error instanceof StripeTaxError/);
  assert.match(action, /!error\.technical/);
  assert.match(tax, /response\.status >= 500 \|\| response\.status === 429/);
  assert.match(action, /retrieveShippoRate/);
});

test("labels require verified payment, production mode, an explicit hard gate, and idempotency", async () => {
  const action = await read("app/admin/actions.ts");
  assert.match(action, /SHIPPO_LABEL_PURCHASE_ENABLED/);
  assert.match(action, /order\.commerce_mode !== "production"/);
  assert.match(action, /order\.payment_status !== "verified"/);
  assert.match(action, /idempotency_key/);
});
