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
import { getCommerceRuntime, getProductionReadiness, getShippingSettings } from "@/lib/commerce/runtime";
import { purchaseShippoLabel } from "@/lib/providers/shippo";
import { sendOrderLifecycleEmail, sendTransactionalSms } from "@/lib/providers/brevo";
import { createHash, randomBytes, randomInt } from "node:crypto";

const value = (data: FormData, key: string) => String(data.get(key) ?? "");

export type ProductMediaUploadResult={ok:boolean;message?:string;path?:string;url?:string};
export async function uploadProductMedia(_state:ProductMediaUploadResult,data:FormData):Promise<ProductMediaUploadResult>{
  const {supabase}=await requireAdmin();const {data:allowed}=await supabase.rpc("has_admin_role",{allowed:["manager","super_admin"]});
  if(!allowed)throw new Error("Manager authorization is required.");
  const file=data.get("file");
  if(!(file instanceof File)||file.size===0)return{ok:false,message:"Choose an image to upload."};
  if(file.size>5_242_880)return{ok:false,message:"Images must be 5 MB or smaller."};
  const types:Record<string,{ext:string;signatures:number[][]}>={
    "image/jpeg":{ext:"jpg",signatures:[[0xff,0xd8,0xff]]},
    "image/png":{ext:"png",signatures:[[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]]},
    "image/webp":{ext:"webp",signatures:[[0x52,0x49,0x46,0x46]]},
  };
  const spec=types[file.type];if(!spec)return{ok:false,message:"Use a JPG, PNG, or WebP image."};
  const bytes=new Uint8Array(await file.arrayBuffer());
  const signatureOk=spec.signatures.some(signature=>signature.every((byte,index)=>bytes[index]===byte))
    &&(file.type!=="image/webp"||String.fromCharCode(...bytes.slice(8,12))==="WEBP");
  if(!signatureOk)return{ok:false,message:"The file contents do not match its image type."};
  const folder=z.string().uuid().parse(value(data,"media_key"));
  const path=`products/${folder}/${crypto.randomUUID()}.${spec.ext}`;
  const db=createSupabaseServiceClient();
  const {error}=await db.storage.from("product-media").upload(path,bytes,{contentType:file.type,cacheControl:"31536000",upsert:false});
  if(error)return{ok:false,message:error.message};
  return{ok:true,path,url:db.storage.from("product-media").getPublicUrl(path).data.publicUrl};
}

async function requireSuperAdmin() {
  const { supabase, user } = await requireAdmin();
  const { data } = await supabase.rpc("has_admin_role", { allowed: ["super_admin"] });
  if (!data) throw new Error("Super-admin authorization is required.");
  return user;
}

const adminPhoneSchema = z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Use E.164 format, such as +13175550123.");

export type AdminSmsActionState = { ok: boolean; message: string };
const smsActionError = (error: unknown): AdminSmsActionState => ({
  ok: false,
  message: error instanceof z.ZodError ? error.issues[0]?.message ?? "Check the entered value." : error instanceof Error ? error.message : "Unable to update SMS settings.",
});

export async function saveAdminSmsPhone(_state: AdminSmsActionState, data: FormData): Promise<AdminSmsActionState> {
  try {
    await requireSuperAdmin();
    const adminUserId = z.string().uuid().parse(value(data, "admin_user_id"));
    const phone = adminPhoneSchema.parse(value(data, "phone_e164"));
    const supabase = await createSupabaseServerClient();
    if (!supabase) throw new Error("Supabase is not configured.");
    const { error } = await supabase.rpc("admin_set_sms_phone", { p_admin_user_id: adminUserId, p_phone_e164: phone });
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
    return { ok: true, message: "Phone number saved. Send a verification code to continue." };
  } catch (error) {
    return smsActionError(error);
  }
}

