import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { sendOrderLifecycleEmail } from "@/lib/providers/brevo";

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
  let payload: any;
  try { payload = JSON.parse(body); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const data = payload.data ?? payload;
  const transactionId = data.transaction ?? data.object_id;
  const trackingNumber = data.tracking_number;
  const db = createSupabaseServiceClient();
  let query = db.from("shippo_shipments").select("*,orders!inner(order_number,customer_email,commerce_mode)");
  if (transactionId) query = query.eq("transaction_id", transactionId);
  else if (trackingNumber) query = query.eq("tracking_number", trackingNumber);
  else return Response.json({ received: true });
  const { data: shipment } = await query.maybeSingle();
  if (shipment) {
    const rawStatus = String(data.tracking_status?.status ?? data.tracking_status ?? data.status ?? "").toUpperCase();
    const status = rawStatus === "DELIVERED" ? "delivered" : rawStatus === "TRANSIT" ? "in_transit"
      : rawStatus.includes("REFUND") ? "refund_pending" : shipment.status;
    await db.from("shippo_shipments").update({ status, transaction_status: data.status ?? shipment.transaction_status, provider_response: data, updated_at: new Date().toISOString() }).eq("id",shipment.id);
    if (status === "delivered" || status === "in_transit") {
      const order = Array.isArray(shipment.orders) ? shipment.orders[0] : shipment.orders;
      await db.from("orders").update({ fulfillment_status: status === "delivered" ? "delivered" : "shipped", order_status: status === "delivered" ? "completed" : "processing", updated_at: new Date().toISOString() }).eq("id",shipment.order_id);
      try { await sendOrderLifecycleEmail({ buyerEmail:order.customer_email,orderNumber:order.order_number,event:status === "delivered" ? "Delivered" : "Shipment progress",detail:status === "delivered" ? "Shippo reports that your order was delivered." : "Your shipment is in transit.",idempotencyKey:`shippo:${shipment.id}:${rawStatus}`,commerceMode:order.commerce_mode }); } catch {}
    }
  }
  return Response.json({ received: true });
}
