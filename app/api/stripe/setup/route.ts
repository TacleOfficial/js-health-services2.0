import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/account";
import { getStripe, stripeReady } from "@/lib/stripe";

export async function GET(request: Request) {
  const { supabase, user } = await requireCustomer();
  const { data: config } = await supabase.from("payment_method_configs").select("is_active").eq("method", "stripe_card").single();
  if (!config?.is_active || !stripeReady()) return NextResponse.json({ error: "Card setup is disabled" }, { status: 503 });
  const stripe = getStripe()!;
  let customerId: string | undefined;
  const { data: profile } = await supabase.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  customerId = profile?.stripe_customer_id ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
    customerId = customer.id;
    await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }
  const origin = new URL(request.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "setup", customer: customerId,
    success_url: `${origin}/account/payments?card=added`,
    cancel_url: `${origin}/account/payments?card=cancelled`,
    metadata: { user_id: user.id },
  });
  return NextResponse.redirect(session.url!);
}