export async function requestAdminSmsVerification(_state: AdminSmsActionState, data: FormData): Promise<AdminSmsActionState> {
  try {
    await requireSuperAdmin();
    const adminUserId = z.string().uuid().parse(value(data, "admin_user_id"));
    const code = String(randomInt(100000, 1000000));
    const salt = randomBytes(16).toString("hex");
    const hash = createHash("sha256").update(code + salt).digest("hex");
    const supabase = await createSupabaseServerClient();
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data: rows, error } = await supabase.rpc("admin_create_sms_challenge", {
      p_admin_user_id: adminUserId, p_code_salt: salt, p_code_hash: hash,
    });
    if (error) throw new Error(error.message);
    const challenge = Array.isArray(rows) ? rows[0] : rows;
    if (!challenge?.phone_e164) throw new Error("Save a valid reviewer phone number first.");
    await sendTransactionalSms({
      recipient: challenge.phone_e164,
      content: `Your Velle manager SMS verification code is ${code}. It expires in 10 minutes.`,
      tag: "admin-sms-verification",
    });
    revalidatePath("/admin");
    return { ok: true, message: "Verification code sent. It expires in 10 minutes." };
  } catch (error) {
    return smsActionError(error);
  }
}

export async function confirmAdminSmsVerification(_state: AdminSmsActionState, data: FormData): Promise<AdminSmsActionState> {
  try {
    await requireSuperAdmin();
    const adminUserId = z.string().uuid().parse(value(data, "admin_user_id"));
    const code = z.string().regex(/^\d{6}$/, "Enter the six-digit verification code.").parse(value(data, "verification_code"));
    const supabase = await createSupabaseServerClient();
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data: verified, error } = await supabase.rpc("admin_confirm_sms_challenge", {
      p_admin_user_id: adminUserId, p_code: code,
    });
    if (error) throw new Error(error.message);
    if (!verified) throw new Error("The verification code is invalid, expired, or has too many failed attempts.");
    revalidatePath("/admin");
    return { ok: true, message: "Phone number verified. SMS alerts can now be enabled." };
  } catch (error) {
    return smsActionError(error);
  }
}

export async function setAdminSmsEnabled(_state: AdminSmsActionState, data: FormData): Promise<AdminSmsActionState> {
  try {
    await requireSuperAdmin();
    const adminUserId = z.string().uuid().parse(value(data, "admin_user_id"));
    const enabled = value(data, "enabled") === "true";
    const supabase = await createSupabaseServerClient();
    if (!supabase) throw new Error("Supabase is not configured.");
    const { error } = await supabase.rpc("admin_set_sms_enabled", { p_admin_user_id: adminUserId, p_enabled: enabled });
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
    return { ok: true, message: enabled ? "SMS alerts enabled." : "SMS alerts disabled." };
  } catch (error) {
    return smsActionError(error);
  }
}

const notificationEventSchema = z.enum([
  "order_created",
  "payment_submission_created",
  "payment_amount_mismatch",
  "payment_approved",
]);
const notificationChannelSchema = z.enum(["sms", "hark"]);

export async function uploadHarkNotificationImage(_state: ProductMediaUploadResult, data: FormData): Promise<ProductMediaUploadResult> {
  try {
    await requireSuperAdmin();
    const eventType = notificationEventSchema.parse(value(data, "event_type"));
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok:false, message:"Choose an image to upload." };
    if (file.size > 5_242_880) return { ok:false, message:"Images must be 5 MB or smaller." };
    const types: Record<string,{ext:string;signature:number[]}> = {
      "image/jpeg": { ext:"jpg", signature:[0xff,0xd8,0xff] },
      "image/png": { ext:"png", signature:[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a] },
      "image/webp": { ext:"webp", signature:[0x52,0x49,0x46,0x46] },
    };
    const spec = types[file.type];
    if (!spec) return { ok:false, message:"Use a JPG, PNG, or WebP image." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const signatureOk = spec.signature.every((byte,index) => bytes[index]===byte)
      && (file.type!=="image/webp" || String.fromCharCode(...bytes.slice(8,12))==="WEBP");
    if (!signatureOk) return { ok:false, message:"The file contents do not match its image type." };
    const path = `notifications/${eventType}/${crypto.randomUUID()}.${spec.ext}`;
    const db = createSupabaseServiceClient();
    const { error } = await db.storage.from("product-media").upload(path,bytes,{
      contentType:file.type,cacheControl:"31536000",upsert:false,
    });
    if (error) return { ok:false, message:error.message };
    return { ok:true, path, url:db.storage.from("product-media").getPublicUrl(path).data.publicUrl };
  } catch (error) {
    return { ok:false, message:error instanceof Error ? error.message : "Unable to upload the Hark image." };
  }
}

