import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("order archiving is reversible, audited, and removes orders from both admin queues", async () => {
  const [migration, actions, page, control] = await Promise.all([
    read("supabase/migrations/0022_order_archiving.sql"),
    read("app/admin/actions.ts"),
    read("app/admin/page.tsx"),
    read("components/admin-order-archive-action.tsx"),
  ]);

  assert.match(migration, /add column archived_at timestamptz/);
  assert.match(migration, /add column archived_by uuid references auth\.users/);
  assert.match(actions, /export async function setAdminOrderArchived/);
  assert.match(actions, /\["manager",\s*"super_admin"\]/);
  assert.match(actions, /order\.archived/);
  assert.match(actions, /order\.restored/);
  assert.match(page, /\.is\("orders\.archived_at",null\)/);
  assert.match(page, /orderListStatus === "archived"/);
  assert.match(control, /No order history will be deleted/);
  assert.match(control, /Restore order/);
  assert.match(control, /size="icon" variant="ghost"/);
  assert.doesNotMatch(control, /MoreHorizontal \/> Actions/);
});
