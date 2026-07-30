"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getGuestOrderAccess, rateLimitStaging, createGuestAccessToken, hashGuestAccessToken } from "@/lib/commerce/guest-access";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { sendOrderLifecycleEmail } from "@/lib/providers/brevo";
import { headers } from "next/headers";
import { requireCustomer } from "@/lib/account";
import { createHash } from "node:crypto";

const reportSchema = z.object({
  orderNumber: z.string().min(8).max(40),
  senderName: z.string().trim().min(2).max(120),
  senderContact: z.string().trim().min(3).max(160),
  amount: z.coerce.number().positive().max(100000),
  paymentDate: z.iso.date(),
  approximateTime: z.string().regex(/^\d{2}:\d{2}$/),
  transactionReference: z.string().trim().max(120).optional(),
  customerNote: z.string().trim().max(500).optional(),
  idempotencyKey: z.uuid(),
  fictionalAcknowledged: z.string().optional(),
});

export async function submitGuestPaymentReport(formData: FormData) {
  if (process.env.COMMERCE_ENABLED !== "true") throw new Error("Commerce is disabled by the deployment safety gate.");
  await rateLimitStaging("payment-report", 5, 3600);
  const parsed = reportSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/orders/${String(formData.get("orderNumber") || "")}?report=invalid`);
  const input = parsed.data;
  const order = await getGuestOrderAccess(input.orderNumber);
  if (!order) redirect("/checkout?access=expired");
  if (order.commerce_mode === "staging" && input.fictionalAcknowledged !== "on") redirect(`/orders/${input.orderNumber}?report=invalid`);
  const db = createSupabaseServiceClient();
  const { error } = await db.rpc("submit_guest_payment", {
    p_order_id: order.id,
    p_method: order.payment_method,
    p_sender_name: input.senderName,
    p_sender_contact: input.senderContact,
    p_amount_reported_cents: Math.round(input.amount * 100),
    p_payment_date: input.paymentDate,
    p_approximate_time: input.approximateTime,
    p_transaction_reference: input.transactionReference || null,
    p_customer_note: input.customerNote || null,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) redirect(`/orders/${input.orderNumber}?report=failed`);
  const evidence = formData.get("screenshot");
  if (order.commerce_mode === "production" && evidence instanceof File && evidence.size > 0) {
    const max = Number(process.env.PAYMENT_EVIDENCE_MAX_BYTES || 5_242_880);
    if (evidence.size > max || !["image/jpeg","image/png","image/webp"].includes(evidence.type)) redirect(`/orders/${input.orderNumber}?report=evidence-invalid`);
    const bytes = Buffer.from(await evidence.arrayBuffer());
    const extension = evidence.type === "image/png" ? "png" : evidence.type === "image/webp" ? "webp" : "jpg";
    const path = `${order.id}/${input.idempotencyKey}.${extension}`;
    const upload = await db.storage.from("payment-evidence").upload(path,bytes,{contentType:evidence.type,upsert:false});
    if (!upload.error) await db.from("payment_submissions").update({screenshot_storage_path:path,screenshot_sha256:createHash("sha256").update(bytes).digest("hex")}).eq("idempotency_key",input.idempotencyKey);
  }
  try {
    await sendOrderLifecycleEmail({ buyerEmail:order.customer_email,orderNumber:order.order_number,event:"Payment received for review",
      detail:"We received your payment report. An authorized reviewer must independently verify cleared funds before fulfillment.",
      idempotencyKey:`payment-submitted:${input.idempotencyKey}`,commerceMode:order.commerce_mode });
  } catch {}
  redirect(`/orders/${input.orderNumber}?report=submitted`);
}

export async function renewGuestOrderAccess(formData: FormData) {
  await rateLimitStaging("guest-renewal",3,3600);
  const orderNumber=z.string().min(8).max(40).parse(String(formData.get("orderNumber")||""));
  const email=z.email().parse(String(formData.get("email")||"").toLowerCase());
  const db=createSupabaseServiceClient();
  const {data:order}=await db.from("orders").select("id,order_number,customer_email,commerce_mode").eq("order_number",orderNumber).eq("customer_email",email).is("customer_user_id",null).maybeSingle();
  // Return the same result for unknown orders to avoid account discovery.
  if(order){
    const token=createGuestAccessToken(); const expires=new Date(Date.now()+7*86400000);
    await db.from("orders").update({guest_access_token_hash:hashGuestAccessToken(token),guest_access_expires_at:expires.toISOString(),guest_access_renewed_at:new Date().toISOString()}).eq("id",order.id);
    const h=await headers();const host=h.get("host")||"localhost:3000";const protocol=h.get("x-forwarded-proto")||(host.includes("localhost")?"http":"https");
    try{await sendOrderLifecycleEmail({buyerEmail:email,orderNumber,event:"Secure access renewed",detail:"Your secure guest order link has been renewed for seven days.",accessUrl:`${protocol}://${host}/orders/access/${token}`,idempotencyKey:`access-renewed:${order.id}:${expires.toISOString()}`,commerceMode:order.commerce_mode});}catch{}
  }
  redirect("/checkout?access=renewal-sent");
}

export async function claimGuestOrder(formData: FormData) {
  const {user}=await requireCustomer();
  const orderNumber=z.string().min(8).max(40).parse(String(formData.get("orderNumber")||""));
  const order=await getGuestOrderAccess(orderNumber);
  if(!order) throw new Error("Guest order access has expired.");
  if(!user.email||user.email.toLowerCase()!==String(order.customer_email).toLowerCase()) throw new Error("Your signed-in email must match the order email.");
  const db=createSupabaseServiceClient();
  const {error}=await db.from("orders").update({customer_user_id:user.id,claimed_at:new Date().toISOString(),claimed_by:user.id,guest_access_token_hash:null,guest_access_expires_at:null}).eq("id",order.id).is("customer_user_id",null);
  if(error)throw new Error(error.message);
  redirect("/account/orders");
}
