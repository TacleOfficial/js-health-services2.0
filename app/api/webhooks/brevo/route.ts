import { timingSafeEqual } from "node:crypto";

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
  const event: unknown = await request.json();
  // Persistence is activated after the Supabase project is connected.
  return Response.json({ received: true, eventType: typeof event === "object" ? "brevo.event" : "unknown" });
}
