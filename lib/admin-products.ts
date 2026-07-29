import { z } from "zod";

const status = z.enum(["draft", "active", "archived"]);
export const adminProductSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens."),
  description: z.string().trim().min(3).max(2000),
  category: z.string().trim().min(2).max(80),
  status,
  variants: z.array(z.object({
    id: z.string().uuid().optional(),
    sku: z.string().trim().min(2).max(80),
    title: z.string().trim().min(1).max(120),
    price: z.coerce.number().min(0).max(1_000_000),
    weightGrams: z.coerce.number().int().min(0).max(1_000_000),
    status,
    onHand: z.coerce.number().int().min(0).max(1_000_000),
    committed: z.coerce.number().int().min(0).default(0),
  })).min(1).max(50),
}).superRefine((value, context) => {
  const skus = new Set<string>();
  value.variants.forEach((variant, index) => {
    const normalized = variant.sku.toLowerCase();
    if (skus.has(normalized)) context.addIssue({ code: "custom", path: ["variants", index, "sku"], message: "SKUs must be unique." });
    skus.add(normalized);
    if (variant.onHand < variant.committed) context.addIssue({ code: "custom", path: ["variants", index, "onHand"], message: "On hand cannot be below committed." });
  });
});

export type AdminProductInput = z.infer<typeof adminProductSchema>;
export type AdminProductActionState = { ok: boolean; message?: string; fieldErrors?: Record<string, string[]> };
