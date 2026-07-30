import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Clock3, Info, LockKeyhole, PackageCheck } from "lucide-react";
import { CommerceShell } from "@/components/commerce-shell";
import { Badge, Button, Card, Input } from "@/components/ui";
import { getGuestOrderAccess } from "@/lib/commerce/guest-access";
import { formatUsd } from "@/lib/commerce/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { claimGuestOrder, submitGuestPaymentReport } from "../actions";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "Order status · Private staging", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OrderStatusPage({
  params, searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ report?: string; email?: string }>;
}) {
  const { orderNumber } = await params;
  const query = await searchParams;
  let order = null;
  let guest = false;
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const result = await supabase.from("orders").select("*,order_items(*),payment_submissions(*),manual_shipments(*)")
        .eq("order_number",orderNumber).eq("customer_user_id",user.id).maybeSingle();
      order = result.data;
    }
  }
  if (!order) {
    order = await getGuestOrderAccess(orderNumber);
    guest = Boolean(order);
  }
  if (!order) notFound();
  const mode = order.commerce_mode ?? "staging";
  const service = createSupabaseServiceClient();
  const { data: paymentConfig } = await service.from("payment_method_configs").select("destination_name,destination_value").eq("method",order.payment_method).single();

  const shipping = order.shipping_address as Record<string,string>;
  const hasSubmission = Boolean(order.payment_submissions?.length);
  const canReport = guest && !hasSubmission && order.order_status==="awaiting_payment" && new Date(order.expires_at)>new Date();
  const now = new Date();
  const date = now.toISOString().slice(0,10);
  const time = now.toISOString().slice(11,16);
  return <CommerceShell><main className="container order-status-page">
    <span className="eyebrow">SECURE {String(mode).toUpperCase()} ORDER STATUS</span>
    <div className="order-status-heading"><div><h1>{orderNumber}</h1><p>Placed {new Date(order.created_at).toLocaleDateString()} · {formatUsd(order.total_cents)}</p></div><Badge tone={order.payment_status==="verified"?"verified":"warm"}>{String(order.order_status).replaceAll("_"," ")}</Badge></div>
    {guest&&<form action={claimGuestOrder} className="claim-order-form"><input type="hidden" name="orderNumber" value={order.order_number}/><span>Signed in with the buyer email?</span><Button variant="outline">Claim this order</Button></form>}
    {query.report==="submitted"?<div className="admin-success">Payment details submitted for administrator review.</div>:null}
    {query.email==="failed"?<div className="demo-alert"><Info/><div><strong>Staging email not delivered</strong><p>The order is safe and accessible in this browser, but its controlled-inbox access email needs to be retried.</p></div></div>:null}
    {query.report==="invalid"||query.report==="failed"?<div className="demo-alert"><Info/><div><strong>Payment report not submitted</strong><p>Review the fictional payment details and try again.</p></div></div>:null}
    <Card className="order-timeline">
      <div className="done"><Check/><span><strong>Order created</strong><small>{new Date(order.created_at).toLocaleString()}</small></span></div>
      <div className={order.payment_status==="verified"?"done":"current"}><Clock3/><span><strong>{String(order.payment_status).replaceAll("_"," ")}</strong><small>{hasSubmission?"Payment report received":"Waiting for payment report"}</small></span></div>
      <div className={order.payment_status==="verified"?"done":""}><LockKeyhole/><span><strong>Payment review</strong><small>{order.verified_at?`Verified ${new Date(order.verified_at).toLocaleString()}`:"Not yet verified"}</small></span></div>
      <div className={order.fulfillment_status==="delivered"?"done":order.payment_status==="verified"?"current":""}><PackageCheck/><span><strong>{String(order.fulfillment_status).replaceAll("_"," ")}</strong><small>{mode==="staging"?"Test stops at ready for fulfillment":"A label is purchased only after payment approval"}</small></span></div>
    </Card>
    <div className="order-detail-grid">
      <Card><h2>Items</h2>{order.order_items.map((item:{id:string;product_title:string;variant_title:string;quantity:number;line_total_cents:number})=><div className="order-line" key={item.id}><div><strong>{item.product_title}</strong><span>{item.variant_title} · Qty {item.quantity}</span></div><strong>{formatUsd(item.line_total_cents)}</strong></div>)}</Card>
      <Card><h2>Ship to</h2><p>{shipping?.recipient_name||shipping?.name}<br/>{shipping?.line1}<br/>{shipping?.line2&&<>{shipping.line2}<br/></>}{shipping?.city}, {shipping?.region||shipping?.state} {shipping?.postal_code||shipping?.postalCode}</p><Badge tone={order.address_validation_status==="validated"?"verified":"warm"}>{order.address_validation_status==="validated"?"Shippo validated":"Address unverified"}</Badge></Card>
      {order.manual_shipments?.[0]&&<Card><h2>Tracking</h2><p><strong>{order.manual_shipments[0].carrier}</strong><br/>{order.manual_shipments[0].tracking_number}</p>{order.manual_shipments[0].tracking_url&&<Button asChild variant="outline"><a href={order.manual_shipments[0].tracking_url} target="_blank" rel="noreferrer">Track shipment</a></Button>}</Card>}
    </div>
    {canReport?<Card className="guest-payment-report">
      <span className="eyebrow">{mode==="staging"?"FICTIONAL PAYMENT REPORT":"PAYMENT REPORT"}</span><h2>{mode==="staging"?"Report a test payment":"Report your payment"}</h2>
      <div className="truth-callout"><Info/><p><strong>{mode==="staging"?"Do not send funds.":"A report does not confirm payment."}</strong> {mode==="staging"?"Use fictional details only.":"An authorized reviewer independently verifies cleared funds before fulfillment."}</p></div>
      <div className="instruction-panel compact-instructions"><dl>
        <div><dt>{mode==="staging"?"Fake destination":"Destination"}</dt><dd>{mode==="staging"?(order.payment_method==="zelle"?"test-only@example.invalid":"$TEST-NO-FUNDS"):paymentConfig?.destination_value}</dd></div>
        <div><dt>Required memo</dt><dd>{order.order_number}</dd></div>
        <div><dt>Exact amount</dt><dd>{formatUsd(order.total_cents)}</dd></div>
      </dl></div>
      <form action={submitGuestPaymentReport} className="form-grid">
        <input type="hidden" name="orderNumber" value={order.order_number}/><input type="hidden" name="idempotencyKey" value={crypto.randomUUID()}/>
        <label>Sender name<Input name="senderName" required minLength={2} defaultValue={mode==="staging"?"Staging Tester":""}/></label>
        <label>Sender contact<Input name="senderContact" required defaultValue={mode==="staging"?"test-only@example.invalid":""}/></label>
        <label>Reported amount<Input name="amount" required type="number" min="0.01" step="0.01" defaultValue={(order.total_cents/100).toFixed(2)}/></label>
        <label>Payment date<Input name="paymentDate" required type="date" defaultValue={date}/></label>
        <label>Approximate time<Input name="approximateTime" required type="time" defaultValue={time}/></label>
        <label>Available reference<Input name="transactionReference" defaultValue={mode==="staging"?`TEST-${order.order_number}`:""}/></label>
        <label className="wide">Customer note<Input name="customerNote" defaultValue={mode==="staging"?"Fictional staging payment report. No funds were sent.":""}/></label>
        {mode==="production"&&<label className="wide">Optional private screenshot<Input name="screenshot" type="file" accept="image/jpeg,image/png,image/webp"/></label>}
        {mode==="staging"&&<label className="check-row wide"><input name="fictionalAcknowledged" type="checkbox" required/><span>I confirm that no funds were sent and all payment details are fictional.</span></label>}
        <div className="form-actions wide"><Button>Submit payment report</Button></div>
      </form>
    </Card>:null}
    <p className="queue-footnote">Need help? <Link href="/support">Visit support</Link>.</p>
  </main></CommerceShell>;
}
