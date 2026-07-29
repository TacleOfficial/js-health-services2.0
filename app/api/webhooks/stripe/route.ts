import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !signature || !secret) return Response.json({ error: "Webhook unavailable" }, { status: 503 });
  let event;
  try { event = stripe.webhooks.constructEvent(await request.text(), signature, secret); }
  catch { return Response.json({ error: "Invalid signature" }, { status: 400 }); }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { error: claimError } = await db.from("stripe_webhook_events").insert({ event_id: event.id, event_type: event.type });
  if (claimError?.code === "23505") return Response.json({ received: true, duplicate: true });
  if (claimError) return Response.json({ error: claimError.message }, { status: 500 });
  if (event.type === "checkout.session.completed" && event.data.object.mode === "setup") {
    const session = event.data.object;
    const setupIntent = await stripe.setupIntents.retrieve(String(session.setup_intent));
    const method = await stripe.paymentMethods.retrieve(String(setupIntent.payment_method));
    if (method.card && session.metadata?.user_id) await db.from("stripe_payment_methods").upsert({
      id: method.id, user_id: session.metadata.user_id, brand: method.card.brand, last4: method.card.last4,
      exp_month: method.card.exp_month, exp_year: method.card.exp_year,
    });
  }
  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    if (intent.metadata.order_id) await db.from("orders").update({ payment_status: "verified", order_status: "processing", fulfillment_status: "ready_for_fulfillment", verified_at: new Date().toISOString() }).eq("id", intent.metadata.order_id);
  }
  if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object;
    if (intent.metadata.order_id) await db.from("orders").update({ payment_status: "rejected", order_status: "awaiting_payment" }).eq("id", intent.metadata.order_id);
  }
  return Response.json({ received: true });
}
