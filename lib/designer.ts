import { z } from "zod";

const safeHref = z.string().trim().max(500).refine(
  value => value.startsWith("/") || value.startsWith("#") || /^https:\/\/[^"\s]+$/i.test(value) || /^mailto:[^"\s]+$/i.test(value),
  "Use an internal path, HTTPS URL, anchor, or email link.",
);

const blockBase = {
  id: z.string().uuid(),
  visible: z.boolean().default(true),
};

export const designerBlockSchema = z.discriminatedUnion("type", [
  z.object({ ...blockBase, type: z.literal("hero"), eyebrow: z.string().max(80), title: z.string().min(1).max(160), text: z.string().max(800), primaryLabel: z.string().max(60), primaryHref: safeHref, secondaryLabel: z.string().max(60).default(""), secondaryHref: safeHref.or(z.literal("")).default("") }),
  z.object({ ...blockBase, type: z.literal("rich_text"), eyebrow: z.string().max(80).default(""), title: z.string().max(160).default(""), body: z.string().max(10000) }),
  z.object({ ...blockBase, type: z.literal("image"), src: z.string().trim().min(1).max(1000), alt: z.string().trim().min(1).max(300), caption: z.string().max(300).default("") }),
  z.object({ ...blockBase, type: z.literal("split"), eyebrow: z.string().max(80).default(""), title: z.string().min(1).max(160), text: z.string().max(3000), imageSrc: z.string().max(1000), imageAlt: z.string().min(1).max(300), imageSide: z.enum(["left", "right"]).default("right") }),
  z.object({ ...blockBase, type: z.literal("cta"), title: z.string().min(1).max(160), text: z.string().max(800), label: z.string().min(1).max(60), href: safeHref }),
  z.object({ ...blockBase, type: z.literal("feature_grid"), eyebrow: z.string().max(80).default(""), title: z.string().max(160).default(""), items: z.array(z.object({ id: z.string().uuid(), title: z.string().min(1).max(100), text: z.string().max(500) })).min(1).max(6) }),
  z.object({ ...blockBase, type: z.literal("faq"), eyebrow: z.string().max(80).default(""), title: z.string().max(160).default(""), items: z.array(z.object({ id: z.string().uuid(), question: z.string().min(1).max(240), answer: z.string().min(1).max(2000) })).min(1).max(20) }),
  z.object({ ...blockBase, type: z.literal("spacer"), size: z.enum(["small", "medium", "large"]).default("medium"), divider: z.boolean().default(false) }),
  z.object({ ...blockBase, type: z.literal("product_grid"), eyebrow: z.string().max(80).default(""), title: z.string().max(160).default(""), limit: z.number().int().min(1).max(12).default(4) }),
  z.object({ ...blockBase, type: z.literal("article_grid"), eyebrow: z.string().max(80).default(""), title: z.string().max(160).default(""), limit: z.number().int().min(1).max(12).default(3) }),
  z.object({ ...blockBase, type: z.literal("locked"), component: z.enum(["legacy_home","shop","quality","batch","research","support","product","article","product_finder","cart","checkout","compare","account"]), label: z.string().max(100) }),
]);

export const pageDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("page"),
  headerMode: z.enum(["inherit", "override", "hidden"]).default("inherit"),
  bannerMode: z.enum(["inherit", "override", "hidden"]).default("inherit"),
  headerOverride: z.object({ logoText: z.string().max(80), logoSubtext: z.string().max(80), logoImage: z.string().max(1000).default(""), logoAlt: z.string().max(200).default(""), logoHref: safeHref }).optional(),
  bannerOverride: z.object({ enabled: z.boolean(), text: z.string().max(240), href: safeHref.or(z.literal("")).default("") }).optional(),
  blocks: z.array(designerBlockSchema).max(100).superRefine((blocks, context) => {
    const ids = new Set<string>();
    blocks.forEach((block, index) => {
      if (ids.has(block.id)) context.addIssue({ code: "custom", path: [index, "id"], message: "Block IDs must be unique." });
      ids.add(block.id);
    });
  }),
});

export const navigationItemSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(60),
  href: safeHref,
  desktop: z.boolean().default(true),
  mobile: z.boolean().default(true),
});

export const globalDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("globals"),
  logoText: z.string().trim().min(1).max(80),
  logoSubtext: z.string().max(80),
  logoImage: z.string().max(1000).default(""),
  logoAlt: z.string().max(200).default(""),
  logoHref: safeHref,
  banner: z.object({ enabled: z.boolean(), text: z.string().max(240), href: safeHref.or(z.literal("")).default("") }),
  navigation: z.array(navigationItemSchema).max(20),
});

