import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("existing verified MFA factors are challenged instead of enrolled again", async () => {
  const panel = await readFile(new URL("components/admin-mfa-panel.tsx", root), "utf8");
  assert.match(panel, /nextLevel === "aal2"/);
  assert.match(panel, /mfa\.listFactors\(\)/);
  assert.match(panel, /factor\.status === "verified"/);
  assert.match(panel, /challengeAndVerify/);
  assert.match(panel, /Verify existing authenticator/);
});

test("stale same-name enrollment is cleaned before creating a replacement", async () => {
  const panel = await readFile(new URL("components/admin-mfa-panel.tsx", root), "utf8");
  assert.match(panel, /friendly_name === "Velle Admin"/);
  assert.match(panel, /mfa\.unenroll/);
  assert.match(panel, /mfa\.enroll\(\{ factorType: "totp", friendlyName: "Velle Admin" \}\)/);
});
