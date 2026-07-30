import type { Metadata } from "next";
import { CommerceShell } from "@/components/commerce-shell";
import { StagingCheckout } from "@/components/staging-checkout";
import { commerceReadiness } from "@/lib/commerce/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getCommerceRuntime, getShippingSettings } from "@/lib/commerce/runtime";

export const metadata: Metadata = {
  title: "Private staging checkout",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  let basket: Array<{id:string;sku:string;productTitle:string;variantTitle:string;priceCents:number}> = [];
  const runtime = await getCommerceRuntime();
  const shippingSettings = await getShippingSettings();
  try {
    const db = createSupabaseServiceClient();
    let query = db.from("product_variants").select("id,sku,title,price_cents,products!inner(title,category,status),inventory_items!inner(on_hand,committed)")
      .eq("status","active").eq("products.status","active").order("sku");
    if (runtime.mode === "staging") query = query.in("sku",["ATL-5MG-STAGING","HLX-5MG-STAGING"]);
    const { data } = await query;
    basket = (data ?? []).map(row => {
      const product = Array.isArray(row.products) ? row.products[0] : row.products;
      return { id: row.id, sku: row.sku, productTitle: product?.title ?? "Item", variantTitle: row.title, priceCents: row.price_cents };
    }).filter(row => runtime.mode === "staging" || !row.sku.endsWith("-STAGING"));
  } catch {}
  return <CommerceShell><StagingCheckout ready={commerceReadiness} basket={basket} mode={runtime.mode} shippingMode={shippingSettings.mode} fixedShippingCents={shippingSettings.fixedPriceCents}/></CommerceShell>;
}
