import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { commerceConfig } from "./config";

export type CommerceMode = "staging" | "production";
export type ShippingMode = "shippo" | "manual_free" | "manual_fixed";

export interface CommerceRuntime {
  mode: CommerceMode;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ReadinessCheck {
  key: string;
  label: string;
  ready: boolean;
  reason?: string;
}

async function providerCheck(url: string, headers: HeadersInit) {
  try {
    const response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(7000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function getCommerceRuntime(): Promise<CommerceRuntime> {
  const db = createSupabaseServiceClient();
  const { data, error } = await db.from("commerce_runtime_settings")
    .select("mode,version,updated_at,updated_by").eq("singleton", true).single();
  if (error || !data) throw new Error("Commerce runtime settings are unavailable. Apply migration 0010.");
  return { mode: data.mode, version: Number(data.version), updatedAt: data.updated_at, updatedBy: data.updated_by };
}

export async function getShippingSettings() {
  const db = createSupabaseServiceClient();
  const { data, error } = await db.from("commerce_shipping_settings")
    .select("mode,fixed_price_cents,version,updated_at,updated_by").eq("singleton",true).single();
  if (error || !data) throw new Error("Shipping settings are unavailable. Apply migration 0013.");
  return {
    mode: data.mode as ShippingMode, fixedPriceCents: Number(data.fixed_price_cents),
    version: Number(data.version), updatedAt: data.updated_at, updatedBy: data.updated_by as string|null,
  };
}

export async function getProductionReadiness() {
  const checks: ReadinessCheck[] = [];
  let db;
  try {
    db = createSupabaseServiceClient();
    const { error } = await db.from("commerce_runtime_settings").select("version").limit(1);
    checks.push({ key: "database", label: "Supabase service-role connectivity", ready: !error, reason: error?.message });
  } catch {
    checks.push({ key: "database", label: "Supabase service-role connectivity", ready: false, reason: "Service connection unavailable" });
  }
  if (db) {
    const [catalog, destinations, taxRates] = await Promise.all([
      db.from("product_variants").select("id,weight_grams,inventory_items!inner(on_hand,committed),products!inner(category,status)")
        .eq("status", "active").eq("products.status", "active"),
      db.from("payment_method_configs").select("method,destination_name,destination_value,is_active").in("method", ["zelle", "cash_app"]),
      db.from("manual_tax_rates").select("id").eq("is_approved", true).lte("effective_from", new Date().toISOString())
        .or(`effective_to.is.null,effective_to.gt.${new Date().toISOString()}`).limit(1),
    ]);
    const realCatalog = (catalog.data ?? []).filter((row: any) => {
      const product = Array.isArray(row.products) ? row.products[0] : row.products;
      const inventory = Array.isArray(row.inventory_items) ? row.inventory_items[0] : row.inventory_items;
      return product?.category !== "Staging" && row.weight_grams > 0 && inventory && inventory.on_hand > inventory.committed;
    });
    checks.push({ key: "catalog", label: "Active catalog inventory and weights", ready: !catalog.error && realCatalog.length > 0, reason: realCatalog.length ? undefined : "No eligible production inventory" });
    const invalidDestination = (destinations.data ?? []).some((row: any) =>
      !row.is_active || /test|invalid|no-funds/i.test(`${row.destination_name} ${row.destination_value}`));
    checks.push({ key: "destinations", label: "Real Zelle and Cash App destinations", ready: !destinations.error && destinations.data?.length === 2 && !invalidDestination, reason: invalidDestination ? "A destination is disabled or still contains test data" : undefined });
    checks.push({ key: "manual_tax", label: "Approved effective manual tax rate", ready: !taxRates.error && Boolean(taxRates.data?.length), reason: taxRates.data?.length ? undefined : "No current approved rate" });
  }
  const emailReady = Boolean(commerceConfig.BREVO_API_KEY && commerceConfig.BREVO_SENDER_EMAIL &&
    commerceConfig.PRODUCTION_INTERNAL_INBOX && commerceConfig.TRANSACTIONAL_EMAIL_ENABLED);
  checks.push({ key: "email", label: "Brevo sender and operational inbox", ready: emailReady, reason: emailReady ? undefined : "Email configuration or hard flag is missing" });

  let shippingMode: ShippingMode = "shippo";
  try { shippingMode = (await getShippingSettings()).mode; } catch {}
  const addressValidationReady = Boolean(commerceConfig.SHIPPO_API_TOKEN) && await providerCheck("https://api.goshippo.com/carrier_accounts?results=1", {
    authorization: `ShippoToken ${commerceConfig.SHIPPO_API_TOKEN}`,
  });
  checks.push({ key:"address_validation",label:"Shippo U.S. address validation",ready:addressValidationReady,reason:addressValidationReady?undefined:"Shippo API token is missing" });
  const originReady = Boolean(commerceConfig.SHIPPO_ORIGIN_NAME && commerceConfig.SHIPPO_ORIGIN_STREET1 &&
    commerceConfig.SHIPPO_ORIGIN_CITY && /^[A-Z]{2}$/.test(commerceConfig.SHIPPO_ORIGIN_STATE ?? "") &&
    /^\d{5}(?:-\d{4})?$/.test(commerceConfig.SHIPPO_ORIGIN_POSTAL_CODE ?? ""));
  const shippoConnected = Boolean(commerceConfig.SHIPPO_API_TOKEN?.startsWith("shippo_live_")) && await providerCheck("https://api.goshippo.com/carrier_accounts?results=1", {
    authorization: `ShippoToken ${commerceConfig.SHIPPO_API_TOKEN}`,
  });
  const shippoReady = shippoConnected && originReady && Boolean(commerceConfig.SHIPPO_WEBHOOK_SECRET) &&
    commerceConfig.SHIPPO_LABEL_PURCHASE_ENABLED;
  checks.push({ key: "shippo_fulfillment", label: "Shippo live rates and label purchasing", ready: shippingMode !== "shippo" || shippoReady, reason: shippingMode !== "shippo" || shippoReady ? undefined : "Live token, origin, webhook, carriers, or label permission is incomplete" });
  checks.push({ key: "hard_gate", label: "Deployment commerce safety gate", ready: commerceConfig.COMMERCE_ENABLED, reason: commerceConfig.COMMERCE_ENABLED ? undefined : "COMMERCE_ENABLED is false" });
  return { ready: checks.every(check => check.ready), checkedAt: new Date().toISOString(), checks };
}

export async function assertRuntimeCheckoutEnabled() {
  if (!commerceConfig.COMMERCE_ENABLED) throw new Error("Checkout is disabled by the deployment safety gate.");
  const runtime = await getCommerceRuntime();
  if (runtime.mode === "staging") {
    if (!commerceConfig.STAGING_ORDER_TEST_MODE || !commerceConfig.STAGING_TEST_INBOX) throw new Error("Staging checkout is not configured.");
    return runtime;
  }
  const readiness = await getProductionReadiness();
  if (!readiness.ready) throw new Error("Production checkout readiness has changed. A super-admin must review the checklist.");
  return runtime;
}
