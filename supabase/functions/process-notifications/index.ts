import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

type BaseDelivery = {
  delivery_id: string;
  outbox_id: string;
  event_type: string;
  aggregate_id: string;
  payload: { orderId?: string; orderNumber?: string; paymentSubmissionId?: string };
  attempt_count: number;
};
type SmsDelivery = BaseDelivery & { recipient_user_id: string; phone_e164: string };
type HarkResult = { ok?: boolean; eventId?: string; delivered?: number; error?: string; retryAfterSeconds?: number };
type ChannelStats = {
  enabled: boolean; configured: boolean; claimed: number; sent: number; retried: number; failed: number;
};

const transientStatus = (status: number) => status === 408 || status === 429 || status === 502 || status >= 500;
const money = (cents: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
}).format(cents / 100);
const retryAt = (attemptCount: number, retryAfterSeconds?: number) =>
  new Date(Date.now() + (retryAfterSeconds
    ? Math.min(3_600_000, retryAfterSeconds * 1_000)
    : Math.min(3_600_000, 60_000 * 2 ** Math.max(0, attemptCount - 1)))).toISOString();
const safeJson = async (response: Response) => {
  try { return await response.json() as Record<string, unknown>; }
  catch { return {}; }
};

async function notificationContent(client: SupabaseClient, delivery: BaseDelivery) {
  const orderId = delivery.payload.orderId ?? delivery.aggregate_id;
  const { data: order, error: orderError } = await client
    .from("orders").select("order_number,total_cents").eq("id", orderId).single();
  if (orderError || !order) throw new Error("order_unavailable");
  const orderNumber = delivery.payload.orderNumber ?? order.order_number;
  const orderUrl = `/admin/orders/${orderId}`;

  if (delivery.event_type === "order_created") {
    return {
      title: "Velle · New order", body: `${orderNumber} was created for ${money(order.total_cents)}.`, route: orderUrl,
      variables: { orderNumber, total: money(order.total_cents) },
    };
  }
  if (delivery.event_type === "payment_approved") {
    return {
      title: "Velle · Payment approved", body: `Payment for ${orderNumber} was approved.`, route: orderUrl,
      variables: { orderNumber },
    };
  }

  const submissionId = delivery.payload.paymentSubmissionId;
  if (!submissionId) throw new Error("invalid_notification_payload");
  const { data: submission, error: submissionError } = await client
    .from("payment_submissions").select("amount_reported_cents,method").eq("id", submissionId).single();
  if (submissionError || !submission) throw new Error("payment_submission_unavailable");
  const method = String(submission.method).replaceAll("_", " ");
  const route = `/admin/payments/${submissionId}`;
  if (delivery.event_type === "payment_amount_mismatch") {
    return {
      title: "Velle · Payment mismatch",
      body: `${orderNumber} reported ${money(submission.amount_reported_cents)} via ${method}; expected ${money(order.total_cents)}.`,
      route,
      variables: {
        orderNumber, reportedAmount: money(submission.amount_reported_cents),
        method, expectedAmount: money(order.total_cents),
      },
    };
  }
  if (delivery.event_type === "payment_submission_created") {
    return {
      title: "Velle · Payment submitted",
      body: `Payment submitted for ${orderNumber}: ${money(submission.amount_reported_cents)} via ${method}.`,
      route,
      variables: { orderNumber, reportedAmount: money(submission.amount_reported_cents), method },
    };
  }
  throw new Error("unsupported_notification_event");
}

async function applyHarkTemplate(
  client: SupabaseClient, eventType: string,
  fallback: { title: string; body: string; variables: Record<string,string> },
) {
  const { data, error } = await client.from("notification_hark_templates")
    .select("title_template,body_template,image_url").eq("event_type",eventType).single();
  if (error || !data) throw new Error("hark_template_unavailable");
  const render = (template: string) =>
    template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (token, key: string) => fallback.variables[key] ?? token);
  return { title: render(data.title_template), body: render(data.body_template), imageUrl: data.image_url as string|null };
}