export type DesignerBlock = z.infer<typeof designerBlockSchema>;
export type PageDocument = z.infer<typeof pageDocumentSchema>;
export type GlobalDocument = z.infer<typeof globalDocumentSchema>;

export const fixedDesignerPages = [
  ["home", "Home", "/"],
  ["shop", "Shop", "/shop"],
  ["quality", "Quality", "/quality"],
  ["batch", "Batch Lookup", "/batch"],
  ["research", "Research", "/research"],
  ["support", "Support", "/support"],
  ["product-template", "Product Detail Template", "/products/:slug"],
  ["article-template", "Research Article Template", "/research/:slug"],
  ["product-finder", "Product Finder", "/get-started"],
  ["cart", "Cart", "/cart"],
  ["checkout", "Checkout", "/checkout"],
  ["compare", "Compare", "/compare"],
  ["account", "Account", "/account"],
] as const;

export const protectedDesignerSlugs = new Set([
  "account","admin","api","auth","batch","cart","checkout","compare","get-started","orders","products","quality","research","shop","support",
]);

const lockedComponentByKey: Record<string, z.infer<typeof designerBlockSchema> & { type: "locked" }> = {
  home: { id: "10000000-0000-4000-8000-000000000001", type: "locked", visible: true, component: "legacy_home", label: "Current homepage" },
  shop: { id: "10000000-0000-4000-8000-000000000002", type: "locked", visible: true, component: "shop", label: "Product catalog" },
  quality: { id: "10000000-0000-4000-8000-000000000003", type: "locked", visible: true, component: "quality", label: "Quality experience" },
  batch: { id: "10000000-0000-4000-8000-000000000004", type: "locked", visible: true, component: "batch", label: "Batch lookup" },
  research: { id: "10000000-0000-4000-8000-000000000005", type: "locked", visible: true, component: "research", label: "Research library" },
  support: { id: "10000000-0000-4000-8000-000000000006", type: "locked", visible: true, component: "support", label: "Support experience" },
  "product-template": { id: "10000000-0000-4000-8000-000000000007", type: "locked", visible: true, component: "product", label: "Product detail" },
  "article-template": { id: "10000000-0000-4000-8000-000000000008", type: "locked", visible: true, component: "article", label: "Research article" },
  "product-finder": { id: "10000000-0000-4000-8000-000000000009", type: "locked", visible: true, component: "product_finder", label: "Product finder" },
  cart: { id: "10000000-0000-4000-8000-000000000010", type: "locked", visible: true, component: "cart", label: "Cart" },
  checkout: { id: "10000000-0000-4000-8000-000000000011", type: "locked", visible: true, component: "checkout", label: "Checkout" },
  compare: { id: "10000000-0000-4000-8000-000000000012", type: "locked", visible: true, component: "compare", label: "Product comparison" },
  account: { id: "10000000-0000-4000-8000-000000000013", type: "locked", visible: true, component: "account", label: "Customer account" },
};

export function defaultPageDocument(key: string): PageDocument {
  return { schemaVersion: 1, kind: "page", headerMode: "inherit", bannerMode: "inherit", blocks: lockedComponentByKey[key] ? [lockedComponentByKey[key]] : [] };
}

export const defaultGlobalDocument: GlobalDocument = {
  schemaVersion: 1,
  kind: "globals",
  logoText: "VELLE",
  logoSubtext: "RESEARCH",
  logoImage: "",
  logoAlt: "Velle Research",
  logoHref: "/",
  banner: { enabled: true, text: "DEMONSTRATION STOREFRONT · FICTIONAL RESEARCH MATERIALS · NO REAL ORDERS", href: "" },
  navigation: [
    { id: "20000000-0000-4000-8000-000000000001", label: "Shop", href: "/shop", desktop: true, mobile: true },
    { id: "20000000-0000-4000-8000-000000000002", label: "Testing & quality", href: "/quality", desktop: true, mobile: true },
    { id: "20000000-0000-4000-8000-000000000003", label: "Batch lookup", href: "/batch", desktop: true, mobile: true },
    { id: "20000000-0000-4000-8000-000000000004", label: "Research", href: "/research", desktop: true, mobile: true },
    { id: "20000000-0000-4000-8000-000000000005", label: "Support", href: "/support", desktop: true, mobile: true },
  ],
};
