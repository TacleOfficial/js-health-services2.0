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
  assert.match(worker, /notification_hark_templates/);
  assert.match(worker, /applyHarkTemplate/);
  assert.match(worker, /`\/admin\/orders\/\$\{orderId\}`/);
  assert.match(worker, /\{ imageUrl: harkContent\.imageUrl \}/);
});

test("order notifications deep-link to a protected admin order detail", async () => {
  const [page, list] = await Promise.all([
    read("app/admin/orders/[orderId]/page.tsx"),
    read("app/admin/page.tsx"),
  ]);
  assert.match(page, /requireAdmin\(route\)/);
  assert.match(page, /order_items\(\*\)/);
  assert.match(page, /payment_submissions/);
  assert.match(list, /`\/admin\/orders\/\$\{order\.id\}`/);
});

test("order creation and payment approval wake the independent notification worker", async () => {
  const [checkout, actions, trigger] = await Promise.all([
    read("app/checkout/actions.ts"),
    read("app/admin/actions.ts"),
    read("lib/notifications.ts"),
  ]);
  assert.match(checkout, /if \(error \|\| !order\)[\s\S]*await processNotificationsBestEffort\(\)/);
  assert.match(actions, /approve_payment[\s\S]*await processNotificationsBestEffort\(\)/);
  assert.doesNotMatch(trigger, /ADMIN_SMS_ENABLED|ADMIN_HARK_ENABLED/);
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
  assert.match(actions, /sendNotificationRouteTest/);
  assert.match(actions, /No verified and enabled SMS reviewers are available/);
  assert.match(actions, /velle-test-\$\{crypto\.randomUUID\(\)\}/);
  assert.match(actions, /notification\.test_sent/);
  assert.match(actions, /saveHarkNotificationTemplate/);
  assert.match(actions, /admin_update_hark_template/);
  assert.match(component, /channel="sms"/);
  assert.match(component, /channel="hark"/);
  assert.match(component, /role="switch"/);
  assert.match(component, /Send SMS test/);
  assert.match(component, /Send Hark test/);
  assert.match(component, /Edit Hark notification/);
  assert.match(component, /Available placeholders/);
  assert.match(component, /name="image_url"/);
});

test("Hark templates are constrained, audited, and super-admin managed", async () => {
  const sql = await read("supabase/migrations/0019_hark_notification_templates.sql");
  assert.match(sql, /create table public\.notification_hark_templates/);
  assert.match(sql, /char_length\(trim\(title_template\)\) between 1 and 80/);
  assert.match(sql, /char_length\(trim\(body_template\)\) between 1 and 2000/);
  assert.match(sql, /require_admin_aal2\(array\['super_admin'\]/);
  assert.match(sql, /notification\.hark_template_updated/);
  assert.match(sql, /grant execute on function public\.admin_update_hark_template\(text,text,text\) to authenticated/);
});

test("optional Hark template images are HTTPS constrained and provider-ready", async () => {
  const [sql, actions] = await Promise.all([
    read("supabase/migrations/0020_hark_template_image_url.sql"),
    read("app/admin/actions.ts"),
  ]);
  assert.match(sql, /add column image_url text/);
  assert.match(sql, /image_url ~ '\^https:\/\//);
  assert.match(sql, /admin_update_hark_template\(text,text,text,text\)/);
  assert.match(actions, /Image URLs must use HTTPS/);
  assert.match(actions, /\{ imageUrl: template\.image_url \}/);
  assert.match(actions, /uploadHarkNotificationImage/);
  assert.match(actions, /`notifications\/\$\{eventType\}\/\$\{crypto\.randomUUID\(\)\}/);
});

test("delivery claim functions qualify columns that conflict with table return names", async () => {
  const sql = await read("supabase/migrations/0021_fix_notification_claim_ambiguity.sql");
  assert.match(sql, /d\.attempt_count < 5/);
  assert.match(sql, /d\.attempt_count >= 5/);
  assert.doesNotMatch(sql, /and attempt_count (?:<|>=) 5/);
  assert.match(sql, /grant execute on function public\.claim_admin_hark_deliveries\(integer\) to service_role/);
});