export async function setNotificationRoute(_state: AdminSmsActionState, data: FormData): Promise<AdminSmsActionState> {
  try {
    await requireSuperAdmin();
    const eventType = notificationEventSchema.parse(value(data, "event_type"));
    const channel = notificationChannelSchema.parse(value(data, "channel"));
    const enabled = value(data, "enabled") === "true";
    const supabase = await createSupabaseServerClient();
    if (!supabase) throw new Error("Supabase is not configured.");
    const { error } = await supabase.rpc("admin_set_notification_route", {
      p_event_type: eventType, p_channel: channel, p_enabled: enabled,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
    return { ok: true, message: `${channel === "sms" ? "SMS" : "Hark"} routing ${enabled ? "enabled" : "disabled"}.` };
  } catch (error) {
    return smsActionError(error);
  }
}

const notificationTestContent: Record<z.infer<typeof notificationEventSchema>, { title: string; body: string }> = {
  order_created: { title: "Velle · Test new order", body: "TEST-1001 was created for $125.00." },
  payment_submission_created: { title: "Velle · Test payment submitted", body: "Payment submitted for TEST-1001: $125.00 via test method." },
  payment_amount_mismatch: { title: "Velle · Test payment mismatch", body: "TEST-1001 reported $100.00 via test method; expected $125.00." },
  payment_approved: { title: "Velle · Test payment approved", body: "Payment for TEST-1001 was approved." },
};
const notificationTemplateVariables: Record<z.infer<typeof notificationEventSchema>, string[]> = {
  order_created: ["orderNumber","total"],
  payment_submission_created: ["orderNumber","reportedAmount","method"],
  payment_amount_mismatch: ["orderNumber","reportedAmount","method","expectedAmount"],
  payment_approved: ["orderNumber"],
};
const notificationTestVariables: Record<string,string> = {
  orderNumber: "TEST-1001", total: "$125.00", reportedAmount: "$100.00",
  expectedAmount: "$125.00", method: "test method",
};
const renderNotificationTemplate = (template: string) =>
  template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (token, key: string) => notificationTestVariables[key] ?? token);

export async function saveHarkNotificationTemplate(_state: AdminSmsActionState, data: FormData): Promise<AdminSmsActionState> {
  try {
    await requireSuperAdmin();
    const eventType = notificationEventSchema.parse(value(data, "event_type"));
    const title = z.string().trim().min(1, "Enter a notification title.").max(80, "Titles are limited to 80 characters.").parse(value(data, "title_template"));
    const body = z.string().trim().min(1, "Enter a notification body.").max(2000, "Bodies are limited to 2,000 characters.").parse(value(data, "body_template"));
    const imageValue = value(data, "image_url").trim();
    const imageUrl = imageValue
      ? z.url("Enter a valid image URL.").max(2048, "Image URLs are limited to 2,048 characters.")
        .refine(url => new URL(url).protocol === "https:", "Image URLs must use HTTPS.").parse(imageValue)
      : "";
    const allowed = new Set(notificationTemplateVariables[eventType]);
    const placeholders = [...`${title} ${body}`.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]);
    const unknown = placeholders.find(placeholder => !allowed.has(placeholder));
    if (unknown) throw new Error(`{${unknown}} is not available for this event.`);
    const supabase = await createSupabaseServerClient();
    if (!supabase) throw new Error("Supabase is not configured.");
    const { error } = await supabase.rpc("admin_update_hark_template", {
      p_event_type: eventType, p_title_template: title, p_body_template: body, p_image_url: imageUrl,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
    return { ok: true, message: "Hark notification saved." };
  } catch (error) {
    return smsActionError(error);
  }
}

export async function sendNotificationRouteTest(_state: AdminSmsActionState, data: FormData): Promise<AdminSmsActionState> {
  try {
    const user = await requireSuperAdmin();
    const eventType = notificationEventSchema.parse(value(data, "event_type"));
    const channel = notificationChannelSchema.parse(value(data, "channel"));
    const content = notificationTestContent[eventType];
    const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");
    if (!baseUrl) throw new Error("APP_BASE_URL is not configured.");
    const testUrl = `${baseUrl}/admin?view=settings`;
    const db = createSupabaseServiceClient();
    let accepted = 0;

    if (channel === "sms") {
      const [{ data: preferences, error: preferencesError }, { data: assignments, error: assignmentsError }] = await Promise.all([
        db.from("admin_sms_preferences").select("admin_user_id,phone_e164").eq("is_enabled",true).not("verified_at","is",null),
        db.from("admin_role_assignments").select("user_id").eq("is_active",true).in("role",["payment_reviewer","manager","super_admin"]),
      ]);
      if (preferencesError || assignmentsError) throw new Error("Unable to read eligible SMS recipients.");
      const eligibleIds = new Set((assignments ?? []).map(row => row.user_id));
      const recipients = (preferences ?? []).filter(row => eligibleIds.has(row.admin_user_id));
      if (!recipients.length) throw new Error("No verified and enabled SMS reviewers are available.");
      const results = await Promise.allSettled(recipients.map(recipient => sendTransactionalSms({
        recipient: recipient.phone_e164,
        content: `[TEST] ${content.title}: ${content.body} Open: ${testUrl}`,
        tag: `test-${eventType}`.slice(0, 50),
      })));
      accepted = results.filter(result => result.status === "fulfilled").length;
      if (!accepted) throw new Error("Brevo rejected every test SMS.");
    } else {
      const webhookUrl = process.env.HARK_WEBHOOK_URL;
      if (!webhookUrl) throw new Error("HARK_WEBHOOK_URL is not configured.");
      const parsed = new URL(webhookUrl);
      if (parsed.protocol !== "https:" || parsed.hostname !== "hark.ryan.ceo" || !/^\/hooks\/[^/]+$/.test(parsed.pathname)) {
        throw new Error("HARK_WEBHOOK_URL is not a valid Hark webhook.");
      }
      const { data: template, error: templateError } = await db.from("notification_hark_templates")
        .select("title_template,body_template,image_url").eq("event_type",eventType).single();
      if (templateError || !template) throw new Error("The Hark notification template is unavailable.");
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": `velle-test-${crypto.randomUUID()}` },
        body: JSON.stringify({
          title: renderNotificationTemplate(template.title_template),
          body: `[TEST] ${renderNotificationTemplate(template.body_template)}`,
          ...(template.image_url ? { imageUrl: template.image_url } : {}),
          url: testUrl,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      const result = await response.json().catch(() => ({})) as { delivered?: unknown };
      if (response.status !== 200 && response.status !== 202) throw new Error(`Hark test failed (${response.status}).`);
      accepted = typeof result.delivered === "number" ? result.delivered : 0;
    }

    await db.from("audit_events").insert({
      event_type: "notification.test_sent", actor_type: "admin", actor_id: user.id,
      new_value: { notification_event_type: eventType, channel, accepted },
      metadata: { test: true },
    });
    return {
      ok: true,
      message: channel === "sms"
        ? `Test SMS sent to ${accepted} reviewer${accepted === 1 ? "" : "s"}.`
        : accepted ? `Hark accepted the test for ${accepted} device${accepted === 1 ? "" : "s"}.` : "Hark accepted the test; no device was registered.",
    };
  } catch (error) {
    return smsActionError(error);
  }
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
  if (!order || order.commerce_mode !== "production" || order.shipping_mode !== "shippo" || order.payment_status !== "verified" || order.fulfillment_status !== "ready_for_fulfillment") {
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
    await db.from("shippo_label_attempts").update({ status:"failed",error_code:"provider_error",provider_response:(error as {providerResponse?:unknown}).providerResponse??{},completed_at:new Date().toISOString() }).eq("id",attempt.id);
    throw error;
  }
  revalidatePath("/admin");
}

export async function changeShippingSettings(data: FormData) {
  const user=await requireSuperAdmin();
  const mode=z.enum(["shippo","manual_free","manual_fixed"]).parse(value(data,"shipping_mode"));
  const fixedPrice=Math.round(z.coerce.number().min(0).max(10000).parse(value(data,"fixed_price"))*100);
  const expectedVersion=z.coerce.number().int().positive().parse(value(data,"expected_version"));
  const current=await getShippingSettings();
  if(current.version!==expectedVersion)throw new Error("Shipping settings changed in another session. Refresh and try again.");
  const db=createSupabaseServiceClient();
  const {error}=await db.rpc("set_shipping_settings",{p_actor_id:user.id,p_mode:mode,p_fixed_price_cents:fixedPrice,p_expected_version:expectedVersion});
  if(error)throw new Error(error.message);
  revalidatePath("/","layout");
}

export async function recordManualShipment(data:FormData){
  const {supabase,user}=await requireAdmin();
  const {data:allowed}=await supabase.rpc("has_admin_role",{allowed:["fulfillment","manager","super_admin"]});
  if(!allowed)throw new Error("Fulfillment authorization is required.");
  const input=z.object({orderId:z.uuid(),carrier:z.string().trim().min(2).max(80),trackingNumber:z.string().trim().min(3).max(160),trackingUrl:z.union([z.literal(""),z.url()]),idempotencyKey:z.uuid()}).parse({
    orderId:value(data,"order_id"),carrier:value(data,"carrier"),trackingNumber:value(data,"tracking_number"),trackingUrl:value(data,"tracking_url"),idempotencyKey:value(data,"idempotency_key"),
  });
  const db=createSupabaseServiceClient();
  const {data:order}=await db.from("orders").select("*").eq("id",input.orderId).single();
  if(!order||order.commerce_mode!=="production"||!["manual_free","manual_fixed"].includes(order.shipping_mode)||order.payment_status!=="verified"||order.fulfillment_status!=="ready_for_fulfillment")throw new Error("Manual shipment requires an approved manual-shipping order.");
  const {error}=await db.from("manual_shipments").insert({order_id:order.id,commerce_mode:order.commerce_mode,shipping_mode:order.shipping_mode,carrier:input.carrier,tracking_number:input.trackingNumber,tracking_url:input.trackingUrl||null,idempotency_key:input.idempotencyKey,created_by:user.id});
  if(error&&!error.message.includes("duplicate"))throw new Error(error.message);
  await db.from("orders").update({fulfillment_status:"shipped",order_status:"processing",updated_at:new Date().toISOString()}).eq("id",order.id);
  await db.from("audit_events").insert({order_id:order.id,event_type:"shipment.manual_recorded",actor_type:"admin",actor_id:user.id,commerce_mode:order.commerce_mode,new_value:{carrier:input.carrier,tracking_number:input.trackingNumber}});
  try{await sendOrderLifecycleEmail({buyerEmail:order.customer_email,orderNumber:order.order_number,event:"Shipment created",detail:`Your order shipped with ${input.carrier}. Tracking: ${input.trackingNumber}`,idempotencyKey:`manual-shipped:${order.id}`,commerceMode:"production"});}catch{}
  revalidatePath("/admin");
}

export async function markManualShipmentDelivered(data:FormData){
  const {supabase,user}=await requireAdmin();
  const {data:allowed}=await supabase.rpc("has_admin_role",{allowed:["fulfillment","manager","super_admin"]});
  if(!allowed)throw new Error("Fulfillment authorization is required.");
  const orderId=z.string().uuid().parse(value(data,"order_id"));const db=createSupabaseServiceClient();
  const {data:order}=await db.from("orders").select("*,manual_shipments!inner(id,status)").eq("id",orderId).single();
  if(!order||order.fulfillment_status!=="shipped"||!["manual_free","manual_fixed"].includes(order.shipping_mode))throw new Error("Manual shipment is not eligible for delivery.");
  await db.from("manual_shipments").update({status:"delivered",delivered_by:user.id,delivered_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("order_id",order.id);
  await db.from("orders").update({fulfillment_status:"delivered",order_status:"completed",updated_at:new Date().toISOString()}).eq("id",order.id);
  try{await sendOrderLifecycleEmail({buyerEmail:order.customer_email,orderNumber:order.order_number,event:"Delivered",detail:"Your order has been marked delivered.",idempotencyKey:`manual-delivered:${order.id}`,commerceMode:"production"});}catch{}
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
    p_product: { slug: product.slug, title: product.title, description: product.description, category: product.category, status: product.status,
      primary_image_path:product.primaryImagePath,primary_image_alt:product.primaryImageAlt,context_document:product.contextDocument,
      context_image_path:product.contextImagePath,context_image_alt:product.contextImageAlt },
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
