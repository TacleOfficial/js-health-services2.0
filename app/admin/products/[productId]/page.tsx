import { notFound } from "next/navigation";
import { CommerceShell } from "@/components/commerce-shell";
import { AdminProductEditor } from "@/components/admin-product-editor";
import { requireAdmin } from "@/lib/account";

export default async function EditAdminProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const { supabase } = await requireAdmin();
  const [productResult, role] = await Promise.all([
    supabase.from("products").select("id,title,slug,description,category,status,product_variants(id,sku,title,price_cents,weight_grams,status,inventory_items(on_hand,committed))").eq("id", productId).maybeSingle(),
    supabase.rpc("has_admin_role", { allowed: ["manager", "super_admin"] }),
  ]);
  if (!productResult.data) notFound();
  const product = productResult.data;
  const variants = (product.product_variants ?? []).map(variant => {
    const inventory = Array.isArray(variant.inventory_items) ? variant.inventory_items[0] : variant.inventory_items;
    return {
      id: variant.id, sku: variant.sku, title: variant.title, price: variant.price_cents / 100,
      weightGrams: variant.weight_grams, status: variant.status as "draft" | "active" | "archived",
      onHand: inventory?.on_hand ?? 0, committed: inventory?.committed ?? 0,
    };
  });
  return <CommerceShell admin><main className="admin-page container"><div className="admin-heading"><div><span className="eyebrow">INVENTORY / EDIT PRODUCT</span><h1>{product.title}</h1><p>Manage catalog details, variants, pricing, and inventory.</p></div></div><AdminProductEditor canManage={Boolean(role.data)} initial={{ id: product.id, title: product.title, slug: product.slug, description: product.description, category: product.category, status: product.status as "draft" | "active" | "archived", variants }} /></main></CommerceShell>;
}
