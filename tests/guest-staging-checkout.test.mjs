import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("guest staging checkout is token protected and service-only", async () => {
  const migration = await readFile(new URL("supabase/migrations/0009_guest_staging_checkout.sql", root), "utf8");
  assert.match(migration, /guest_access_token_hash text unique/);
  assert.match(migration, /guest_access_expires_at timestamptz/);
  assert.match(migration, /revoke all on function public\.create_guest_staging_order/);
  assert.match(migration, /grant execute .* to service_role/);
  assert.match(migration, /on_hand - v_variant\.committed - v_reserved/);
  assert.match(migration, /idempotency_key=p_idempotency_key/);
});

test("staging checkout cannot send funds or arbitrary-recipient email", async () => {
  const [checkout, action, config] = await Promise.all([
    readFile(new URL("components/staging-checkout.tsx", root), "utf8"),
    readFile(new URL("app/checkout/actions.ts", root), "utf8"),
    readFile(new URL("lib/commerce/config.ts", root), "utf8"),
  ]);
  assert.match(checkout, /Do not send funds/);
  assert.match(checkout, /test-only@example\.invalid/);
  assert.match(checkout, /\$TEST-NO-FUNDS/);
  assert.match(action, /commerceConfig\.STAGING_TEST_INBOX/);
  assert.doesNotMatch(action, /to:\s*input\.email/);
  assert.match(config, /STAGING_ORDER_TEST_MODE/);
});

test("guest payment report uses the existing review state machine", async () => {
  const [migration, orderPage] = await Promise.all([
    readFile(new URL("supabase/migrations/0009_guest_staging_checkout.sql", root), "utf8"),
    readFile(new URL("app/orders/[orderNumber]/page.tsx", root), "utf8"),
  ]);
  assert.match(migration, /order_status='payment_review',payment_status='submitted'/);
  assert.match(migration, /payment_submission_created/);
  assert.match(orderPage, /submitGuestPaymentReport/);
  assert.match(orderPage, /all payment details are fictional/);
});
