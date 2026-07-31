import "server-only";

export async function processNotificationsBestEffort() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.ADMIN_PUSH_WEBHOOK_SECRET;
  const enabled = process.env.ADMIN_SMS_ENABLED === "true" || process.env.ADMIN_HARK_ENABLED === "true";
  if (!baseUrl || !secret || !enabled) return;
  try {
    await fetch(`${baseUrl.replace(/\/$/, "")}/functions/v1/process-notifications`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
  } catch {
    // The durable outbox retains the event for the next scheduled/manual worker run.
  }
}
