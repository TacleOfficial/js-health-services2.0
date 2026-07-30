import { notFound } from "next/navigation";
import { CommerceShell } from "@/components/commerce-shell";
import { AdminProductEditor } from "@/components/admin-product-editor";
import { requireAdmin } from "@/lib/account";
import { productContextSchema } from "@/lib/product-context";

export default async function EditAdminProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const { supabase } = await requireAdmin();
  const [productResult, role] = await Promise.all([
    supabase.from("products").select("id,title,slug,description,category,status,primary_image_path,primary_image_alt,context_document,context_image_path,context_image_alt,product_variants(id,sku,title,price_cents,weight_grams,status,inventory_items(on_hand,committed))").eq("id", productId).maybeSingle(),
    supabase.rpc("has_admin_role", { allowed: ["manager", "super_admin"] }),
  ]);
  if (!productResult.data) notFound();
  const product = productResult.data;
  const publicMediaUrl=(path:string|null)=>path?`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-media/${path}`:"";
  const context=productContextSchema.safeParse(product.context_document);
  const variants = (product.product_variants ?? []).map(variant => {
    const inventory = Array.isArray(variant.inventory_items) ? variant.inventory_items[0] : variant.inventory_items;
    return {
      id: variant.id, sku: variant.sku, title: variant.title, price: variant.price_cents / 100,
      weightGrams: variant.weight_grams, status: variant.status as "draft" | "active" | "archived",
      onHand: inventory?.on_hand ?? 0, committed: inventory?.committed ?? 0,
    };
  });
  return <CommerceShell admin><main className="admin-page container"><div className="admin-heading"><div><span className="eyebrow">INVENTORY / EDIT PRODUCT</span><h1>{product.title}</h1><p>Manage catalog details, variants, pricing, inventory, and PDP presentation.</p></div></div><AdminProductEditor canManage={Boolean(role.data)} initial={{ id: product.id, title: product.title, slug: product.slug, description: product.description, category: product.category, status: product.status as "draft" | "active" | "archived",
    primaryImagePath:product.primary_image_path??"",primaryImageUrl:publicMediaUrl(product.primary_image_path),primaryImageAlt:product.primary_image_alt??"",
    contextDocument:context.success?context.data:{type:"doc",content:[]},contextImagePath:product.context_image_path??"",contextImageUrl:publicMediaUrl(product.context_image_path),contextImageAlt:product.context_image_alt??"",variants }} /></main></CommerceShell>;
}
