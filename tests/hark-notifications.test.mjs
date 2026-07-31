import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("notification routing is audited, prospective, and seeded with preserved SMS defaults", async () => {
  const sql = await read("supabase/migrations/0018_hark_notification_routing.sql");
  for (const event of ["order_created","payment_submission_created","payment_amount_mismatch","payment_approved"]) {
    assert.match(sql, new RegExp(event));
  }
  assert.match(sql, /primary key \(event_type, channel\)/);
  assert.match(sql, /\('payment_submission_created','sms',true\)/);
  assert.match(sql, /\('payment_amount_mismatch','sms',true\)/);
  assert.match(sql, /\('order_created','hark',false\)/);
  assert.match(sql, /notification\.routing_updated/);
  assert.match(sql, /require_admin_aal2\(array\['super_admin'\]/);
  assert.match(sql, /set hark_fanned_out_at=now\(\)/);
  assert.match(sql, /notification_deliveries_hark_event_idx/);
  assert.match(sql, /channel='hark' and recipient_user_id is null/);
  assert.match(sql, /drop function public\.claim_admin_sms_deliveries\(integer\)/);
  assert.match(sql, /grant execute on function public\.claim_admin_sms_deliveries\(integer\) to service_role/);
});

test("worker sends privacy-minimized one-shot Hark notifications independently", async () => {
  const worker = await read("supabase/functions/process-notifications/index.ts");
  assert.match(worker, /ADMIN_HARK_ENABLED/);
  assert.match(worker, /HARK_WEBHOOK_URL/);
  assert.match(worker, /Idempotency-Key/);
  assert.match(worker, /velle-\$\{delivery\.outbox_id\}/);
  assert.match(worker, /response\.status !== 200 && response\.status !== 202/);
  assert.match(worker, /no_registered_device/);
  assert.match(worker, /retry-after/);
  assert.match(worker, /payment_amount_mismatch/);
  assert.match(worker, /order_created/);
  assert.doesNotMatch(worker, /customer_(?:email|phone)|sender_contact|transaction_reference|internal_admin_note/);
  assert.match(worker, /const sms: ChannelStats/);
  assert.match(worker, /const hark: ChannelStats/);
});

test("super-admin UI itemizes independent SMS and Hark event switches", async () => {
  const [page, actions, component] = await Promise.all([
    read("app/admin/page.tsx"),
    read("app/admin/actions.ts"),
    read("components/admin-notification-routing.tsx"),
  ]);
  assert.match(page, /Notification routing/);
  assert.match(page, /New order/);
  assert.match(page, /Payment amount mismatch/);
  assert.match(page, /ADMIN_HARK_ENABLED/);
  assert.match(actions, /admin_set_notification_route/);
  assert.match(actions, /requireSuperAdmin\(\)/);
  assert.match(component, /channel="sms"/);
  assert.match(component, /channel="hark"/);
  assert.match(component, /role="switch"/);
});
