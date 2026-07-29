import type { Metadata } from "next";
import { Check, Clock3, LockKeyhole, PackageCheck } from "lucide-react";
import { CommerceShell } from "@/components/commerce-shell";
import { Badge, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Order status · Private staging", robots: { index: false, follow: false } };

export default async function OrderStatusPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  return (
    <CommerceShell>
      <main className="container order-status-page">
        <span className="eyebrow">SECURE ORDER STATUS</span>
        <div className="order-status-heading"><div><h1>{orderNumber}</h1><p>Current information is loaded from the authorized order record, never from a notification payload.</p></div><Badge tone="warm">AWAITING PAYMENT</Badge></div>
        <Card className="order-timeline">
          <div className="done"><Check/><span><strong>Order created</strong><small>Inventory reserved for 24 hours</small></span></div>
          <div className="current"><Clock3/><span><strong>Awaiting payment</strong><small>No funds have been verified</small></span></div>
          <div><LockKeyhole/><span><strong>Payment review</strong><small>Unlocks after a customer submission</small></span></div>
          <div><PackageCheck/><span><strong>Fulfillment</strong><small>Blocked until authorized approval</small></span></div>
        </Card>
        <p className="queue-footnote">Private staging preview. Production access requires the order owner’s verified Supabase session.</p>
      </main>
    </CommerceShell>
  );
}
