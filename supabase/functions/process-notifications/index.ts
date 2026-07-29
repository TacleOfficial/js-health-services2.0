import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (request) => {
  const secret = Deno.env.get("ADMIN_PUSH_WEBHOOK_SECRET");
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: events, error } = await client
    .from("notification_outbox")
    .select("id,event_type,aggregate_id,payload,attempt_count")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .limit(50);
  if (error) return Response.json({ error: "Unable to claim notifications" }, { status: 500 });
  // Sending is deliberately feature-gated until EXPO_ACCESS_TOKEN and recipient
  // selection are configured. Outbox records remain durable and retryable.
  return Response.json({ claimed: events?.length ?? 0, provider: "expo", enabled: false });
});
