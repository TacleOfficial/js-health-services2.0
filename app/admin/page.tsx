import type { Metadata } from "next";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, Search, ShieldAlert } from "lucide-react";
import { CommerceShell } from "@/components/commerce-shell";
import { Badge, Button, Card, Input } from "@/components/ui";
import { formatUsd } from "@/lib/commerce/money";

export const metadata: Metadata = { title: "Payment review · Private staging", robots: { index: false, follow: false } };

const reviews = [
  { order: "VEL-2026-X7K4P9", method: "Zelle", customer: "A. Morgan", amount: 14400, reported: 14400, status: "New submission", risk: "Exact match", time: "4 min ago" },
  { order: "VEL-2026-Q2M8RT", method: "Cash App", customer: "J. Chen", amount: 21800, reported: 21000, status: "Needs review", risk: "Amount mismatch", time: "18 min ago" },
  { order: "VEL-2026-N9DP4W", method: "Zelle", customer: "R. Ellis", amount: 53400, reported: 53400, status: "Manager review", risk: "High value", time: "31 min ago" },
];

export default function AdminPage() {
  return (
    <CommerceShell admin>
      <main className="admin-page container">
        <div className="admin-heading">
          <div><span className="eyebrow">PAYMENT OPERATIONS</span><h1>Verification queue</h1><p>Funds must be independently confirmed before inventory and fulfillment unlock.</p></div>
          <Button variant="outline"><ShieldAlert/> Require AAL2</Button>
        </div>
        <section className="admin-stats" aria-label="Queue summary">
          <Card><Clock3/><span>Awaiting review</span><strong>3</strong><small>Actionable submissions</small></Card>
          <Card><AlertTriangle/><span>Exceptions</span><strong>2</strong><small>Manager authorization</small></Card>
          <Card><CheckCircle2/><span>Verified today</span><strong>0</strong><small>Staging records only</small></Card>
        </section>
        <Card className="queue-card">
          <div className="queue-tools">
            <div className="search-box"><Search/><Input aria-label="Search payment queue" placeholder="Search order, sender, or reference" /></div>
            <div className="filter-chips"><button className="active">Actionable</button><button>Mismatch</button><button>Duplicate</button><button>Expired</button></div>
          </div>
          <div className="review-table" role="table" aria-label="Payment submissions">
            <div className="review-row review-head" role="row"><span>Order</span><span>Method</span><span>Expected / reported</span><span>Risk</span><span>Status</span><span/></div>
            {reviews.map((review) => (
              <div className="review-row" role="row" key={review.order}>
                <span><strong>{review.order}</strong><small>{review.customer} · {review.time}</small></span>
                <span>{review.method}</span>
                <span><strong>{formatUsd(review.amount)}</strong><small>{review.amount === review.reported ? "Exact" : `Reported ${formatUsd(review.reported)}`}</small></span>
                <span><Badge tone={review.risk === "Exact match" ? "verified" : "warm"}>{review.risk}</Badge></span>
                <span>{review.status}</span>
                <Button size="icon" variant="ghost" aria-label={`Open ${review.order}`}><ArrowUpRight/></Button>
              </div>
            ))}
          </div>
          <p className="queue-footnote">Illustrative staging data. Approval actions remain disabled until Supabase Auth, AAL2, and database roles are connected.</p>
        </Card>
      </main>
    </CommerceShell>
  );
}
