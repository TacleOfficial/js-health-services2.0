import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  defaultGlobalDocument,
  defaultPageDocument,
  globalDocumentSchema,
  pageDocumentSchema,
  type GlobalDocument,
  type PageDocument,
} from "@/lib/designer";

export type DesignerEntry = {
  id: string;
  contentKey: string;
  kind: "global" | "page" | "template" | "custom";
  title: string;
  slug: string | null;
  navigationLabel: string | null;
  includeInNavigation: boolean;
  seo: Record<string, unknown>;
  draftDocument: GlobalDocument | PageDocument;
  draftRevision: number;
  publishedVersionId: string | null;
  updatedAt: string;
};

function mapEntry(row: Record<string, unknown>): DesignerEntry | null {
  const kind = row.kind as DesignerEntry["kind"];
  const parsed = kind === "global" ? globalDocumentSchema.safeParse(row.draft_document) : pageDocumentSchema.safeParse(row.draft_document);
  if (!parsed.success) return null;
  return {
    id: String(row.id),
    contentKey: String(row.content_key),
    kind,
    title: String(row.title),
    slug: row.slug ? String(row.slug) : null,
    navigationLabel: row.navigation_label ? String(row.navigation_label) : null,
    includeInNavigation: Boolean(row.include_in_navigation),
    seo: (row.seo ?? {}) as Record<string, unknown>,
    draftDocument: parsed.data,
    draftRevision: Number(row.draft_revision),
    publishedVersionId: row.published_version_id ? String(row.published_version_id) : null,
    updatedAt: String(row.updated_at),
  };
}

export async function listDesignerEntries(): Promise<DesignerEntry[]> {
  const db = createSupabaseServiceClient();
  const { data, error } = await db.from("site_content_entries").select("*").is("deleted_at", null).order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map(row => mapEntry(row)).filter((entry): entry is DesignerEntry => Boolean(entry));
}

export async function getDesignerEntry(contentKey: string): Promise<DesignerEntry | null> {
  const db = createSupabaseServiceClient();
  const { data } = await db.from("site_content_entries").select("*").eq("content_key", contentKey).is("deleted_at", null).maybeSingle();
  return data ? mapEntry(data) : null;
}

export async function getDesignerVersions(entryId: string) {
  const db = createSupabaseServiceClient();
  const { data, error } = await db.from("site_content_versions")
    .select("id,version_number,published_at,published_by,restored_from_version_id")
    .eq("entry_id", entryId)
    .order("version_number", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadPublishedDesignerContent(path: string): Promise<{ globals: GlobalDocument; page: PageDocument; custom: boolean; seo: Record<string, unknown> }> {
  const clean = path.replace(/^\/|\/$/g, "");
  const parts = clean.split("/");
  const key = !clean ? "home"
    : parts[0] === "products" ? "product-template"
    : parts[0] === "research" && parts[1] ? "article-template"
    : parts[0];
  const fallbackPage = defaultPageDocument(key);
  try {
    const db = createSupabaseServiceClient();
    const [{ data: entries }, { data: navigationEntries }] = await Promise.all([db.from("site_content_entries")
      .select("content_key,kind,slug,published_version_id,site_content_versions!site_content_published_version_fkey(document,seo)")
      .is("deleted_at", null)
      .or(`content_key.in.(globals,${key}),slug.eq.${clean}`),
    db.from("site_content_entries")
      .select("id,slug,navigation_label,title,published_version_id")
      .eq("kind","custom").eq("include_in_navigation",true).is("deleted_at",null).not("published_version_id","is",null)]);
    const globalsEntry = entries?.find(row => row.content_key === "globals");
    const pageEntry = entries?.find(row => row.content_key === key || row.kind === "custom" && row.slug === clean);
    const versionDocument = (entry: typeof globalsEntry): unknown => {
      const relation = entry?.site_content_versions as unknown;
      if (Array.isArray(relation)) return (relation[0] as { document?: unknown } | undefined)?.document;
      return (relation as { document?: unknown } | null | undefined)?.document;
    };
    const globals = globalDocumentSchema.safeParse(versionDocument(globalsEntry));
    const page = pageDocumentSchema.safeParse(versionDocument(pageEntry));
    const pageRelation = pageEntry?.site_content_versions as unknown;
    const pageVersion = (Array.isArray(pageRelation) ? pageRelation[0] : pageRelation) as { seo?: Record<string, unknown> } | null | undefined;
    const resolvedGlobals = globals.success ? globals.data : defaultGlobalDocument;
    const customNavigation = (navigationEntries ?? []).map(row => ({ id: row.id, label: row.navigation_label || row.title, href: `/${row.slug}`, desktop: true, mobile: true }));
    return {
      globals: { ...resolvedGlobals, navigation: [...resolvedGlobals.navigation, ...customNavigation.filter(item => !resolvedGlobals.navigation.some(existing => existing.href === item.href))] },
      page: page.success ? page.data : fallbackPage,
      custom: pageEntry?.kind === "custom",
      seo: pageVersion?.seo ?? {},
    };
  } catch {
    return { globals: defaultGlobalDocument, page: fallbackPage, custom: false, seo: {} };
  }
}
