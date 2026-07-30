"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { stripeReady } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/account";
import { adminProductSchema, type AdminProductActionState } from "@/lib/admin-products";
import { redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getCommerceRuntime, getProductionReadiness } from "@/lib/commerce/runtime";
import { purchaseShippoLabel } from "@/lib/providers/shippo";
import { sendOrderLifecycleEmail } from "@/lib/providers/brevo";

const value = (data: FormData, key: string) => String(data.get(key) ?? "");

async function requireSuperAdmin() {
  const { supabase, user } = await requireAdmin();
  const { data } = await supabase.rpc("has_admin_role", { allowed: ["super_admin"] });
  if (!data) throw new Error("Super-admin authorization is required.");
  return user;
}

export async function changeCommerceMode(data: FormData) {
  const user = await requireSuperAdmin();
  const target = z.enum(["staging", "production"]).parse(value(data, "target_mode"));
  const expectedVersion = z.coerce.number().int().positive().parse(value(data, "expected_version"));
  const confirmation = value(data, "confirmation");
  const current = await getCommerceRuntime();
  if (current.version !== expectedVersion) throw new Error("Commerce mode changed in another session. Refresh and try again.");
  const readiness = target === "production" ? await getProductionReadiness() : { ready: true, checkedAt: new Date().toISOString(), checks: [] };
  if (target === "production" && !readiness.ready) throw new Error("Every production readiness check must pass.");
  const db = createSupabaseServiceClient();
  const { error } = await db.rpc("set_commerce_runtime_mode", {
    p_actor_id: user.id, p_target: target, p_expected_version: expectedVersion,
    p_confirmation: confirmation, p_readiness_snapshot: readiness,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function updatePaymentDestination(data: FormData) {
  const user = await requireSuperAdmin();
  const method = z.enum(["zelle", "cash_app"]).parse(value(data, "method"));
  const destinationName = z.string().trim().min(2).max(120).parse(value(data, "destination_name"));
  const destinationValue = z.string().trim().min(3).max(200).parse(value(data, "destination_value"));
  if (/test|invalid|no-funds/i.test(`${destinationName} ${destinationValue}`)) throw new Error("Production destinations cannot contain test placeholders.");
  const db = createSupabaseServiceClient();
  const { data: previous, error: readError } = await db.from("payment_method_configs").select("*").eq("method", method).single();
  if (readError) throw new Error(readError.message);
  const { error } = await db.from("payment_method_configs").update({
    destination_name: destinationName, destination_value: destinationValue, updated_by: user.id, updated_at: new Date().toISOString(),
  }).eq("method", method);
  if (error) throw new Error(error.message);
  await db.from("audit_events").insert({
    event_type: "payment_destination.updated", actor_type: "admin", actor_id: user.id,
    previous_value: { method, destination_name: previous.destination_name, destination_value_masked: "••••" + String(previous.destination_value).slice(-4) },
    new_value: { method, destination_name: destinationName, destination_value_masked: "••••" + destinationValue.slice(-4) },
  });
  revalidatePath("/admin");
}

export async function addManualTaxRate(data: FormData) {
  const user = await requireSuperAdmin();
  const input = z.object({
    region: z.string().trim().length(2).transform(v => v.toUpperCase()),
    postalPattern: z.string().trim().max(20).optional(),
    ratePercent: z.coerce.number().min(0).max(100),
    effectiveFrom: z.coerce.date(),
    effectiveTo: z.union([z.literal(""), z.coerce.date()]),
    acknowledgment: z.string().trim().min(12).max(500),
  }).parse({
    region: value(data, "region"), postalPattern: value(data, "postal_pattern") || undefined,
    ratePercent: value(data, "rate_percent"), effectiveFrom: value(data, "effective_from"),
    effectiveTo: value(data, "effective_to"), acknowledgment: value(data, "legal_acknowledgment"),
  });
  const db = createSupabaseServiceClient();
  const { data: latest } = await db.from("manual_tax_rates").select("version").eq("country_code", "US")
    .eq("region_code", input.region).order("version", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from("manual_tax_rates").insert({
    country_code: "US", region_code: input.region, postal_pattern: input.postalPattern || null,
    rate_basis_points: Math.round(input.ratePercent * 100), effective_from: input.effectiveFrom.toISOString(),
    effective_to: input.effectiveTo === "" ? null : input.effectiveTo.toISOString(),
    version: Number(latest?.version ?? 0) + 1, is_approved: true,
    legal_review_acknowledgment: input.acknowledgment, approved_at: new Date().toISOString(),
    approved_by: user.id, created_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function purchaseOrderLabel(data: FormData) {
  const { supabase, user } = await requireAdmin();
  const { data: allowed } = await supabase.rpc("has_admin_role", { allowed: ["fulfillment","manager","super_admin"] });
  if (!allowed) throw new Error("Fulfillment authorization is required.");
  if (process.env.SHIPPO_LABEL_PURCHASE_ENABLED !== "true") throw new Error("Label purchasing is disabled by the deployment safety gate.");
  const orderId = z.string().uuid().parse(value(data, "order_id"));
  const idempotencyKey = z.string().uuid().parse(value(data, "idempotency_key"));
  const db = createSupabaseServiceClient();
  const { data: order } = await db.from("orders").select("*,shippo_shipments(*)").eq("id",orderId).single();
  if (!order || order.commerce_mode !== "production" || order.payment_status !== "verified" || order.fulfillment_status !== "ready_for_fulfillment") {
    throw new Error("A production label can be purchased only after payment approval.");
  }
  const shipment = Array.isArray(order.shippo_shipments) ? order.shippo_shipments[0] : order.shippo_shipments;
  if (!shipment) throw new Error("The selected Shippo shipment is unavailable.");
  if (shipment.transaction_id) return;
  const { data: previous } = await db.from("shippo_label_attempts").select("status").eq("idempotency_key",idempotencyKey).maybeSingle();
  if (previous?.status === "succeeded") return;
  const { data: attempt, error: attemptError } = await db.from("shippo_label_attempts").insert({
    shipment_id: shipment.id, commerce_mode: "production", idempotency_key: idempotencyKey, actor_id: user.id, status: "started",
  }).select("id").single();
  if (attemptError) throw new Error(attemptError.message);
  try {
    const transaction = await purchaseShippoLabel(shipment.shippo_rate_id, `Order ${order.order_number}`);
    await db.from("shippo_shipments").update({
      status: "label_purchased", transaction_id: transaction.object_id, transaction_status: transaction.status,
      label_url: transaction.label_url, tracking_number: transaction.tracking_number,
      tracking_url: transaction.tracking_url_provider, provider_response: transaction, updated_at: new Date().toISOString(),
    }).eq("id",shipment.id);
    await db.from("shippo_label_attempts").update({ status:"succeeded",provider_transaction_id:transaction.object_id,provider_response:transaction,completed_at:new Date().toISOString() }).eq("id",attempt.id);
    await db.from("orders").update({ fulfillment_status:"shipped",updated_at:new Date().toISOString() }).eq("id",order.id);
    await db.from("audit_events").insert({ order_id:order.id,event_type:"shipment.label_purchased",actor_type:"admin",actor_id:user.id,commerce_mode:"production",new_value:{transaction_id:transaction.object_id,tracking_number:transaction.tracking_number} });
    try { await sendOrderLifecycleEmail({ buyerEmail:order.customer_email,orderNumber:order.order_number,event:"Shipment created",detail:`Your shipment has been created.${transaction.tracking_number?` Tracking: ${transaction.tracking_number}`:""}`,idempotencyKey:`shipment-created:${shipment.id}`,commerceMode:"production" }); } catch {}
  } catch (error) {
    await db.from("shippo_label_attempts").update({ status:"failed",error_code:"provider_error",provider_response:(error as any).providerResponse??{},completed_at:new Date().toISOString() }).eq("id",attempt.id);
    throw error;
  }
  revalidatePath("/admin");
}

export async function setPaymentMethodEnabled(data: FormData) {
  const method = z.enum(["zelle","cash_app","stripe_card"]).parse(String(data.get("method")));
  const enabled = data.get("enabled") === "true";
  if (method === "stripe_card" && enabled && !stripeReady()) throw new Error("Stripe keys and webhook secret must be configured before activation.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.aud !== "authenticated") throw new Error("Administrator authentication required.");
  const { error } = await supabase.from("payment_method_configs").update({ is_active: enabled, updated_by: user.id, updated_at: new Date().toISOString() }).eq("method", method);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/account/payments");
}

export async function approvePayment(data: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const submissionId = z.string().uuid().parse(value(data, "submission_id"));
  const note = z.string().trim().max(500).parse(value(data, "note"));
  const { error } = await supabase.rpc("approve_payment", { p_submission_id: submissionId, p_note: note || null });
  if (error) throw new Error(error.message);
  const db = createSupabaseServiceClient();
  const { data: submission } = await db.from("payment_submissions").select("id,orders!inner(order_number,customer_email,commerce_mode)").eq("id",submissionId).single();
  const order = Array.isArray(submission?.orders) ? submission.orders[0] : submission?.orders;
  if (order) try { await sendOrderLifecycleEmail({ buyerEmail:order.customer_email,orderNumber:order.order_number,event:"Payment approved",detail:"Your payment has been independently verified. The order is ready for fulfillment.",idempotencyKey:`payment-approved:${submissionId}`,commerceMode:order.commerce_mode }); } catch {}
  revalidatePath("/admin");
  revalidatePath(`/admin/payments/${submissionId}`);
}

export async function rejectPayment(data: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const submissionId = z.string().uuid().parse(value(data, "submission_id"));
  const reason = z.string().trim().min(3).max(500).parse(value(data, "reason"));
  const requestMoreInformation = value(data, "resolution") === "request_info";
  const { error } = await supabase.rpc("reject_payment", {
    p_submission_id: submissionId, p_reason: reason,
    p_request_more_information: requestMoreInformation,
  });
  if (error) throw new Error(error.message);
  const db = createSupabaseServiceClient();
  const { data: submission } = await db.from("payment_submissions").select("id,orders!inner(order_number,customer_email,commerce_mode)").eq("id",submissionId).single();
  const order = Array.isArray(submission?.orders) ? submission.orders[0] : submission?.orders;
  if (order) try { await sendOrderLifecycleEmail({ buyerEmail:order.customer_email,orderNumber:order.order_number,event:requestMoreInformation?"More payment information needed":"Payment report rejected",detail:requestMoreInformation?"We need more information before the payment report can be reviewed.":`The payment report was rejected: ${reason}`,idempotencyKey:`payment-rejected:${submissionId}:${requestMoreInformation}`,commerceMode:order.commerce_mode }); } catch {}
  revalidatePath("/admin");
  revalidatePath(`/admin/payments/${submissionId}`);
}

export async function createTestPaymentSubmission() {
  const { user } = await requireAdmin();
  if (process.env.COMMERCE_ENABLED === "true") throw new Error("Test fixtures are disabled while live commerce is enabled.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("The service role key is required to create isolated staging fixtures.");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const stamp = Date.now().toString(36).toUpperCase();
  const { data: product, error: productError } = await db.from("products").upsert({
    slug: "admin-workflow-test", title: "Admin Workflow Test", description: "Private staging fixture", category: "Staging", status: "draft",
  }, { onConflict: "slug" }).select("id").single();
  if (productError) throw new Error(productError.message);
  const { data: variant, error: variantError } = await db.from("product_variants").upsert({
    product_id: product.id, sku: "ADMIN-TEST-001", title: "Test unit", price_cents: 12500, weight_grams: 1, status: "draft",
  }, { onConflict: "sku" }).select("id").single();
  if (variantError) throw new Error(variantError.message);
  await db.from("inventory_items").upsert({ variant_id: variant.id, on_hand: 1000, committed: 0 });
  const { data: order, error: orderError } = await db.from("orders").insert({
    order_number: `VEL-TEST-${stamp}`, customer_user_id: user.id, customer_email: user.email!,
    customer_phone: "555-0100", subtotal_cents: 12500, shipping_cents: 0, tax_cents: 0,
    total_cents: 12500, payment_method: "zelle", order_status: "payment_review",
    payment_status: "submitted", fulfillment_status: "unfulfilled",
    shipping_address: { name: "Admin Test", line1: "100 Staging Way", city: "Testville", state: "IN", postalCode: "00000" },
    billing_address: { name: "Admin Test", line1: "100 Staging Way", city: "Testville", state: "IN", postalCode: "00000" },
    customer_snapshot: { fixture: true }, pricing_snapshot: { fixture: true },
    shippo_rate_id: "staging-fixture", expires_at: new Date(Date.now() + 86400000).toISOString(),
    idempotency_key: crypto.randomUUID(),
  }).select("id").single();
  if (orderError) throw new Error(orderError.message);
  const inserts = await Promise.all([
    db.from("order_items").insert({ order_id: order.id, product_id: product.id, variant_id: variant.id, sku: "ADMIN-TEST-001", product_title: "Admin Workflow Test", variant_title: "Test unit", quantity: 1, unit_price_cents: 12500, line_total_cents: 12500, product_snapshot: { fixture: true } }),
    db.from("inventory_reservations").insert({ order_id: order.id, variant_id: variant.id, quantity: 1, expires_at: new Date(Date.now() + 86400000).toISOString() }),
    db.from("payment_submissions").insert({ order_id: order.id, method: "zelle", sender_name: "Admin Test", sender_contact: user.email!, amount_reported_cents: 12500, payment_date: new Date().toISOString().slice(0, 10), approximate_time: new Date().toISOString().slice(11, 19), transaction_reference: `TEST-${stamp}`, customer_note: "Generated from the admin staging dashboard.", status: "submitted", idempotency_key: crypto.randomUUID() }),
  ]);
  const fixtureError = inserts.find(result => result.error)?.error;
  if (fixtureError) throw new Error(fixtureError.message);
  revalidatePath("/admin");
}

export async function saveAdminProduct(_state: AdminProductActionState, data: FormData): Promise<AdminProductActionState> {
  await requireAdmin();
  let raw: unknown;
  try { raw = JSON.parse(value(data, "payload")); }
  catch { return { ok: false, message: "The product form could not be read." }; }
  const parsed = adminProductSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Review the highlighted product details.", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const product = parsed.data;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };
  const variants = product.variants.map(variant => ({
    id: variant.id ?? null, sku: variant.sku, title: variant.title,
    price_cents: Math.round(variant.price * 100), weight_grams: variant.weightGrams,
    status: variant.status, on_hand: variant.onHand,
  }));
  const { data: productId, error } = await supabase.rpc("admin_save_product", {
    p_product_id: product.id ?? null,
    p_product: { slug: product.slug, title: product.title, description: product.description, category: product.category, status: product.status },
    p_variants: variants,
  });
  if (error) return { ok: false, message: error.message.includes("duplicate") ? "That slug or SKU is already in use." : error.message };
  revalidatePath("/admin");
  revalidatePath(`/admin/products/${productId}`);
  redirect(`/admin/products/${productId}?saved=1`);
}

export async function setAdminProductArchived(data: FormData) {
  await requireAdmin();
  const productId = z.string().uuid().parse(value(data, "product_id"));
  const archived = value(data, "archived") === "true";
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("admin_set_product_archived", { p_product_id: productId, p_archived: archived });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath(`/admin/products/${productId}`);
  if (archived) redirect("/admin?view=inventory");
}
