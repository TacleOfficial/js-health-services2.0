import { createClient } from "npm:@supabase/supabase-js@2";

type Delivery = {
  delivery_id: string;
  phone_e164: string;
  event_type: string;
  payload: { orderNumber?: string; paymentSubmissionId?: string };
  attempt_count: number;
};

const transientStatus = (status: number) => status === 408 || status === 429 || status >= 500;
const money = (cents: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
}).format(cents / 100);

Deno.serve(async (request) => {
  const secret = Deno.env.get("ADMIN_PUSH_WEBHOOK_SECRET");
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (Deno.env.get("ADMIN_SMS_ENABLED") !== "true") {
    return Response.json({ claimed: 0, channel: "sms", enabled: false });
  }

  const apiKey = Deno.env.get("BREVO_API_KEY");
  const sender = (Deno.env.get("BREVO_SMS_SENDER") ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 11) || "Velle";
  const baseUrl = Deno.env.get("APP_BASE_URL")?.replace(/\/$/, "");
  if (!apiKey || !baseUrl) {
    return Response.json({ error: "Brevo SMS configuration is incomplete" }, { status: 503 });
  }

  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await client.rpc("claim_admin_sms_deliveries", { p_limit: 50 });
  if (error) return Response.json({ error: "Unable to claim SMS deliveries" }, { status: 500 });

  const deliveries = (data ?? []) as Delivery[];
  const stats = { claimed: deliveries.length, sent: 0, retried: 0, failed: 0 };
  for (const delivery of deliveries) {
    try {
      const submissionId = delivery.payload.paymentSubmissionId;
      if (!submissionId || !delivery.payload.orderNumber) throw new Error("invalid_notification_payload");
      const { data: submission, error: submissionError } = await client
        .from("payment_submissions").select("amount_reported_cents,method").eq("id", submissionId).single();
      if (submissionError || !submission) throw new Error("payment_submission_unavailable");

      const content = `Velle: Payment submitted for ${delivery.payload.orderNumber}: ${money(submission.amount_reported_cents)} via ${String(submission.method).replace("_", " ")}. Review: ${baseUrl}/admin/payments/${submissionId}`;
      const response = await fetch("https://api.brevo.com/v3/transactionalSMS/send", {
        method: "POST",
        headers: { "api-key": apiKey, accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          sender, recipient: delivery.phone_e164.replace(/^\+/, ""), content,
          type: "transactional", tag: delivery.event_type, organisationPrefix: "Velle",
        }),
      });
      if (!response.ok) {
        const retry = transientStatus(response.status);
        await client.from("notification_deliveries").update({
          status: retry ? "pending" : "failed",
          next_attempt_at: retry ? new Date(Date.now() + Math.min(3_600_000, 60_000 * 2 ** Math.max(0, delivery.attempt_count - 1))).toISOString() : new Date().toISOString(),
          processing_started_at: null, last_error_code: `brevo_http_${response.status}`, updated_at: new Date().toISOString(),
        }).eq("id", delivery.delivery_id);
        if (retry) stats.retried++;
        else stats.failed++;
        continue;
      }
      const result = await response.json() as { messageId: number };
      await client.from("notification_deliveries").update({
        status: "sent", provider_message_id: String(result.messageId), provider_status: "sent",
        sent_at: new Date().toISOString(), processing_started_at: null, updated_at: new Date().toISOString(),
      }).eq("id", delivery.delivery_id);
      stats.sent++;
    } catch (error) {
      const retry = delivery.attempt_count < 5;
      await client.from("notification_deliveries").update({
        status: retry ? "pending" : "failed", processing_started_at: null,
        next_attempt_at: retry ? new Date(Date.now() + Math.min(3_600_000, 60_000 * 2 ** Math.max(0, delivery.attempt_count - 1))).toISOString() : new Date().toISOString(),
        last_error_code: error instanceof Error ? error.message.slice(0, 100) : "worker_error",
        updated_at: new Date().toISOString(),
      }).eq("id", delivery.delivery_id);
      if (retry) stats.retried++;
      else stats.failed++;
    }
  }
  return Response.json({ ...stats, channel: "sms", enabled: true });
});
