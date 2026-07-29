import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("account migration protects customer-owned records and defaults Stripe off", async () => {
  const sql = await readFile(new URL("../supabase/migrations/0004_customer_accounts.sql", import.meta.url), "utf8");
  for (const table of ["customer_addresses","saved_products","notification_preferences","customer_notifications","customer_sessions","support_tickets","support_messages","reward_ledger","stripe_payment_methods"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /'stripe_card'.*false/s);
  assert.match(sql, /unique\(order_id, entry_type\)/);
});

test("dedicated account sections and both authentication methods are present", async () => {
  const dashboard = await readFile(new URL("../components/account-dashboard.tsx", import.meta.url), "utf8");
  const auth = await readFile(new URL("../components/auth-form.tsx", import.meta.url), "utf8");
  for (const section of ["orders","saved","rewards","profile","addresses","payments","notifications","security","support"]) {
    assert.match(dashboard, new RegExp(`"${section}"`));
  }
  assert.match(auth, /signInWithPassword/);
  assert.match(auth, /signInWithOtp/);
});

test("Stripe webhook verifies signatures and claims events idempotently", async () => {
  const webhook = await readFile(new URL("../app/api/webhooks/stripe/route.ts", import.meta.url), "utf8");
  assert.match(webhook, /constructEvent\(await request\.text\(\), signature, secret\)/);
  assert.match(webhook, /stripe_webhook_events/);
  assert.match(webhook, /23505/);
});

test("admin dashboard connects live review actions and test fixtures", async () => {
  const page = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  const actions = await readFile(new URL("../app/admin/actions.ts", import.meta.url), "utf8");
  const review = await readFile(new URL("../app/admin/payments/[submissionId]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /payment_submissions/);
  assert.match(page, /inventory_items/);
  assert.match(actions, /approve_payment/);
  assert.match(actions, /reject_payment/);
  assert.match(actions, /COMMERCE_ENABLED/);
  assert.match(review, /Approve verified payment/);
  assert.match(review, /Request more information/);
});
