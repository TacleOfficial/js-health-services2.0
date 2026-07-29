import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, CreditCard, ShieldAlert, XCircle } from "lucide-react";
import { CommerceShell } from "@/components/commerce-shell";
import { Badge, Button, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/account";
import { formatUsd } from "@/lib/commerce/money";
import { approvePayment, rejectPayment } from "../../actions";

export default async function Page({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const { supabase } = await requireAdmin();
  const [{ data: submission }, aal] = await Promise.all([
    supabase.from("payment_submissions").select("*,orders!inner(*,order_items(*),inventory_reservations(*))").eq("id", submissionId).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (!submission) notFound();
  const order = Array.isArray(submission.orders) ? submission.orders[0] : submission.orders;
  const actionable = ["submitted","under_review","possible_duplicate"].includes(submission.status) && order.payment_status !== "verified";
  const aal2 = aal.data?.currentLevel === "aal2";
  return <CommerceShell admin><main className="admin-page container admin-review-page">
    <Link href="/admin" className="admin-back"><ArrowLeft/>Back to queue</Link>
    <div className="admin-heading"><div><span className="eyebrow">PAYMENT REVIEW</span><h1>{order.order_number}</h1><p>Submitted {new Date(submission.submitted_at).toLocaleString()} by {submission.sender_name}.</p></div><Badge tone={submission.status === "verified" ? "verified" : "warm"}>{submission.status.replaceAll("_"," ")}</Badge></div>
    {!aal2 && <Card className="admin-aal-warning"><ShieldAlert/><div><strong>AAL2 authentication required</strong><p>Review the record now, then enroll or challenge MFA before approving or rejecting.</p></div><Button asChild variant="outline"><Link href="/admin/security">Open security</Link></Button></Card>}
    <div className="admin-review-grid">
      <div>
        <Card className="admin-review-card"><div className="admin-data-head"><CreditCard/><div><h2>Reported payment</h2><p>Customer-provided evidence is never confirmation of cleared funds.</p></div></div><dl className="admin-review-details">
          <div><dt>Expected</dt><dd>{formatUsd(order.total_cents)}</dd></div><div><dt>Reported</dt><dd>{formatUsd(submission.amount_reported_cents)}</dd></div>
          <div><dt>Method</dt><dd>{submission.method.replace("_"," ")}</dd></div><div><dt>Reference</dt><dd>{submission.transaction_reference || "Not supplied"}</dd></div>
          <div><dt>Sender contact</dt><dd>{submission.sender_contact}</dd></div><div><dt>Payment date/time</dt><dd>{submission.payment_date} · {submission.approximate_time}</dd></div>
        </dl>{submission.customer_note && <div className="admin-note"><strong>Customer note</strong><p>{submission.customer_note}</p></div>}</Card>
        <Card className="admin-review-card"><h2>Order items</h2>{order.order_items.map((item: {id:string;product_title:string;variant_title:string;quantity:number;line_total_cents:number}) => <div className="order-line" key={item.id}><div><strong>{item.product_title}</strong><span>{item.variant_title} · Qty {item.quantity}</span></div><strong>{formatUsd(item.line_total_cents)}</strong></div>)}</Card>
      </div>
      <aside><Card className="admin-decision-card"><h2>Decision</h2>{actionable ? <>
        <form action={approvePayment}><input type="hidden" name="submission_id" value={submission.id}/><label>Internal approval note<textarea name="note" maxLength={500} placeholder="Optional reconciliation note"/></label><Button disabled={!aal2}><CheckCircle2/>Approve verified payment</Button></form>
        <div className="decision-separator"><span>or</span></div>
        <form action={rejectPayment}><input type="hidden" name="submission_id" value={submission.id}/><label>Reason<textarea name="reason" minLength={3} maxLength={500} required placeholder="Required reason"/></label><label>Resolution<select name="resolution" defaultValue="request_info"><option value="request_info">Request more information</option><option value="reject">Reject and cancel order</option></select></label><Button className="admin-reject-button" disabled={!aal2}><XCircle/>Submit decision</Button></form>
      </> : <div className="admin-final-state"><CheckCircle2/><strong>Review complete</strong><p>This submission is {submission.status.replaceAll("_"," ")} and cannot be acted on again.</p></div>}</Card></aside>
    </div>
  </main></CommerceShell>;
}
