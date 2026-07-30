"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { assertStagingCheckoutEnabled, commerceConfig } from "@/lib/commerce/config";
import { createGuestAccessToken, hashGuestAccessToken, rateLimitStaging } from "@/lib/commerce/guest-access";
import { formatUsd } from "@/lib/commerce/money";
import { createOrderNumber } from "@/lib/commerce/order-number";
import { sendStagingOrderAccessEmail } from "@/lib/providers/brevo";
import { validateShippoAddress } from "@/lib/providers/shippo";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const guestCheckoutSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.email(),
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().max(160).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().length(2).transform(value => value.toUpperCase()),
  postalCode: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/),
  phone: z.string().trim().min(7).max(30),
  paymentMethod: z.enum(["zelle","cash_app"]),
  eligibilityAccepted: z.literal(true),
  idempotencyKey: z.uuid(),
});

export type GuestCheckoutResult =
  | { ok: true; accessPath: string; orderNumber: string; emailWarning?: string }
  | { ok: false; message: string; fields?: Record<string,string[]> };

export async function createGuestStagingOrder(raw: unknown): Promise<GuestCheckoutResult> {
  try {
    assertStagingCheckoutEnabled();
    await rateLimitStaging("checkout-create", 5, 3600);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Checkout is unavailable." };
  }
  const parsed = guestCheckoutSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Review the highlighted checkout details.", fields: parsed.error.flatten().fieldErrors as Record<string,string[]> };
  }
  const input = parsed.data;
  const db = createSupabaseServiceClient();
  const { data: variants, error: variantsError } = await db.from("product_variants")
    .select("id,sku,title,price_cents,status,products!inner(title,status),inventory_items(on_hand,committed)")
    .in("sku", ["ATL-5MG-STAGING","HLX-5MG-STAGING"])
    .eq("status","active")
    .eq("products.status","active");
  if (variantsError || variants?.length !== 2) {
    return { ok: false, message: "The staging basket is not provisioned. Apply the latest Supabase migration." };
  }

  const address = {
    recipient_name: `${input.firstName} ${input.lastName}`,
    first_name: input.firstName, last_name: input.lastName,
    line1: input.line1, line2: input.line2 || null, city: input.city,
    region: input.state, postal_code: input.postalCode, country: "US", phone: input.phone,
  };
  let addressStatus: "validated"|"unverified" = "unverified";
  let addressSnapshot: Record<string,unknown> = {};
  try {
    addressSnapshot = await validateShippoAddress({
      name: address.recipient_name, addressLine1: input.line1, addressLine2: input.line2,
      city: input.city, state: input.state, postalCode: input.postalCode,
      country: "US", email: input.email, phone: input.phone,
    });
    addressStatus = "validated";
  } catch (error) {
    addressSnapshot = { provider: "shippo", error: error instanceof Error ? error.message : "Address validation unavailable" };
  }

  const token = createGuestAccessToken();
  const expiration = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const orderNumber = createOrderNumber(new Date(), process.env.PAYMENT_ORDER_PREFIX || "VEL");
  const { data: order, error } = await db.rpc("create_guest_staging_order", {
    p_order_number: orderNumber,
    p_customer_email: input.email,
    p_customer_phone: input.phone,
    p_shipping_address: address,
    p_payment_method: input.paymentMethod,
    p_items: variants.map(variant => ({ variant_id: variant.id, quantity: 1 })),
    p_shipping_cents: 1800,
    p_idempotency_key: input.idempotencyKey,
    p_guest_token_hash: hashGuestAccessToken(token),
    p_expires_at: expiration.toISOString(),
    p_address_validation_status: addressStatus,
    p_address_validation_snapshot: addressSnapshot,
  });
  if (error || !order) {
    const message = error?.message.includes("insufficient_inventory") ? "One of the staging items is no longer available."
      : error?.message.includes("payment_method_unavailable") ? "That staging payment method is unavailable."
      : "The staging order could not be created.";
    return { ok: false, message };
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const accessPath = `/orders/access/${token}`;
  let emailWarning: string | undefined;
  try {
    await sendStagingOrderAccessEmail({
      to: commerceConfig.STAGING_TEST_INBOX!,
      orderNumber: String(order.order_number),
      accessUrl: `${protocol}://${host}${accessPath}`,
      total: formatUsd(Number(order.total_cents)),
    });
  } catch {
    emailWarning = "The order was created, but the staging access email could not be delivered.";
  }
  return { ok: true, accessPath, orderNumber: String(order.order_number), emailWarning };
}
