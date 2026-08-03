"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/account";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { globalDocumentSchema, pageDocumentSchema, protectedDesignerSlugs } from "@/lib/designer";

export type DesignerActionState = { ok: boolean; message: string; revision?: number };
export type DesignerMediaState = { ok: boolean; message: string; url?: string };
const fail = (message: string): DesignerActionState => ({ ok: false, message });

async function requireDesignerAdmin(superAdmin = false) {
  const { supabase, user } = await requireAdmin();
  const allowed = superAdmin ? ["super_admin"] : ["manager", "super_admin"];
  const { data } = await supabase.rpc("has_admin_role", { allowed });
  if (!data) throw new Error(superAdmin ? "Super-admin authorization is required." : "Manager authorization is required.");
  return user;
}

const seoSchema = z.object({
  title: z.string().trim().max(70).default(""),
  description: z.string().trim().max(180).default(""),
  socialImage: z.string().trim().max(1000).default(""),
  indexable: z.boolean().default(true),
});

export async function saveDesignerDraft(_previous: DesignerActionState, formData: FormData): Promise<DesignerActionState> {
  const user = await requireDesignerAdmin();
  const entryId = z.string().uuid().safeParse(formData.get("entry_id"));
  const revision = z.coerce.number().int().positive().safeParse(formData.get("revision"));
  if (!entryId.success || !revision.success) return fail("The draft identity is invalid.");
  let raw: unknown;
  try { raw = JSON.parse(String(formData.get("document") ?? "")); } catch { return fail("The draft document is not valid JSON."); }
  const kind = String(formData.get("kind"));
  const parsed = kind === "global" ? globalDocumentSchema.safeParse(raw) : pageDocumentSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Review the page content.");
  const seoRaw = (() => { try { return JSON.parse(String(formData.get("seo") ?? "{}")); } catch { return {}; } })();
  const seo = seoSchema.safeParse(seoRaw);
  if (!seo.success) return fail("Review the SEO settings.");

  const db = createSupabaseServiceClient();
  const { data, error } = await db.from("site_content_entries").update({
    draft_document: parsed.data,
    seo: seo.data,
    draft_revision: revision.data + 1,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }).eq("id", entryId.data).eq("draft_revision", revision.data).is("deleted_at", null).select("draft_revision").maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("This draft changed in another session. Refresh before saving again.");
  await db.from("audit_events").insert({ event_type: "designer.draft_saved", actor_type: "admin", actor_id: user.id, metadata: { entry_id: entryId.data, revision: data.draft_revision } });
  return { ok: true, message: "Draft saved.", revision: data.draft_revision };
}

export async function publishDesignerEntry(_previous: DesignerActionState, formData: FormData): Promise<DesignerActionState> {
  try {
    const user = await requireDesignerAdmin(true);
    const entryId = z.string().uuid().parse(formData.get("entry_id"));
    const db = createSupabaseServiceClient();
    const { data: entry, error } = await db.from("site_content_entries").select("*").eq("id", entryId).is("deleted_at", null).single();
    if (error || !entry) return fail(error?.message ?? "Designer entry not found.");
    const schema = entry.kind === "global" ? globalDocumentSchema : pageDocumentSchema;
    const parsed = schema.safeParse(entry.draft_document);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "The draft is not ready to publish.");
    const { data: versionId, error: publishError } = await db.rpc("admin_publish_site_content", {
      p_entry_id: entry.id, p_actor_id: user.id, p_restore_version_id: null,
    });
    if (publishError) return fail(publishError.message);
    await db.from("audit_events").insert({ event_type: "designer.published", actor_type: "admin", actor_id: user.id, metadata: { entry_id: entry.id, version_id: versionId } });
    revalidatePath("/", "layout");
    revalidatePath("/admin/designer");
    return { ok: true, message: "Published successfully." };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Publishing failed. Please try again.");
  }
}

export async function rollbackDesignerEntry(formData: FormData) {
  const user = await requireDesignerAdmin(true);
  const entryId = z.string().uuid().parse(formData.get("entry_id"));
  const versionId = z.string().uuid().parse(formData.get("version_id"));
  const db = createSupabaseServiceClient();
  const { data: source } = await db.from("site_content_versions").select("id").eq("id", versionId).eq("entry_id", entryId).single();
  if (!source) throw new Error("Version not found.");
  const { data: restoredId, error } = await db.rpc("admin_publish_site_content", {
    p_entry_id: entryId, p_actor_id: user.id, p_restore_version_id: source.id,
  });
  if (error) throw new Error(error.message);
  await db.from("audit_events").insert({ event_type: "designer.rolled_back", actor_type: "admin", actor_id: user.id, metadata: { entry_id: entryId, source_version_id: versionId, version_id: restoredId } });
  revalidatePath("/", "layout");
  revalidatePath("/admin/designer");
}