async function updateFailure(
  client: SupabaseClient, delivery: BaseDelivery, stats: ChannelStats,
  code: string, retry: boolean, retryAfterSeconds?: number, providerResponse?: Record<string, unknown>,
) {
  const canRetry = retry && delivery.attempt_count < 5;
  await client.from("notification_deliveries").update({
    status: canRetry ? "pending" : "failed",
    next_attempt_at: canRetry ? retryAt(delivery.attempt_count, retryAfterSeconds) : new Date().toISOString(),
    processing_started_at: null,
    last_error_code: code.slice(0, 100),
    provider_response: providerResponse ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", delivery.delivery_id);
  if (canRetry) stats.retried++;
  else stats.failed++;
}

async function processSms(client: SupabaseClient, baseUrl: string, apiKey: string, sender: string) {
  const stats: ChannelStats = { enabled: true, configured: true, claimed: 0, sent: 0, retried: 0, failed: 0 };
  const { data, error } = await client.rpc("claim_admin_sms_deliveries", { p_limit: 50 });
  if (error) throw new Error("Unable to claim SMS deliveries");
  const deliveries = (data ?? []) as SmsDelivery[];
  stats.claimed = deliveries.length;
  for (const delivery of deliveries) {
    try {
      const content = await notificationContent(client, delivery);
      const response = await fetch("https://api.brevo.com/v3/transactionalSMS/send", {
        method: "POST",
        headers: { "api-key": apiKey, accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          sender,
          recipient: delivery.phone_e164.replace(/^\+/, ""),
          content: `${content.title}: ${content.body} Review: ${baseUrl}${content.route}`,
          type: "transactional",
          tag: delivery.event_type,
          organisationPrefix: "Velle",
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const result = await safeJson(response);
      if (!response.ok) {
        await updateFailure(client, delivery, stats, `brevo_http_${response.status}`, transientStatus(response.status), undefined, result);
        continue;
      }
      await client.from("notification_deliveries").update({
        status: "sent", provider_message_id: String(result.messageId ?? ""),
        provider_status: "sent", provider_response: result,
        sent_at: new Date().toISOString(), processing_started_at: null, updated_at: new Date().toISOString(),
      }).eq("id", delivery.delivery_id);
      stats.sent++;
    } catch (error) {
      await updateFailure(client, delivery, stats, error instanceof Error ? error.message : "sms_worker_error", true);
    }
  }
  return stats;
}

async function processHark(client: SupabaseClient, baseUrl: string, webhookUrl: string) {
  const stats: ChannelStats = { enabled: true, configured: true, claimed: 0, sent: 0, retried: 0, failed: 0 };
  const parsed = new URL(webhookUrl);
  if (parsed.protocol !== "https:" || parsed.hostname !== "hark.ryan.ceo" || !/^\/hooks\/[^/]+$/.test(parsed.pathname)) {
    throw new Error("HARK_WEBHOOK_URL is not a valid Hark webhook");
  }
  const { data, error } = await client.rpc("claim_admin_hark_deliveries", { p_limit: 50 });
  if (error) throw new Error("Unable to claim Hark deliveries");
  const deliveries = (data ?? []) as BaseDelivery[];
  stats.claimed = deliveries.length;
  for (const delivery of deliveries) {
    try {
      const content = await notificationContent(client, delivery);
      const harkContent = await applyHarkTemplate(client, delivery.event_type, content);
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `velle-${delivery.outbox_id}`,
        },
        body: JSON.stringify({
          title: harkContent.title,
          body: harkContent.body,
          ...(harkContent.imageUrl ? { imageUrl: harkContent.imageUrl } : {}),
          url: `${baseUrl}${content.route}`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const result = await safeJson(response) as HarkResult;
      if (response.status !== 200 && response.status !== 202) {
        const retryAfterHeader = Number(response.headers.get("retry-after"));
        const retryAfter = Number.isFinite(result.retryAfterSeconds)
          ? result.retryAfterSeconds
          : Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : undefined;
        await updateFailure(
          client, delivery, stats, `hark_http_${response.status}`, transientStatus(response.status),
          retryAfter, result as Record<string, unknown>,
        );
        continue;
      }
      const accepted = typeof result.delivered === "number" ? result.delivered : 0;
      await client.from("notification_deliveries").update({
        status: "sent",
        provider_message_id: result.eventId ?? null,
        provider_status: response.status === 202 ? "processing" : accepted === 0 ? "no_registered_device" : "accepted",
        accepted_device_count: accepted,
        provider_response: result,
        sent_at: new Date().toISOString(), processing_started_at: null, updated_at: new Date().toISOString(),
      }).eq("id", delivery.delivery_id);
      stats.sent++;
    } catch (error) {
      await updateFailure(client, delivery, stats, error instanceof Error ? error.message : "hark_worker_error", true);
    }
  }
  return stats;
}

Deno.serve(async (request) => {
  const secret = Deno.env.get("ADMIN_PUSH_WEBHOOK_SECRET");
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const baseUrl = Deno.env.get("APP_BASE_URL")?.replace(/\/$/, "");
  const smsEnabled = Deno.env.get("ADMIN_SMS_ENABLED") === "true";
  const harkEnabled = Deno.env.get("ADMIN_HARK_ENABLED") === "true";
  const apiKey = Deno.env.get("BREVO_API_KEY");
  const webhookUrl = Deno.env.get("HARK_WEBHOOK_URL");
  const sender = (Deno.env.get("BREVO_SMS_SENDER") ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 11) || "Velle";

  const sms: ChannelStats = {
    enabled: smsEnabled, configured: Boolean(apiKey && baseUrl), claimed: 0, sent: 0, retried: 0, failed: 0,
  };
  const hark: ChannelStats = {
    enabled: harkEnabled, configured: Boolean(webhookUrl && baseUrl), claimed: 0, sent: 0, retried: 0, failed: 0,
  };
  const errors: Record<string, string> = {};

  if (smsEnabled && apiKey && baseUrl) {
    try { Object.assign(sms, await processSms(client, baseUrl, apiKey, sender)); }
    catch (error) { errors.sms = error instanceof Error ? error.message : "SMS processing failed"; }
  } else if (smsEnabled) errors.sms = "Brevo SMS configuration is incomplete";

  if (harkEnabled && webhookUrl && baseUrl) {
    try { Object.assign(hark, await processHark(client, baseUrl, webhookUrl)); }
    catch (error) { errors.hark = error instanceof Error ? error.message : "Hark configuration or processing failed"; }
  } else if (harkEnabled) errors.hark = "Hark configuration is incomplete";

  return Response.json({ sms, hark, errors });
});
