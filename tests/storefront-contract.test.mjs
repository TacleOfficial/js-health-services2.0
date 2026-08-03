import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("defines the complete Velle storefront experience", async () => {
  const storefront = await readFile(new URL("components/storefront.tsx", root), "utf8");
  const demoStore = await readFile(new URL("components/demo-store.tsx", root), "utf8");
  for (const text of [
    "Precision begins with verification",
    "From intake to documented release",
    "Compare material intake with documented release",
    "BEFORE / INTAKE",
    "AFTER / DOCUMENTED",
    "Research products, documented by batch",
    "Add to my cart",
    "Verify a batch",
    "Documentation, explained with restraint",
    "Clear answers, direct paths",
    "Checkout",
  ]) {
    assert.match(storefront, new RegExp(text));
  }
  assert.match(demoStore, /localStorage/);
  assert.match(storefront, /NOT A REAL COA/);
});

test("centralizes twelve fictional products and demo records", async () => {
  const data = await readFile(new URL("lib/data.ts", root), "utf8");
  assert.equal((data.match(/slug:"/g) ?? []).length >= 12, true);
  assert.match(data, /DEMO-ATL-2607/);
  assert.match(data, /fictional/i);
});

test("ships required product and social imagery", async () => {
  await Promise.all([
    access(new URL("public/og.png", root)),
    access(new URL("public/velle-system.png", root)),
    access(new URL("public/velle-intake.png", root)),
    access(new URL("public/velle-release.png", root)),
  ]);
});

test("uses the standard Next.js build path for Vercel", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.equal(packageJson.scripts.dev, "next dev");
  assert.equal(packageJson.scripts.build, "next build");
  assert.equal(packageJson.scripts.start, "next start");
  assert.equal(packageJson.dependencies.vinext, undefined);
  await assert.rejects(access(new URL(".openai/hosting.json", root)));
  await assert.rejects(access(new URL("vite.config.ts", root)));
});
