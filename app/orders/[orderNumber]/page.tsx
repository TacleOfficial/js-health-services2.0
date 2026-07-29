import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Clock3, LockKeyhole, PackageCheck } from "lucide-react";
import { CommerceShell } from "@/components/commerce-shell";
import { Badge, Card } from "@/components/ui";
import { requireCustomer } from "@/lib/account";
import { formatUsd } from "@/lib/commerce/money";

export const metadata: Metadata = { title: "Order status · Private staging", robots: { index: false, follow: false } };

export default async function OrderStatusPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const { supabase, user } = await requireCustomer();
  const { data: order } = await supabase.from("orders").select("*,order_items(*),payment_submissions(*)").eq("order_number", orderNumber).eq("customer_user_id", user.id).maybeSingle();
  if (!order) notFound();
  const shipping = order.shipping_address as Record<string, string>;
  return <CommerceShell><main className="container order-status-page">
    <span className="eyebrow">SECURE ORDER STATUS</span>
    <div className="order-status-heading"><div><h1>{orderNumber}</h1><p>Placed {new Date(order.created_at).toLocaleDateString()} · {formatUsd(order.total_cents)}</p></div><Badge tone={order.payment_status === "verified" ? "verified" : "warm"}>{String(order.order_status).replaceAll("_", " ")}</Badge></div>
    <Card className="order-timeline">
      <div className="done"><Check/><span><strong>Order created</strong><small>{new Date(order.created_at).toLocaleString()}</small></span></div>
      <div className={order.payment_status === "verified" ? "done" : "current"}><Clock3/><span><strong>{String(order.payment_status).replaceAll("_", " ")}</strong><small>{order.payment_submissions?.length ? "Payment evidence received" : "Waiting for payment"}</small></span></div>
      <div className={order.payment_status === "verified" ? "done" : ""}><LockKeyhole/><span><strong>Payment review</strong><small>{order.verified_at ? `Verified ${new Date(order.verified_at).toLocaleString()}` : "Not yet verified"}</small></span></div>
      <div className={order.fulfillment_status === "delivered" ? "done" : order.payment_status === "verified" ? "current" : ""}><PackageCheck/><span><strong>{String(order.fulfillment_status).replaceAll("_", " ")}</strong><small>Fulfillment follows verified payment</small></span></div>
    </Card>
    <div className="order-detail-grid"><Card><h2>Items</h2>{order.order_items.map((item: {id:string; product_title:string; variant_title:string; quantity:number; line_total_cents:number}) => <div className="order-line" key={item.id}><div><strong>{item.product_title}</strong><span>{item.variant_title} · Qty {item.quantity}</span></div><strong>{formatUsd(item.line_total_cents)}</strong></div>)}</Card><Card><h2>Ship to</h2><p>{shipping?.recipient_name || shipping?.name}<br />{shipping?.line1}<br />{shipping?.line2 && <>{shipping.line2}<br /></>}{shipping?.city}, {shipping?.region || shipping?.state} {shipping?.postal_code || shipping?.postalCode}</p></Card></div>
    <p className="queue-footnote">Need help? <Link href="/account/support">Open a private support ticket</Link>.</p>
  </main></CommerceShell>;
}
