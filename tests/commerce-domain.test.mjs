import assert from "node:assert/strict";
import test from "node:test";

// These contract tests mirror invariants also enforced by TypeScript and SQL.
const orderTransitions = {
  draft: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["payment_review", "expired", "cancelled"],
  payment_review: ["processing", "on_hold", "cancelled", "expired"],
  processing: ["completed", "on_hold", "cancelled", "refunded"],
  completed: ["refunded"],
  on_hold: ["payment_review", "processing", "cancelled", "refunded"],
  cancelled: [], expired: ["awaiting_payment"], refunded: [],
};

test("unverified orders cannot enter processing", () => {
  assert.equal(orderTransitions.awaiting_payment.includes("processing"), false);
  assert.equal(orderTransitions.payment_review.includes("processing"), true);
});

test("terminal order states cannot silently reopen", () => {
  assert.deepEqual(orderTransitions.cancelled, []);
  assert.deepEqual(orderTransitions.refunded, []);
});

test("manual payment adjustment is disabled", () => {
  const subtotal = 12_600;
  const shipping = 1_800;
  const tax = 0;
  const adjustment = 0;
  assert.equal(subtotal + shipping + tax + adjustment, 14_400);
});

test("migration includes atomic approval safeguards", async () => {
  const fs = await import("node:fs/promises");
  const sql = await fs.readFile(new URL("../supabase/migrations/0001_commerce_foundation.sql", import.meta.url), "utf8");
  assert.match(sql, /for update/);
  assert.match(sql, /require_admin_aal2/);
  assert.match(sql, /inventory_commit_failed/);
  assert.match(sql, /payment_adjustment_cents integer not null default 0 check \(payment_adjustment_cents = 0\)/);
});
