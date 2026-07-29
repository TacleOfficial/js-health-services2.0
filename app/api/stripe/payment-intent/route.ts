import { requireCustomer } from "@/lib/account";
import { getStripe, stripeReady } from "@/lib/stripe";

export async function POST(request: Request) {
  const { supabase, user } = await requireCustomer();
  if (!stripeReady()) return Response.json({ error: "Stripe is unavailable" }, { status: 503 });
  const { orderId } = await request.json();
  const [{ data: config }, { data: order }] = await Promise.all([
    supabase.from("payment_method_configs").select("is_active").eq("method", "stripe_card").single(),
    supabase.from("orders").select("id,order_number,total_cents,currency").eq("id", orderId).eq("customer_user_id", user.id).single(),
  ]);
  if (!config?.is_active) return Response.json({ error: "Card payments are disabled" }, { status: 403 });
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  const stripe = getStripe()!;
  const intent = await stripe.paymentIntents.create({
    amount: order.total_cents, currency: order.currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    metadata: { order_id: order.id, order_number: order.order_number, user_id: user.id },
  }, { idempotencyKey: `order:${order.id}` });
  return Response.json({ clientSecret: intent.client_secret });
}
