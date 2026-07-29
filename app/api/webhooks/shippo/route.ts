import { createHmac, timingSafeEqual } from "node:crypto";

export async function POST(request: Request) {
  const body = await request.text();
  const secret = process.env.SHIPPO_WEBHOOK_SECRET;
  const signature = request.headers.get("x-shippo-signature");
  if (!secret || !signature) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  return Response.json({ received: true });
}
