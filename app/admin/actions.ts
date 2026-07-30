"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { stripeReady } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/account";
import { adminProductSchema, type AdminProductActionState } from "@/lib/admin-products";
import { redirect } from "next/navigation";

const value = (data: FormData, key: string) => String(data.get(key) ?? "");

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
