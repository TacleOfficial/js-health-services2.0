import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, CreditCard, Database, Package, Search, ShieldAlert } from "lucide-react";
import { CommerceShell } from "@/components/commerce-shell";
import { Badge, Button, Card, Input } from "@/components/ui";
import { formatUsd } from "@/lib/commerce/money";
import { stripeReady } from "@/lib/stripe";
import { setPaymentMethodEnabled, createTestPaymentSubmission } from "./actions";
import { requireAdmin } from "@/lib/account";
import { AdminMfaPanel } from "@/components/admin-mfa-panel";

export const metadata: Metadata = { title: "Admin operations · Private staging", robots: { index: false, follow: false } };
type View = "queue" | "orders" | "inventory" | "settings" | "security";

const badgeTone = (status: string) => status === "verified" || status === "completed" || status === "delivered" ? "verified" as const : status === "rejected" || status === "cancelled" ? "neutral" as const : "warm" as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ view?: string; filter?: string; q?: string }> }) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const view: View = ["orders","inventory","settings","security"].includes(params.view ?? "") ? params.view as View : "queue";
  const filter = params.filter ?? "actionable";
  const queryText = params.q?.trim() ?? "";
  const [
    submissionsResult, ordersResult, inventoryResult, paymentConfigsResult, aalResult,
  ] = await Promise.all([
    supabase.from("payment_submissions").select("*,orders!inner(id,order_number,total_cents,customer_email,order_status,payment_status,fulfillment_status,created_at)").order("submitted_at", { ascending: false }).limit(100),
    supabase.from("orders").select("id,order_number,customer_email,total_cents,order_status,payment_status,fulfillment_status,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("inventory_items").select("on_hand,committed,updated_at,product_variants!inner(id,sku,title,products!inner(title))").order("updated_at", { ascending: false }),
    supabase.from("payment_method_configs").select("method,display_name,is_active").order("display_name"),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const error = [submissionsResult, ordersResult, inventoryResult, paymentConfigsResult].find(result => result.error)?.error;
  if (error) throw new Error(`Admin data is unavailable: ${error.message}`);
  const submissions = (submissionsResult.data ?? []).filter(row => {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    const matchText = !queryText || [order?.order_number, order?.customer_email, row.sender_name, row.transaction_reference].some(value => String(value ?? "").toLowerCase().includes(queryText.toLowerCase()));
    const matchFilter = filter === "all" || filter === "actionable" && ["submitted","under_review","possible_duplicate"].includes(row.status) || filter === "mismatch" && row.amount_reported_cents !== order?.total_cents || filter === "rejected" && row.status === "rejected";
    return matchText && matchFilter;
  });
  const verifiedToday = (submissionsResult.data ?? []).filter(row => row.status === "verified" && row.reviewed_at?.slice(0,10) === new Date().toISOString().slice(0,10)).length;
  const exceptions = (submissionsResult.data ?? []).filter(row => {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    return row.amount_reported_cents !== order?.total_cents || row.status === "possible_duplicate";
  }).length;
  const aal2 = aalResult.data?.currentLevel === "aal2";

  return <CommerceShell admin><main className="admin-page container">
    <div className="admin-heading">
      <div><span className="eyebrow">ADMIN OPERATIONS</span><h1>{view === "queue" ? "Verification queue" : view[0].toUpperCase() + view.slice(1)}</h1><p>Live staging records protected by Supabase roles and row-level security.</p></div>
      <Button asChild variant={aal2 ? "outline" : "primary"}><Link href="/admin/security"><ShieldAlert />{aal2 ? "AAL2 active" : "Set up AAL2"}</Link></Button>
    </div>
    <nav className="admin-tabs" aria-label="Admin sections">
      {[["queue","Review queue"],["orders","Orders"],["inventory","Inventory"],["settings","Payment settings"]].map(([key,label]) => <Link className={view === key ? "active" : ""} href={`/admin?view=${key}`} key={key}>{label}</Link>)}<Link href="/admin/security">Security</Link>
    </nav>

    {view === "queue" && <>
      <section className="admin-stats" aria-label="Queue summary">
        <Card><Clock3/><span>Awaiting review</span><strong>{(submissionsResult.data ?? []).filter(row => ["submitted","under_review","possible_duplicate"].includes(row.status)).length}</strong><small>Actionable submissions</small></Card>
        <Card><AlertTriangle/><span>Exceptions</span><strong>{exceptions}</strong><small>Mismatch or duplicate risk</small></Card>
        <Card><CheckCircle2/><span>Verified today</span><strong>{verifiedToday}</strong><small>Authoritative records</small></Card>
      </section>
      <Card className="admin-test-card"><div><Database/><span><strong>Test the payment workflow</strong><small>Creates one isolated $125 staging order, reservation, and payment submission.</small></span></div><form action={createTestPaymentSubmission}><Button variant="outline">Generate test submission</Button></form></Card>
      <Card className="queue-card">
        <div className="queue-tools">
          <form className="search-box" action="/admin"><input type="hidden" name="view" value="queue" /><input type="hidden" name="filter" value={filter} /><Search/><Input name="q" defaultValue={queryText} aria-label="Search payment queue" placeholder="Search order, sender, or reference" /></form>
          <div className="filter-chips">{[["actionable","Actionable"],["mismatch","Mismatch"],["rejected","Rejected"],["all","All"]].map(([key,label]) => <Link className={filter === key ? "active" : ""} href={`/admin?view=queue&filter=${key}`} key={key}>{label}</Link>)}</div>
        </div>
        <div className="review-table" role="table" aria-label="Payment submissions">
          <div className="review-row review-head" role="row"><span>Order</span><span>Method</span><span>Expected / reported</span><span>Risk</span><span>Status</span><span/></div>
          {submissions.map(row => {
            const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
            const mismatch = row.amount_reported_cents !== order?.total_cents;
            return <div className="review-row" role="row" key={row.id}>
              <span><strong>{order?.order_number}</strong><small>{row.sender_name} · {new Date(row.submitted_at).toLocaleString()}</small></span>
              <span>{String(row.method).replace("_"," ")}</span>
              <span><strong>{formatUsd(order?.total_cents ?? 0)}</strong><small>{mismatch ? `Reported ${formatUsd(row.amount_reported_cents)}` : "Exact amount"}</small></span>
              <span><Badge tone={mismatch ? "warm" : "verified"}>{mismatch ? "Amount mismatch" : "Exact match"}</Badge></span>
              <span><Badge tone={badgeTone(row.status)}>{String(row.status).replaceAll("_"," ")}</Badge></span>
              <Button asChild size="icon" variant="ghost"><Link href={`/admin/payments/${row.id}`} aria-label={`Review ${order?.order_number}`}><ArrowUpRight/></Link></Button>
            </div>;
          })}
          {!submissions.length && <div className="admin-empty"><CreditCard/><h3>No matching submissions</h3><p>Generate a staging submission or change the current filter.</p></div>}
        </div>
      </Card>
    </>}

    {view === "orders" && <Card className="admin-data-card"><div className="admin-data-head"><Package/><div><h2>Orders</h2><p>Payment and fulfillment state from the live orders table.</p></div></div><div className="admin-simple-table">{(ordersResult.data ?? []).map(order => <Link href={`/orders/${order.order_number}`} key={order.id}><div><strong>{order.order_number}</strong><small>{order.customer_email} · {new Date(order.created_at).toLocaleDateString()}</small></div><span>{formatUsd(order.total_cents)}</span><Badge tone={badgeTone(order.payment_status)}>{order.payment_status.replaceAll("_"," ")}</Badge><Badge tone={badgeTone(order.fulfillment_status)}>{order.fulfillment_status.replaceAll("_"," ")}</Badge><ArrowUpRight/></Link>)}</div>{!ordersResult.data?.length && <div className="admin-empty"><Package/><h3>No orders</h3><p>Orders will appear after checkout creates them.</p></div>}</Card>}

    {view === "inventory" && <Card className="admin-data-card"><div className="admin-data-head"><Database/><div><h2>Inventory</h2><p>On-hand, committed, and currently available units.</p></div></div><div className="inventory-table"><div><strong>Product / SKU</strong><strong>On hand</strong><strong>Committed</strong><strong>Available</strong></div>{(inventoryResult.data ?? []).map(row => {
      const variant = Array.isArray(row.product_variants) ? row.product_variants[0] : row.product_variants;
      const product = Array.isArray(variant?.products) ? variant.products[0] : variant?.products;
      return <div key={variant?.id}><span><strong>{product?.title} · {variant?.title}</strong><small>{variant?.sku}</small></span><span>{row.on_hand}</span><span>{row.committed}</span><strong>{row.on_hand-row.committed}</strong></div>;
    })}</div>{!inventoryResult.data?.length && <div className="admin-empty"><Database/><h3>No inventory records</h3><p>The test submission generator can create a safe staging inventory fixture.</p></div>}</Card>}

    {view === "settings" && <Card className="payment-settings"><div><span className="eyebrow">CHECKOUT AVAILABILITY</span><h2>Payment methods</h2><p>AAL2 is required to change customer checkout availability.</p></div><div>{(paymentConfigsResult.data ?? []).map(config => <form action={setPaymentMethodEnabled} key={config.method}><input type="hidden" name="method" value={config.method}/><input type="hidden" name="enabled" value={String(!config.is_active)}/><span className="method-icon">{config.method === "stripe_card" ? <CreditCard/> : config.method === "zelle" ? "Z" : "$"}</span><div><strong>{config.display_name}</strong><small>{config.method === "stripe_card" && !stripeReady() ? "Configuration incomplete" : config.is_active ? "Available to customers" : "Hidden"}</small></div><Button variant={config.is_active ? "outline" : "primary"} disabled={!aal2 || config.method === "stripe_card" && !stripeReady() && !config.is_active}>{config.is_active ? "Disable" : "Enable"}</Button></form>)}</div></Card>}

    {view === "security" && <AdminMfaPanel currentLevel={aalResult.data?.currentLevel ?? "aal1"} nextLevel={aalResult.data?.nextLevel ?? "aal1"} />}
  </main></CommerceShell>;
}
