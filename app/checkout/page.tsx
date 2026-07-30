import type { Metadata } from "next";
import { CommerceShell } from "@/components/commerce-shell";
import { StagingCheckout } from "@/components/staging-checkout";
import { commerceReadiness } from "@/lib/commerce/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Private staging checkout",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  let basket: Array<{sku:string;productTitle:string;variantTitle:string;priceCents:number}> = [];
  try {
    const db = createSupabaseServiceClient();
    const { data } = await db.from("product_variants").select("sku,title,price_cents,products!inner(title)")
      .in("sku",["ATL-5MG-STAGING","HLX-5MG-STAGING"]).order("sku");
    basket = (data ?? []).map(row => {
      const product = Array.isArray(row.products) ? row.products[0] : row.products;
      return { sku: row.sku, productTitle: product?.title ?? "Staging item", variantTitle: row.title, priceCents: row.price_cents };
    });
  } catch {}
  return <CommerceShell><StagingCheckout ready={commerceReadiness} basket={basket}/></CommerceShell>;
}
