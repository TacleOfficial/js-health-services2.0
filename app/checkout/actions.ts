"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { commerceConfig } from "@/lib/commerce/config";
import { assertRuntimeCheckoutEnabled } from "@/lib/commerce/runtime";
import { createGuestAccessToken, hashGuestAccessToken, rateLimitStaging } from "@/lib/commerce/guest-access";
import { formatUsd } from "@/lib/commerce/money";
import { createOrderNumber } from "@/lib/commerce/order-number";
import { sendOrderLifecycleEmail } from "@/lib/providers/brevo";
import { createShippoRateQuote, retrieveShippoRate, validateShippoAddress, type ShippoAddress } from "@/lib/providers/shippo";
import { createStripeTaxQuote, StripeTaxError } from "@/lib/providers/stripe-tax";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const detailsSchema = z.object({
  firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80),
  email: z.email(), line1: z.string().trim().min(3).max(160), line2: z.string().trim().max(160).optional(),
  city: z.string().trim().min(1).max(100), state: z.string().trim().length(2).transform(v => v.toUpperCase()),
  postalCode: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/), phone: z.string().trim().min(7).max(30),
});
const itemSchema = z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(20) });
const checkoutSchema = detailsSchema.extend({
  paymentMethod: z.enum(["zelle", "cash_app"]), eligibilityAccepted: z.literal(true),
  idempotencyKey: z.uuid(), items: z.array(itemSchema).max(20).optional(),
  shippoShipmentId: z.string().max(100).optional(), shippoRateId: z.string().max(100).optional(),
  shippoRateSnapshot: z.record(z.string(), z.unknown()).optional(),
});
const quoteSchema = detailsSchema.extend({ items: z.array(itemSchema).min(1).max(20) });

export type ShippingRate = { shipmentId: string; rateId: string; label: string; amountCents: number; estimatedDays?: number; snapshot: Record<string, unknown> };
export type GuestCheckoutResult =
  | { ok: true; accessPath: string; orderNumber: string; emailWarning?: string }
  | { ok: false; message: string; fields?: Record<string,string[]> };

async function loadVariants(items: Array<{ variantId: string; quantity: number }>) {
  const db = createSupabaseServiceClient();
  const { data, error } = await db.from("product_variants")
    .select("id,sku,title,price_cents,weight_grams,status,products!inner(title,category,status),inventory_items(on_hand,committed)")
    .in("id", items.map(item => item.variantId)).eq("status", "active").eq("products.status", "active");
  if (error || data?.length !== items.length) throw new Error("One or more cart items are unavailable.");
  return data;
}

function toShippoAddress(input: z.infer<typeof detailsSchema>): ShippoAddress {
  return { name: `${input.firstName} ${input.lastName}`, addressLine1: input.line1, addressLine2: input.line2,
    city: input.city, state: input.state, postalCode: input.postalCode, country: "US", email: input.email, phone: input.phone };
}

