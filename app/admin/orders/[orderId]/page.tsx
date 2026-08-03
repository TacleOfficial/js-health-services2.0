import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CreditCard, MapPin, Package } from "lucide-react";
import { CommerceShell } from "@/components/commerce-shell";
import { Badge, Button, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/account";
import { formatUsd } from "@/lib/commerce/money";
import { AdminOrderArchiveAction } from "@/components/admin-order-archive-action";

const tone = (status: string) =>
  ["verified","completed","delivered","ready_for_fulfillment"].includes(status) ? "verified" as const : "warm" as const;

export default async function AdminOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const route = `/admin/orders/${orderId}`;
  const { supabase } = await requireAdmin(route);
  const { data: order } = await supabase.from("orders")
    .select("*,order_items(*),payment_submissions(id,status,submitted_at,amount_reported_cents,method)")
    .eq("id",orderId).maybeSingle();
  if (!order) notFound();
  const address = (order.shipping_address ?? {}) as Record<string,string>;
  const submissions = order.payment_submissions ?? [];

  return <CommerceShell admin><main className="admin-page container admin-review-page">
    <Link href="/admin?view=orders" className="admin-back"><ArrowLeft/>Back to orders</Link>
    <div className="admin-heading">
      <div><span className="eyebrow">ORDER DETAIL</span><h1>{order.order_number}</h1><p>Created {new Date(order.created_at).toLocaleString()} · {order.customer_email}</p></div>
      <div className="admin-order-heading-actions">
        {order.archived_at && <Badge tone="neutral">archived</Badge>}
        <Badge tone={order.commerce_mode==="production"?"verified":"warm"}>{order.commerce_mode}</Badge>
        <AdminOrderArchiveAction orderId={order.id} orderNumber={order.order_number} archived={Boolean(order.archived_at)} />
      </div>
    </div>
    <div className="admin-order-detail-grid">
      <div>
        <Card className="admin-review-card">
          <div className="admin-data-head"><Package/><div><h2>Order items</h2><p>{formatUsd(order.total_cents)} total</p></div></div>
          {order.order_items.map((item: {id:string;product_title:string;variant_title:string;quantity:number;line_total_cents:number}) =>
            <div className="order-line" key={item.id}><div><strong>{item.product_title}</strong><span>{item.variant_title} · Qty {item.quantity}</span></div><strong>{formatUsd(item.line_total_cents)}</strong></div>)}
        </Card>
        <Card className="admin-review-card">
          <div className="admin-data-head"><CreditCard/><div><h2>Payment activity</h2><p>{submissions.length} submission{submissions.length===1?"":"s"}</p></div></div>
          {submissions.map((submission: {id:string;status:string;submitted_at:string;amount_reported_cents:number;method:string}) =>
            <div className="admin-payment-link" key={submission.id}>
              <span><strong>{formatUsd(submission.amount_reported_cents)} via {submission.method.replaceAll("_"," ")}</strong><small>{new Date(submission.submitted_at).toLocaleString()}</small></span>
              <Badge tone={tone(submission.status)}>{submission.status.replaceAll("_"," ")}</Badge>
              <Button asChild size="icon" variant="ghost"><Link href={`/admin/payments/${submission.id}`} aria-label="Open payment review"><ArrowUpRight/></Link></Button>
            </div>)}
          {!submissions.length && <p className="admin-note">No payment has been submitted.</p>}
        </Card>
      </div>
      <aside>
        <Card className="admin-review-card admin-order-summary-card">
          <h2>Status</h2>
          <dl className="admin-review-details">
            <div><dt>Order</dt><dd>{order.order_status.replaceAll("_"," ")}</dd></div>
            <div><dt>Payment</dt><dd>{order.payment_status.replaceAll("_"," ")}</dd></div>
            <div><dt>Fulfillment</dt><dd>{order.fulfillment_status.replaceAll("_"," ")}</dd></div>
            <div><dt>Shipping</dt><dd>{order.shipping_mode.replaceAll("_"," ")}</dd></div>
          </dl>
        </Card>
        <Card className="admin-review-card admin-order-summary-card">
          <div className="admin-data-head"><MapPin/><div><h2>Ship to</h2></div></div>
          <p>{address.recipient_name || address.name}<br/>{address.line1}<br/>{address.line2 && <>{address.line2}<br/></>}{address.city}, {address.region || address.state} {address.postal_code || address.postalCode}</p>
        </Card>
      </aside>
    </div>
  </main></CommerceShell>;
}
