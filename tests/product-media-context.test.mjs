import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("product media uploads are immutable, restricted, and signature checked", async () => {
  const [actions, migration, uploader, primitive, nextConfig] = await Promise.all([
    read("app/admin/actions.ts"),
    read("supabase/migrations/0016_product_media_context.sql"),
    read("components/product-media-uploader.tsx"),
    read("components/ui/file-upload.tsx"),
    read("next.config.ts"),
  ]);
  assert.match(actions, /file\.size>5_242_880/);
  assert.match(actions, /file contents do not match its image type/);
  assert.match(actions, /crypto\.randomUUID\(\)/);
  assert.match(actions, /upsert:false/);
  assert.match(migration, /public\.has_admin_role\(array\['manager','super_admin'\]/);
  assert.match(migration, /file_size_limit.*5242880/);
  for (const part of ["FileUploadDropzone", "FileUploadList", "FileUploadItemPreview", "FileUploadItemDelete"]) {
    assert.match(uploader, new RegExp(part));
  }
  assert.match(uploader, /Preview current/);
  assert.match(uploader, /downloadFile/);
  assert.match(uploader, /Dialog\.Content/);
  assert.match(primitive, /onFileValidate/);
  assert.match(primitive, /onFileReject/);
  assert.match(nextConfig, /bodySizeLimit:\s*"6mb"/);
});

test("active products require both accessible images and rich context", async () => {
  const [schema, migration] = await Promise.all([
    read("lib/admin-products.ts"),
    read("supabase/migrations/0016_product_media_context.sql"),
  ]);
  for (const field of ["primaryImagePath", "primaryImageAlt", "contextImagePath", "contextImageAlt", "contextDocument"]) {
    assert.match(schema, new RegExp(field));
  }
  assert.match(schema, /value\.status === "active"/);
  assert.match(migration, /active_product_media_and_context_required/);
  assert.match(migration, /v_previous := to_jsonb\(v_existing\)/);
});

test("product context is allowlisted and public PDP prefers database content", async () => {
  const [context, route, catalog, storefront] = await Promise.all([
    read("lib/product-context.ts"),
    read("app/[...slug]/page.tsx"),
    read("lib/catalog-data.ts"),
    read("components/storefront.tsx"),
  ]);
  assert.doesNotMatch(context, /script|iframe|video/);
  assert.match(context, /Only secure links are allowed/);
  assert.match(context, /product-media/);
  assert.match(catalog, /\.eq\("status","active"\)/);
  assert.match(catalog, /productContextSchema\.safeParse/);
  assert.match(route, /slug\[0\]==="shop"/);
  assert.match(storefront, /ShopPage databaseProducts=\{databaseProducts\}/);
  assert.match(storefront, /const catalog=databaseProducts/);
  assert.doesNotMatch(storefront, /databaseProducts,\.\.\.products\.filter/);
  assert.match(storefront, /ProductContextRenderer/);
  assert.match(storefront, /primaryImageUrl/);
});
