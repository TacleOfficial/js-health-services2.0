import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("admin SMS schema enforces verified opt-in recipients and idempotent channel deliveries", async () => {
  const sql = await read("supabase/migrations/0017_admin_sms_notifications.sql");
  assert.match(sql, /phone_e164 text not null unique check \(phone_e164 ~ '\^\\\+\[1-9\]\[0-9\]\{7,14\}\$'\)/);
  assert.match(sql, /check \(not is_enabled or verified_at is not null\)/);
  assert.match(sql, /unique\(outbox_id, recipient_user_id, channel\)/);
  assert.match(sql, /role=any\(array\['payment_reviewer','manager','super_admin'\]/);
  assert.match(sql, /payment_submission_created','payment_amount_mismatch/);
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /attempt_count < 5/);
  assert.match(sql, /interval '10 minutes'/);
  assert.match(sql, /digest\(p_code\|\|v_challenge\.code_salt,'sha256'\)/);
});

test("SMS worker sends privacy-minimized Brevo alerts with bounded independent retries", async () => {
  const worker = await read("supabase/functions/process-notifications/index.ts");
  assert.match(worker, /ADMIN_SMS_ENABLED/);
  assert.match(worker, /transactionalSMS\/send/);
  assert.match(worker, /Payment submitted for/);
  assert.match(worker, /amount_reported_cents,method/);
  assert.doesNotMatch(worker, /customer_(?:email|phone)|sender_contact|transaction_reference/);
  assert.match(worker, /claim_admin_sms_deliveries/);
  assert.match(worker, /Math\.min\(3_600_000/);
  assert.match(worker, /delivery\.attempt_count < 5/);
});

test("super-admin SMS controls require OTP verification and preserve deep-link sign in", async () => {
  const [actions, page, account, webhook] = await Promise.all([
    read("app/admin/actions.ts"), read("app/admin/page.tsx"),
    read("lib/account.ts"), read("app/api/webhooks/brevo/route.ts"),
  ]);
  assert.match(actions, /requireSuperAdmin\(\)/);
  assert.match(actions, /randomInt\(100000, 1000000\)/);
  assert.match(actions, /admin_confirm_sms_challenge/);
  assert.match(page, /payment_reviewer","manager","super_admin/);
  assert.match(page, /Manager SMS alerts/);
  assert.match(account, /encodeURIComponent\(safeReturnTo\)/);
  assert.match(webhook, /provider_message_id/);
  assert.match(webhook, /timingSafeEqual/);
});
