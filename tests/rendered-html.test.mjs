import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the Velle storefront and production metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Velle Research — documented by batch<\/title>/);
  assert.match(html, /Precision begins with verification/);
  assert.match(html, /FICTIONAL RESEARCH MATERIALS/);
  assert.match(html, /twitter:card/);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("renders representative routed experiences", async () => {
  for (const [path, expected] of [
    ["/shop", "Research products, documented by batch"],
    ["/products/atlas-10", "Add to demo cart"],
    ["/batch", "Verify a batch"],
    ["/research", "Documentation, explained with restraint"],
    ["/support", "Clear answers, direct paths"],
    ["/checkout", "Your cart is empty"],
  ]) {
    const response = await render(path);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), new RegExp(expected), path);
  }
});

test("keeps demo content centralized and removes starter artifacts", async () => {
  const [data, storefront, packageJson] = await Promise.all([
    readFile(new URL("../lib/data.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.equal((data.match(/slug:"/g) ?? []).length >= 12, true);
  assert.match(data, /DEMO-ATL-2607/);
  assert.match(storefront, /localStorage/);
  assert.match(storefront, /NOT A REAL COA/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