export async function quoteProductionShipping(raw: unknown): Promise<{ ok: true; rates: ShippingRate[] } | { ok: false; message: string }> {
  try {
    const runtime = await assertRuntimeCheckoutEnabled();
    if (runtime.mode !== "production") return { ok: false, message: "Shipping quotes are available in production mode only." };
    await rateLimitStaging("shipping-quote", 15, 3600);
    const input = quoteSchema.parse(raw);
    const variants = await loadVariants(input.items);
    await validateShippoAddress(toShippoAddress(input));
    const grams = variants.reduce((sum, variant) => sum + variant.weight_grams * input.items.find(item => item.variantId === variant.id)!.quantity, 0);
    const quote = await createShippoRateQuote({ to: toShippoAddress(input), parcel: { lengthInches: 8, widthInches: 6, heightInches: 4, weightOunces: Math.max(1, grams / 28.3495) }, metadata: "Production checkout quote" });
    const rates = quote.rates.filter(rate => rate.currency === "USD").map(rate => ({
      shipmentId: quote.object_id, rateId: rate.object_id, label: `${rate.provider} ${rate.servicelevel.name}`,
      amountCents: Math.round(Number(rate.amount) * 100), estimatedDays: rate.estimated_days,
      snapshot: { shipment_id: quote.object_id, rate_id: rate.object_id, provider: rate.provider, service_level: rate.servicelevel, amount: rate.amount, currency: rate.currency, estimated_days: rate.estimated_days },
    })).sort((a,b) => a.amountCents-b.amountCents);
    return rates.length ? { ok: true, rates } : { ok: false, message: "No shipping rates are available for this address." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Shipping could not be quoted." };
  }
}

export async function createGuestStagingOrder(raw: unknown): Promise<GuestCheckoutResult> {
  let runtime;
  try {
    runtime = await assertRuntimeCheckoutEnabled();
    await rateLimitStaging("checkout-create", 5, 3600);
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Checkout is unavailable." }; }
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Review the highlighted checkout details.", fields: parsed.error.flatten().fieldErrors as Record<string,string[]> };
  const input = parsed.data;
  const db = createSupabaseServiceClient();
  let items = input.items ?? [];
  if (runtime.mode === "staging") {
    const { data } = await db.from("product_variants").select("id").in("sku", ["ATL-5MG-STAGING","HLX-5MG-STAGING"]).eq("status","active");
    if (data?.length !== 2) return { ok: false, message: "The staging basket is not provisioned." };
    items = data.map(variant => ({ variantId: variant.id, quantity: 1 }));
  }
  if (!items.length) return { ok: false, message: "Your production cart is empty." };
  let variants;
  try { variants = await loadVariants(items); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Cart unavailable." }; }
  if (runtime.mode === "production" && variants.some((variant: any) => {
    const product = Array.isArray(variant.products) ? variant.products[0] : variant.products;
    return product?.category === "Staging" || variant.sku.endsWith("-STAGING");
  })) return { ok: false, message: "Staging catalog items cannot enter a production order." };

  const shippoAddress = toShippoAddress(input);
  let addressSnapshot: Record<string, unknown>;
  try { addressSnapshot = await validateShippoAddress(shippoAddress); }
  catch (error) {
    if (runtime.mode === "production") return { ok: false, message: "Shippo could not validate the delivery address." };
    addressSnapshot = { provider: "shippo", error: error instanceof Error ? error.message : "Unavailable" };
  }
  const subtotal = variants.reduce((sum, variant) => sum + variant.price_cents * items.find(item => item.variantId === variant.id)!.quantity, 0);
  let shippingCents = 1800, shippoRateId = "staging-flat-handling", shippingSnapshot: Record<string, unknown> = { staging: true };
  if (runtime.mode === "production") {
    if (!input.shippoRateId || !input.shippoShipmentId || !input.shippoRateSnapshot) return { ok: false, message: "Select a current Shippo shipping rate." };
    let verifiedRate;
    try { verifiedRate = await retrieveShippoRate(input.shippoRateId); } catch { return { ok: false, message: "The selected Shippo rate is no longer available." }; }
    if (verifiedRate.object_id !== input.shippoRateId || verifiedRate.shipment !== input.shippoShipmentId || verifiedRate.currency !== "USD") return { ok: false, message: "The shipping rate selection is invalid." };
    shippingCents = Math.round(Number(verifiedRate.amount) * 100);
    if (!Number.isSafeInteger(shippingCents) || shippingCents < 0) return { ok: false, message: "The shipping rate amount is invalid." };
    shippoRateId = input.shippoRateId; shippingSnapshot = { shipment_id:verifiedRate.shipment,rate_id:verifiedRate.object_id,amount:verifiedRate.amount,currency:verifiedRate.currency,provider:verifiedRate.provider,service_level:verifiedRate.servicelevel,estimated_days:verifiedRate.estimated_days };
  }
  let taxCents = 0, taxSource: "staging_zero"|"stripe_tax"|"manual_fallback" = "staging_zero";
  let stripeTaxId: string|null = null, manualRateId: string|null = null;
  if (runtime.mode === "production") {
    try {
      const quote = await createStripeTaxQuote({ currency: "usd", customerAddress: { line1: input.line1, line2: input.line2, city: input.city, state: input.state, postalCode: input.postalCode, country: "US" },
        lines: variants.map(variant => ({ reference: variant.id, amountCents: variant.price_cents, quantity: items.find(item => item.variantId === variant.id)!.quantity, taxCode: commerceConfig.STRIPE_DEFAULT_TAX_CODE })), shippingCents });
      taxCents = quote.tax_amount_exclusive; stripeTaxId = quote.id; taxSource = "stripe_tax";
    } catch (error) {
      if (!(error instanceof StripeTaxError) || !error.technical) return { ok: false, message: "Stripe Tax rejected the calculation. Production checkout is blocked." };
      const now = new Date().toISOString();
      const { data: fallback } = await db.from("manual_tax_rates").select("*").eq("country_code","US").eq("region_code",input.state)
        .eq("is_approved",true).lte("effective_from",now).or(`effective_to.is.null,effective_to.gt.${now}`).order("version",{ascending:false}).limit(1).maybeSingle();
      if (!fallback) return { ok: false, message: "Tax service is unavailable and no approved current fallback exists." };
      taxCents = Math.round((subtotal + shippingCents) * fallback.rate_basis_points / 10000);
      taxSource = "manual_fallback"; manualRateId = fallback.id;
      await db.from("provider_alerts").insert({ commerce_mode: "production", provider: "stripe_tax", code: "technical_fallback_used", details: { status: error.status, fallback_rate_id: fallback.id } });
    }
  }
  const token = createGuestAccessToken();
  const paymentExpiration = new Date(Date.now() + 24*60*60*1000);
  const accessExpiration = new Date(Date.now() + 7*24*60*60*1000);
  const orderNumber = createOrderNumber(new Date(), process.env.PAYMENT_ORDER_PREFIX || "VEL");
  const address = { recipient_name: shippoAddress.name, first_name: input.firstName, last_name: input.lastName, line1: input.line1, line2: input.line2 || null, city: input.city, region: input.state, postal_code: input.postalCode, country: "US", phone: input.phone };
  const { data: order, error } = await db.rpc("create_guest_commerce_order", {
    p_mode: runtime.mode, p_order_number: orderNumber, p_customer_email: input.email, p_customer_phone: input.phone,
    p_shipping_address: address, p_payment_method: input.paymentMethod,
    p_items: items.map(item => ({ variant_id: item.variantId, quantity: item.quantity })),
    p_shipping_cents: shippingCents, p_tax_cents: taxCents, p_tax_source: taxSource,
    p_stripe_tax_calculation_id: stripeTaxId, p_manual_tax_rate_id: manualRateId,
    p_shippo_rate_id: shippoRateId, p_shipping_rate_snapshot: shippingSnapshot,
    p_idempotency_key: input.idempotencyKey, p_guest_token_hash: hashGuestAccessToken(token),
    p_payment_expires_at: paymentExpiration.toISOString(), p_guest_access_expires_at: accessExpiration.toISOString(),
    p_address_validation_status: "validated", p_address_validation_snapshot: addressSnapshot,
  });
  if (error || !order) return { ok: false, message: error?.message.includes("insufficient_inventory") ? "An item is no longer available." : "The order could not be created." };
  if (runtime.mode === "production") await db.from("shippo_shipments").insert({ order_id: order.id, commerce_mode: "production", shippo_shipment_id: input.shippoShipmentId, shippo_rate_id: shippoRateId, rate_snapshot: shippingSnapshot });
  const requestHeaders = await headers(); const host = requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const accessPath = `/orders/access/${token}`; let emailWarning: string|undefined;
  try {
    const stagingRecipient = commerceConfig.STAGING_TEST_INBOX;
    await sendOrderLifecycleEmail({ buyerEmail: runtime.mode === "staging" ? stagingRecipient! : input.email, buyerName: shippoAddress.name, orderNumber: order.order_number,
      event: "Order created", detail: `${runtime.mode === "staging" ? "STAGING TEST ONLY — DO NOT SEND FUNDS. " : ""}Order total: ${formatUsd(order.total_cents)}. Payment reporting expires in 24 hours; secure access expires in 7 days.`,
      accessUrl: `${protocol}://${host}${accessPath}`, idempotencyKey: `order-created:${order.id}`, commerceMode: runtime.mode });
  } catch { emailWarning = "The order was created, but its access email could not be delivered."; }
  return { ok: true, accessPath, orderNumber: order.order_number, emailWarning };
}
