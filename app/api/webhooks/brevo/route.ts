import { timingSafeEqual } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

function validSecret(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!validSecret(request.headers.get("x-velle-webhook-secret"), process.env.BREVO_WEBHOOK_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body: unknown = await request.json();
  const events = Array.isArray(body) ? body : [body];
  const db = createSupabaseServiceClient();
  let updated = 0;
  const states: Record<string, string> = {
    sent: "sent", accepted: "sent", delivered: "delivered", replied: "replied",
    soft_bounce: "soft_bounce", hard_bounce: "hard_bounce",
    rejected: "rejected", blacklisted: "rejected", skipped: "rejected",
  };
  for (const raw of events) {
    if (!raw || typeof raw !== "object") continue;
    const event = raw as Record<string, unknown>;
    const messageId = event.messageId;
    const providerStatus = String(event.msg_status ?? event.event ?? "").toLowerCase().replaceAll(" ", "_");
    const status = states[providerStatus];
    if (messageId === undefined || !status) continue;
    const now = new Date().toISOString();
    const { data } = await db.from("notification_deliveries").update({
      status, provider_status: providerStatus, updated_at: now,
      ...(status === "delivered" ? { delivered_at: now } : {}),
    }).eq("provider", "brevo").eq("provider_message_id", String(messageId)).select("id");
    updated += data?.length ?? 0;
  }
  return Response.json({ received: true, updated });
}
