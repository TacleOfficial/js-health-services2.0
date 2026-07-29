import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (request) => {
  const expected = Deno.env.get("SCHEDULED_JOB_SECRET");
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await client.rpc("expire_unpaid_orders", { p_limit: 100 });
  if (error) return Response.json({ error: "Expiration worker failed" }, { status: 500 });
  return Response.json({ expiredReservations: data });
});
