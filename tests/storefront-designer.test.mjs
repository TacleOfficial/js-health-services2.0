import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("designer persists versioned drafts and restricts publishing to super admins", async () => {
  const [migration, actions] = await Promise.all([
    read("supabase/migrations/0023_storefront_designer.sql"),
    read("app/admin/designer/actions.ts"),
  ]);
  assert.match(migration, /create table public\.site_content_entries/);
  assert.match(migration, /create table public\.site_content_versions/);
  assert.match(migration, /draft_revision integer not null/);
  assert.match(migration, /published_version_id uuid/);
  assert.match(migration, /designer admins read entries/);
  assert.match(actions, /eq\("draft_revision", revision\.data\)/);
  assert.match(actions, /requireDesignerAdmin\(true\)/);
  assert.match(actions, /designer\.published/);
  assert.match(actions, /designer\.rolled_back/);
  assert.match(actions, /designer\.unpublished/);
});

test("designer provides persistent navigation, dnd-kit editing, responsive preview, and locked blocks", async () => {
  const [sidebar, editor, schema, renderer, packageJson] = await Promise.all([
    read("components/admin-sidebar.tsx"),
    read("components/admin-designer-editor.tsx"),
    read("lib/designer.ts"),
    read("components/designer-page-renderer.tsx"),
    read("package.json"),
  ]);
  assert.match(sidebar, /Review queue/);
  assert.match(sidebar, /Designer/);
  assert.match(sidebar, /fixedDesignerPages\.map/);
  assert.match(editor, /DndContext/);
  assert.match(editor, /sortableKeyboardCoordinates/);
  assert.match(editor, /desktop.*tablet.*mobile/s);
  assert.match(editor, /Save draft/);
  assert.match(editor, /Full preview/);
  assert.match(schema, /type: z\.literal\("locked"\)/);
  assert.match(schema, /Block IDs must be unique/);
  assert.match(renderer, /DesignerPageRenderer/);
  assert.match(packageJson, /"@dnd-kit\/sortable"/);
});

test("published storefront content excludes drafts and supports globals, custom pages, and SEO", async () => {
  const [loader, storefront, route, media] = await Promise.all([
    read("lib/designer-data.ts"),
    read("components/storefront.tsx"),
    read("app/[...slug]/page.tsx"),
    read("components/designer-media-uploader.tsx"),
  ]);
  assert.match(loader, /published_version_id/);
  assert.match(loader, /site_content_published_version_fkey/);
  assert.match(loader, /site_content_versions!site_content_published_version_fkey\(document,seo\)/);
  assert.match(storefront, /designerGlobals/);
  assert.match(storefront, /bannerMode === "hidden"/);
  assert.match(storefront, /RoutedDesignerDocument/);
  assert.match(route, /generateMetadata/);
  assert.match(route, /indexable === false/);
  assert.match(media, /uploadDesignerMedia/);
});
