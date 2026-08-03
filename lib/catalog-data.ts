import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { productContextSchema } from "@/lib/product-context";
import type { Product } from "@/lib/types";

export async function loadActiveCatalogProducts(slug?: string): Promise<Product[]> {
  try {
    const db = createSupabaseServiceClient();
    let query = db.from("products")
      .select("id,slug,title,description,category,primary_image_path,primary_image_alt,context_document,context_image_path,context_image_alt,product_variants(id,title,price_cents,status,inventory_items(on_hand,committed))")
      .eq("status","active");
    if (slug) query = query.eq("slug", slug);
    const { data } = await query.order("created_at", { ascending: false });
    const media = (path: string | null) => path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-media/${path}` : undefined;
    return (data ?? []).map(item => {
      const context = productContextSchema.safeParse(item.context_document);
      const variants = (item.product_variants ?? []).filter(variant => variant.status === "active").map(variant => ({
        id: variant.id, label: variant.title, amount: variant.title, price: variant.price_cents / 100,
      }));
      const available = (item.product_variants ?? []).some(variant => {
        const inventory = Array.isArray(variant.inventory_items) ? variant.inventory_items[0] : variant.inventory_items;
        return variant.status === "active" && inventory && inventory.on_hand > inventory.committed;
      });
      return {
        id: item.id, slug: item.slug, name: item.title, code: item.slug.slice(0,3).toUpperCase(),
        descriptor: item.description, category: item.category, researchArea: item.category, form: "Research material",
        status: available ? "In stock" as const : "Temporarily unavailable" as const,
        documentStatus: "CoA available" as const, batchId: "Database catalog", tone: "#e4e8e5", variants,
        primaryImageUrl: media(item.primary_image_path), primaryImageAlt: item.primary_image_alt ?? undefined,
        contextDocument: context.success ? context.data : undefined, contextImageUrl: media(item.context_image_path),
        contextImageAlt: item.context_image_alt ?? undefined, databaseBacked: true,
      };
    }).filter(product => product.variants.length > 0);
  } catch {
    return [];
  }
}
