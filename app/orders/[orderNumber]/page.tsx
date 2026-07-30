import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Clock3, Info, LockKeyhole, PackageCheck } from "lucide-react";
import { CommerceShell } from "@/components/commerce-shell";
import { Badge, Button, Card, Input } from "@/components/ui";
import { getGuestOrderAccess } from "@/lib/commerce/guest-access";
import { formatUsd } from "@/lib/commerce/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { submitGuestPaymentReport } from "../actions";

export const metadata: Metadata = { title: "Order status · Private staging", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OrderStatusPage({
  params, searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ report?: string }>;
}) {
  const { orderNumber } = await params;
  const query = await searchParams;
  let order = null;
  let guest = false;
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const result = await supabase.from("orders").select("*,order_items(*),payment_submissions(*)")
        .eq("order_number",orderNumber).eq("customer_user_id",user.id).maybeSingle();
      order = result.data;
    }
  }
  if (!order) {
    order = await getGuestOrderAccess(orderNumber);
    guest = Boolean(order);
  }
  if (!order) notFound();

  const shipping = order.shipping_address as Record<string,string>;
  const hasSubmission = Boolean(order.payment_submissions?.length);
  const canReport = guest && !hasSubmission && order.order_status==="awaiting_payment" && new Date(order.expires_at)>new Date();
  const now = new Date();
  const date = now.toISOString().slice(0,10);
  const time = now.toISOString().slice(11,16);
  return <CommerceShell><main className="container order-status-page">
    <span className="eyebrow">SECURE STAGING ORDER STATUS</span>
    <div className="order-status-heading"><div><h1>{orderNumber}</h1><p>Placed {new Date(order.created_at).toLocaleDateString()} · {formatUsd(order.total_cents)}</p></div><Badge tone={order.payment_status==="verified"?"verified":"warm"}>{String(order.order_status).replaceAll("_"," ")}</Badge></div>
    {query.report==="submitted"?<div className="admin-success">Fictional payment details submitted for administrator review.</div>:null}
    {query.report==="invalid"||query.report==="failed"?<div className="demo-alert"><Info/><div><strong>Payment report not submitted</strong><p>Review the fictional payment details and try again.</p></div></div>:null}
    <Card className="order-timeline">
      <div className="done"><Check/><span><strong>Order created</strong><small>{new Date(order.created_at).toLocaleString()}</small></span></div>
      <div className={order.payment_status==="verified"?"done":"current"}><Clock3/><span><strong>{String(order.payment_status).replaceAll("_"," ")}</strong><small>{hasSubmission?"Fictional payment report received":"Waiting for fictional payment report"}</small></span></div>
      <div className={order.payment_status==="verified"?"done":""}><LockKeyhole/><span><strong>Payment review</strong><small>{order.verified_at?`Verified ${new Date(order.verified_at).toLocaleString()}`:"Not yet verified"}</small></span></div>
      <div className={order.fulfillment_status==="delivered"?"done":order.payment_status==="verified"?"current":""}><PackageCheck/><span><strong>{String(order.fulfillment_status).replaceAll("_"," ")}</strong><small>Test stops at ready for fulfillment</small></span></div>
    </Card>
    <div className="order-detail-grid">
      <Card><h2>Items</h2>{order.order_items.map((item:{id:string;product_title:string;variant_title:string;quantity:number;line_total_cents:number})=><div className="order-line" key={item.id}><div><strong>{item.product_title}</strong><span>{item.variant_title} · Qty {item.quantity}</span></div><strong>{formatUsd(item.line_total_cents)}</strong></div>)}</Card>
      <Card><h2>Ship to</h2><p>{shipping?.recipient_name||shipping?.name}<br/>{shipping?.line1}<br/>{shipping?.line2&&<>{shipping.line2}<br/></>}{shipping?.city}, {shipping?.region||shipping?.state} {shipping?.postal_code||shipping?.postalCode}</p><Badge tone={order.address_validation_status==="validated"?"verified":"warm"}>{order.address_validation_status==="validated"?"Shippo validated":"Address unverified"}</Badge></Card>
    </div>
    {canReport?<Card className="guest-payment-report">
      <span className="eyebrow">FICTIONAL PAYMENT REPORT</span><h2>Report a test payment</h2>
      <div className="truth-callout"><Info/><p><strong>Do not send funds.</strong> Use fictional details only. The administrator will test the manual review workflow.</p></div>
      <div className="instruction-panel compact-instructions"><dl>
        <div><dt>Fake destination</dt><dd>{order.payment_method==="zelle"?"test-only@example.invalid":"$TEST-NO-FUNDS"}</dd></div>
        <div><dt>Fictional memo</dt><dd>{order.order_number}</dd></div>
        <div><dt>Expected test amount</dt><dd>{formatUsd(order.total_cents)}</dd></div>
      </dl></div>
      <form action={submitGuestPaymentReport} className="form-grid">
        <input type="hidden" name="orderNumber" value={order.order_number}/><input type="hidden" name="idempotencyKey" value={crypto.randomUUID()}/>
        <label>Fictional sender name<Input name="senderName" required minLength={2} defaultValue="Staging Tester"/></label>
        <label>Fictional sender contact<Input name="senderContact" required defaultValue="test-only@example.invalid"/></label>
        <label>Reported amount<Input name="amount" required type="number" min="0.01" step="0.01" defaultValue={(order.total_cents/100).toFixed(2)}/></label>
        <label>Payment date<Input name="paymentDate" required type="date" defaultValue={date}/></label>
        <label>Approximate time<Input name="approximateTime" required type="time" defaultValue={time}/></label>
        <label>Fictional reference<Input name="transactionReference" defaultValue={`TEST-${order.order_number}`}/></label>
        <label className="wide">Customer note<Input name="customerNote" defaultValue="Fictional staging payment report. No funds were sent."/></label>
        <label className="check-row wide"><input name="fictionalAcknowledged" type="checkbox" required/><span>I confirm that no funds were sent and all payment details are fictional.</span></label>
        <div className="form-actions wide"><Button>Submit fictional payment report</Button></div>
      </form>
    </Card>:null}
    <p className="queue-footnote">Need help? <Link href="/support">Visit support</Link>.</p>
  </main></CommerceShell>;
}
