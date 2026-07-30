import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, CreditCard, Database, Package, Plus, Search } from "lucide-react";
import { CommerceShell } from "@/components/commerce-shell";
import { Badge, Button, Card, Input } from "@/components/ui";
import { formatUsd } from "@/lib/commerce/money";
import { stripeReady } from "@/lib/stripe";
import { setPaymentMethodEnabled, createTestPaymentSubmission, changeCommerceMode, updatePaymentDestination, purchaseOrderLabel } from "./actions";
import { requireAdmin } from "@/lib/account";
import { AdminInventoryActions } from "@/components/admin-inventory-actions";
import { getCommerceRuntime, getProductionReadiness } from "@/lib/commerce/runtime";
import { AdminTaxRateForm } from "@/components/admin-tax-rate-form";

export const metadata: Metadata = { title: "Admin operations · Private staging", robots: { index: false, follow: false } };
type View = "queue" | "orders" | "inventory" | "settings";

const badgeTone = (status: string) => status === "verified" || status === "completed" || status === "delivered" ? "verified" as const : status === "rejected" || status === "cancelled" ? "neutral" as const : "warm" as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ view?: string; filter?: string; q?: string; status?: string }> }) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const view: View = ["orders","inventory","settings"].includes(params.view ?? "") ? params.view as View : "queue";
  const filter = params.filter ?? "actionable";
  const queryText = params.q?.trim() ?? "";
  const inventoryStatus = ["active","draft","archived","all"].includes(params.status ?? "") ? params.status! : "active";
  const [
    submissionsResult, ordersResult, inventoryResult, paymentConfigsResult, inventoryManagerResult, superAdminResult,
    runtime, readiness, taxRatesResult,
  ] = await Promise.all([
    supabase.from("payment_submissions").select("*,orders!inner(id,order_number,total_cents,customer_email,order_status,payment_status,fulfillment_status,commerce_mode,created_at)").order("submitted_at", { ascending: false }).limit(100),
    supabase.from("orders").select("id,order_number,customer_email,total_cents,order_status,payment_status,fulfillment_status,commerce_mode,created_at,shippo_shipments(id,transaction_id)").order("created_at", { ascending: false }).limit(100),
    supabase.from("inventory_items").select("on_hand,committed,updated_at,product_variants!inner(id,sku,title,status,products!inner(id,title,status))").order("updated_at", { ascending: false }),
    supabase.from("payment_method_configs").select("method,display_name,destination_name,destination_value,is_active").order("display_name"),
    supabase.rpc("has_admin_role", { allowed: ["manager", "super_admin"] }),
    supabase.rpc("has_admin_role", { allowed: ["super_admin"] }),
    getCommerceRuntime(),
    getProductionReadiness(),
    supabase.from("manual_tax_rates").select("*").order("effective_from", { ascending: false }).limit(20),
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
  const canManageInventory = Boolean(inventoryManagerResult.data);
  const isSuperAdmin = Boolean(superAdminResult.data);
  const inventoryRows = (inventoryResult.data ?? []).filter(row => {
    const variant = Array.isArray(row.product_variants) ? row.product_variants[0] : row.product_variants;
    const product = Array.isArray(variant?.products) ? variant.products[0] : variant?.products;
    return inventoryStatus === "all" || product?.status === inventoryStatus;
  });

  return <CommerceShell admin><main className="admin-page container">
    <div className="admin-heading">
      <div><span className="eyebrow">ADMIN OPERATIONS</span><h1>{view === "queue" ? "Verification queue" : view[0].toUpperCase() + view.slice(1)}</h1><p>Live staging records protected by Supabase roles and row-level security.</p></div>
    </div>
    <nav className="admin-tabs" aria-label="Admin sections">
      {[["queue","Review queue"],["orders","Orders"],["inventory","Inventory"],["settings","Payment settings"]].map(([key,label]) => <Link className={view === key ? "active" : ""} href={`/admin?view=${key}`} key={key}>{label}</Link>)}
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

    {view === "orders" && <Card className="admin-data-card"><div className="admin-data-head"><Package/><div><h2>Orders</h2><p>Staging and production records remain explicitly separated.</p></div></div><div className="admin-simple-table">{(ordersResult.data ?? []).map(order => <div className="admin-order-row" key={order.id}><Link href={`/orders/${order.order_number}`}><div><strong>{order.order_number}</strong><small>{order.customer_email} · {new Date(order.created_at).toLocaleDateString()}</small></div><span>{formatUsd(order.total_cents)}</span><Badge tone={order.commerce_mode==="production"?"verified":"warm"}>{order.commerce_mode}</Badge><Badge tone={badgeTone(order.payment_status)}>{order.payment_status.replaceAll("_"," ")}</Badge><Badge tone={badgeTone(order.fulfillment_status)}>{order.fulfillment_status.replaceAll("_"," ")}</Badge><ArrowUpRight/></Link>{order.commerce_mode==="production"&&order.payment_status==="verified"&&order.fulfillment_status==="ready_for_fulfillment"&&<form action={purchaseOrderLabel}><input type="hidden" name="order_id" value={order.id}/><input type="hidden" name="idempotency_key" value={crypto.randomUUID()}/><Button>Purchase Shippo label</Button></form>}</div>)}</div>{!ordersResult.data?.length && <div className="admin-empty"><Package/><h3>No orders</h3><p>Orders will appear after checkout creates them.</p></div>}</Card>}

    {view === "inventory" && <Card className="admin-data-card"><div className="admin-data-head admin-inventory-head"><Database/><div><h2>Inventory</h2><p>On-hand, committed, and currently available units.</p></div>{canManageInventory ? <Button asChild><Link href="/admin/products/new"><Plus/> Add product</Link></Button> : <Button disabled title="Manager role required"><Plus/> Add product</Button>}</div><div className="inventory-filters" aria-label="Inventory status filters">{["active","draft","archived","all"].map(status => <Link className={inventoryStatus === status ? "active" : ""} href={`/admin?view=inventory&status=${status}`} key={status}>{status[0].toUpperCase()+status.slice(1)}</Link>)}</div><div className="inventory-table"><div><strong>Product / SKU</strong><strong>On hand</strong><strong>Committed</strong><strong>Available</strong><strong>Actions</strong></div>{inventoryRows.map(row => {
      const variant = Array.isArray(row.product_variants) ? row.product_variants[0] : row.product_variants;
      const product = Array.isArray(variant?.products) ? variant.products[0] : variant?.products;
      return <div key={variant?.id}><span><strong>{product?.title} · {variant?.title}</strong><small>{variant?.sku}</small></span><span>{row.on_hand}</span><span>{row.committed}</span><strong>{row.on_hand-row.committed}</strong><AdminInventoryActions productId={product!.id} productTitle={product!.title} archived={product!.status === "archived"} disabled={!canManageInventory}/></div>;
    })}</div>{!inventoryRows.length && <div className="admin-empty"><Database/><h3>No {inventoryStatus === "all" ? "" : `${inventoryStatus} `}inventory records</h3><p>Add a product or choose another status filter.</p></div>}</Card>}

    {view === "settings" && <div className="commerce-settings-grid">
      <Card className="mode-panel">
        <div className="mode-panel-head"><div><span className="eyebrow">COMMERCE MODE</span><h2>{runtime.mode === "production" ? "Production" : "Staging"}</h2><p>Version {runtime.version} · Last changed {new Date(runtime.updatedAt).toLocaleString()}</p></div><Badge tone={runtime.mode === "production" ? "verified" : "warm"}>{runtime.mode}</Badge></div>
        <div className="readiness-list">{readiness.checks.map(check => <div key={check.key}><span className={check.ready ? "ready-dot" : "blocked-dot"}/><span><strong>{check.label}</strong>{check.reason && <small>{check.reason}</small>}</span></div>)}</div>
        {isSuperAdmin ? <form action={changeCommerceMode} className="mode-switch-form">
          <input type="hidden" name="expected_version" value={runtime.version}/><input type="hidden" name="target_mode" value={runtime.mode === "staging" ? "production" : "staging"}/>
          {runtime.mode === "staging" && <><label htmlFor="confirmation">Type ENABLE PRODUCTION</label><Input id="confirmation" name="confirmation" autoComplete="off" placeholder="ENABLE PRODUCTION"/></>}
          {runtime.mode === "production" && <input type="hidden" name="confirmation" value="RETURN TO STAGING"/>}
          <Button disabled={runtime.mode === "staging" && !readiness.ready}>{runtime.mode === "staging" ? "Enable production" : "Return to staging"}</Button>
          <small>{runtime.mode === "production" ? "Blocked while production orders are unsettled." : "Changes affect new checkouts only. Existing orders keep their original mode."}</small>
        </form> : <p className="admin-note">Only a super-admin can change commerce mode.</p>}
      </Card>
      <Card className="payment-settings"><div><span className="eyebrow">CHECKOUT AVAILABILITY</span><h2>Payment methods</h2><p>Stripe cards remain disabled. Destinations are masked after save.</p></div><div>{(paymentConfigsResult.data ?? []).map(config => <div key={config.method}>
        <form action={setPaymentMethodEnabled}><input type="hidden" name="method" value={config.method}/><input type="hidden" name="enabled" value={String(!config.is_active)}/><span className="method-icon">{config.method === "stripe_card" ? <CreditCard/> : config.method === "zelle" ? "Z" : "$"}</span><div><strong>{config.display_name}</strong><small>{config.is_active ? "Available to customers" : "Hidden"} · ••••{String(config.destination_value ?? "").slice(-4)}</small></div><Button variant={config.is_active ? "outline" : "primary"} disabled={config.method === "stripe_card"}>{config.is_active ? "Disable" : "Enable"}</Button></form>
        {isSuperAdmin && config.method !== "stripe_card" && <form action={updatePaymentDestination} className="destination-form"><input type="hidden" name="method" value={config.method}/><Input name="destination_name" placeholder="Account holder" required/><Input name="destination_value" type="password" placeholder="New destination" required/><Button variant="outline">Update destination</Button></form>}
      </div>)}</div></Card>
      <Card className="tax-rates-panel"><div><span className="eyebrow">AUDITED TAX CONFIGURATION</span><h2>Manual tax rates</h2><p>Approved effective-dated rates are the primary production tax source. Every order records the exact rate version used.</p></div>
        {isSuperAdmin && <AdminTaxRateForm/>}
        <div className="tax-rate-list">{(taxRatesResult.data ?? []).map(rate => <div key={rate.id}><strong>{rate.region_code}{rate.postal_pattern ? ` / ${rate.postal_pattern}` : ""}</strong><span>{(rate.rate_basis_points / 100).toFixed(3)}%</span><Badge tone={rate.is_approved ? "verified" : "neutral"}>v{rate.version}</Badge></div>)}</div>
      </Card>
    </div>}

  </main></CommerceShell>;
}