export async function unpublishDesignerEntry(formData: FormData) {
  const user = await requireDesignerAdmin(true);
  const entryId = z.string().uuid().parse(formData.get("entry_id"));
  const db = createSupabaseServiceClient();
  const { data, error } = await db.from("site_content_entries").update({
    published_version_id: null, updated_by: user.id, updated_at: new Date().toISOString(),
  }).eq("id", entryId).is("deleted_at", null).select("content_key").single();
  if (error || !data) throw new Error(error?.message ?? "Designer entry not found.");
  await db.from("audit_events").insert({ event_type: "designer.unpublished", actor_type: "admin", actor_id: user.id, metadata: { entry_id: entryId } });
  revalidatePath("/", "layout");
  revalidatePath("/admin/designer");
}

export async function createCustomDesignerPage(formData: FormData) {
  const user = await requireDesignerAdmin();
  const title = z.string().trim().min(1).max(100).parse(formData.get("title"));
  const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]*$/).parse(formData.get("slug"));
  if (protectedDesignerSlugs.has(slug)) throw new Error("That URL is reserved by the storefront.");
  const db = createSupabaseServiceClient();
  const document = { schemaVersion: 1, kind: "page", headerMode: "inherit", bannerMode: "inherit", blocks: [] };
  const { data, error } = await db.from("site_content_entries").insert({
    content_key: `custom-${crypto.randomUUID()}`, kind: "custom", title, slug, navigation_label: title,
    include_in_navigation: formData.get("include_in_navigation") === "true", draft_document: document,
    created_by: user.id, updated_by: user.id,
  }).select("content_key,id").single();
  if (error) throw new Error(error.message.includes("duplicate") ? "That page URL is already in use." : error.message);
  await db.from("audit_events").insert({ event_type: "designer.page_created", actor_type: "admin", actor_id: user.id, metadata: { entry_id: data.id, slug } });
  redirect(`/admin/designer/${data.content_key}`);
}

export async function deleteCustomDesignerPage(formData: FormData) {
  const user = await requireDesignerAdmin(true);
  const entryId = z.string().uuid().parse(formData.get("entry_id"));
  const db = createSupabaseServiceClient();
  const { data } = await db.from("site_content_entries").update({ deleted_at: new Date().toISOString(), deleted_by: user.id, published_version_id: null }).eq("id", entryId).eq("kind", "custom").select("slug").single();
  if (!data) throw new Error("Custom page not found.");
  await db.from("audit_events").insert({ event_type: "designer.page_deleted", actor_type: "admin", actor_id: user.id, metadata: { entry_id: entryId, slug: data.slug } });
  revalidatePath("/", "layout");
  redirect("/admin/designer");
}

export async function uploadDesignerMedia(_previous: DesignerMediaState, formData: FormData): Promise<DesignerMediaState> {
  const user = await requireDesignerAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Choose an image." };
  if (file.size > 5_242_880) return { ok: false, message: "Images must be 5 MB or smaller." };
  const types: Record<string, { ext: string; signatures: number[][] }> = {
    "image/jpeg": { ext: "jpg", signatures: [[0xff,0xd8,0xff]] },
    "image/png": { ext: "png", signatures: [[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]] },
    "image/webp": { ext: "webp", signatures: [[0x52,0x49,0x46,0x46]] },
  };
  const spec = types[file.type];
  if (!spec) return { ok: false, message: "Use a JPG, PNG, or WebP image." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signatureOk = spec.signatures.some(signature => signature.every((byte,index) => bytes[index] === byte))
    && (file.type !== "image/webp" || String.fromCharCode(...bytes.slice(8,12)) === "WEBP");
  if (!signatureOk) return { ok: false, message: "The file contents do not match its image type." };
  const path = `designer/${user.id}/${crypto.randomUUID()}.${spec.ext}`;
  const db = createSupabaseServiceClient();
  const { error } = await db.storage.from("site-media").upload(path, bytes, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (error) return { ok: false, message: error.message };
  const url = db.storage.from("site-media").getPublicUrl(path).data.publicUrl;
  await db.from("audit_events").insert({ event_type: "designer.media_uploaded", actor_type: "admin", actor_id: user.id, metadata: { path, content_type: file.type, size: file.size } });
  return { ok: true, message: "Image uploaded.", url };
}
