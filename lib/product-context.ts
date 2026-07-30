import { z } from "zod";

const safeUrl = z.string().url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:";
}, "Only secure links are allowed.");

const contextNode: z.ZodType<any> = z.lazy(() => z.object({
  type: z.enum([
    "doc","paragraph","text","heading","bulletList","orderedList","listItem",
    "blockquote","hardBreak","image","table","tableRow","tableHeader","tableCell",
  ]),
  attrs: z.record(z.string(), z.unknown()).optional(),
  marks: z.array(z.object({
    type: z.enum(["bold","italic","link"]),
    attrs: z.record(z.string(), z.unknown()).optional(),
  }).superRefine((mark, ctx) => {
    if (mark.type === "link" && !safeUrl.safeParse(mark.attrs?.href).success) ctx.addIssue({ code:"custom",message:"Unsafe link URL." });
  })).optional(),
  text: z.string().max(20_000).optional(),
  content: z.array(contextNode).max(500).optional(),
}).superRefine((node, ctx) => {
  if (node.type === "heading" && ![2,3,4].includes(Number(node.attrs?.level))) ctx.addIssue({ code:"custom",message:"Only heading levels 2–4 are allowed." });
  if (node.type === "image") {
    const src=String(node.attrs?.src??"");
    if (!safeUrl.safeParse(src).success || !src.includes("/storage/v1/object/public/product-media/")) ctx.addIssue({ code:"custom",message:"Images must come from product media uploads." });
    if (!String(node.attrs?.alt??"").trim()) ctx.addIssue({ code:"custom",message:"Inline images require alt text." });
  }
  if (node.attrs?.textAlign && !["left","center","right"].includes(String(node.attrs.textAlign))) ctx.addIssue({ code:"custom",message:"Unsupported text alignment." });
}));

export const productContextSchema = contextNode.refine(value => value.type === "doc", "Product Context must be a document.");
export type ProductContextDocument = z.infer<typeof productContextSchema>;
export const emptyProductContext: ProductContextDocument = { type:"doc",content:[] };
