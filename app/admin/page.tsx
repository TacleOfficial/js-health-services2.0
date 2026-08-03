import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, BellRing, CheckCircle2, Clock3, CreditCard, Database, MessageSquareText, Package, Plus, Search } from "lucide-react";
import { CommerceShell } from "@/components/commerce-shell";
import { Badge, Button, Card, Input } from "@/components/ui";
import { formatUsd } from "@/lib/commerce/money";
import { setPaymentMethodEnabled, changeCommerceMode, updatePaymentDestination, purchaseOrderLabel, changeShippingSettings, recordManualShipment, markManualShipmentDelivered } from "./actions";
import { requireAdmin } from "@/lib/account";
import { AdminInventoryActions } from "@/components/admin-inventory-actions";
import { getCommerceRuntime, getProductionReadiness, getShippingSettings } from "@/lib/commerce/runtime";
import { AdminTaxRateForm } from "@/components/admin-tax-rate-form";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { AdminSmsControls } from "@/components/admin-sms-controls";
import { AdminNotificationRouting } from "@/components/admin-notification-routing";
import { AdminOrderArchiveAction } from "@/components/admin-order-archive-action";

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
  const orderListStatus = params.status === "archived" ? "archived" : "active";
  const [
    submissionsResult, ordersResult, inventoryResult, paymentConfigsResult, inventoryManagerResult, superAdminResult,
    runtime, readiness, taxRatesResult, shippingSettings,
  ] = await Promise.all([
    supabase.from("payment_submissions").select("*,orders!inner(id,order_number,total_cents,customer_email,order_status,payment_status,fulfillment_status,commerce_mode,created_at,archived_at)").is("orders.archived_at",null).order("submitted_at", { ascending: false }).limit(100),
    supabase.from("orders").select("id,order_number,customer_email,total_cents,order_status,payment_status,fulfillment_status,commerce_mode,shipping_mode,shipping_cents,created_at,archived_at,shippo_shipments(id,transaction_id),manual_shipments(id,status,tracking_number)").order("created_at", { ascending: false }).limit(100),
    supabase.from("inventory_items").select("on_hand,committed,updated_at,product_variants!inner(id,sku,title,status,products!inner(id,title,status))").order("updated_at", { ascending: false }),
    supabase.from("payment_method_configs").select("method,display_name,destination_name,destination_value,is_active").order("display_name"),
    supabase.rpc("has_admin_role", { allowed: ["manager", "super_admin"] }),
    supabase.rpc("has_admin_role", { allowed: ["super_admin"] }),
    getCommerceRuntime(),
    getProductionReadiness(),
    supabase.from("manual_tax_rates").select("*").order("effective_from", { ascending: false }).limit(20),
    getShippingSettings(),
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
  let smsReviewers: Array<{ userId:string; name:string; email:string; roles:string[]; phone:string|null; verifiedAt:string|null; enabled:boolean }> = [];
  let smsFailureCount = 0;
  let harkFailureCount = 0;
  let notificationRoutes = [
    { eventType:"order_created", label:"New order", sms:false, hark:false, harkTitle:"Velle · New order", harkBody:"{orderNumber} was created for {total}.", harkImageUrl:"", variables:["orderNumber","total"] },
    { eventType:"payment_submission_created", label:"Payment submitted", sms:true, hark:false, harkTitle:"Velle · Payment submitted", harkBody:"Payment submitted for {orderNumber}: {reportedAmount} via {method}.", harkImageUrl:"", variables:["orderNumber","reportedAmount","method"] },
    { eventType:"payment_amount_mismatch", label:"Payment amount mismatch", sms:true, hark:false, harkTitle:"Velle · Payment mismatch", harkBody:"{orderNumber} reported {reportedAmount} via {method}; expected {expectedAmount}.", harkImageUrl:"", variables:["orderNumber","reportedAmount","method","expectedAmount"] },
    { eventType:"payment_approved", label:"Payment approved", sms:false, hark:false, harkTitle:"Velle · Payment approved", harkBody:"Payment for {orderNumber} was approved.", harkImageUrl:"", variables:["orderNumber"] },
  ];
  if (isSuperAdmin) {
    const service = createSupabaseServiceClient();
    const [{ data: roleRows }, { data: preferenceRows }, { data: routingRows }, { data: templateRows }, { data: failedRows }] = await Promise.all([
      service.from("admin_role_assignments").select("user_id,role").eq("is_active",true).in("role",["payment_reviewer","manager","super_admin"]),
      service.from("admin_sms_preferences").select("admin_user_id,phone_e164,verified_at,is_enabled"),
      service.from("notification_routing_settings").select("event_type,channel,is_enabled"),
      service.from("notification_hark_templates").select("event_type,title_template,body_template,image_url"),
      service.from("notification_deliveries").select("channel").in("channel",["sms","hark"]).in("status",["failed","soft_bounce","hard_bounce","rejected"]),
    ]);
    const userIds = [...new Set((roleRows ?? []).map(row => row.user_id))];
    const { data: profileRows } = userIds.length
      ? await service.from("profiles").select("id,email,first_name,last_name").in("id",userIds)
      : { data: [] };
    smsReviewers = userIds.map(userId => {
      const profile = profileRows?.find(row => row.id === userId);
      const preference = preferenceRows?.find(row => row.admin_user_id === userId);
      return {
        userId, name: [profile?.first_name,profile?.last_name].filter(Boolean).join(" ") || "Administrator",
        email: profile?.email ?? "", roles: (roleRows ?? []).filter(row => row.user_id===userId).map(row => row.role),
        phone: preference?.phone_e164 ?? null, verifiedAt: preference?.verified_at ?? null, enabled: Boolean(preference?.is_enabled),
      };
    });
    notificationRoutes = notificationRoutes.map(route => ({
      ...route,
      sms: Boolean(routingRows?.find(row => row.event_type===route.eventType && row.channel==="sms")?.is_enabled),
      hark: Boolean(routingRows?.find(row => row.event_type===route.eventType && row.channel==="hark")?.is_enabled),
      harkTitle: templateRows?.find(row => row.event_type===route.eventType)?.title_template ?? route.harkTitle,
      harkBody: templateRows?.find(row => row.event_type===route.eventType)?.body_template ?? route.harkBody,
      harkImageUrl: templateRows?.find(row => row.event_type===route.eventType)?.image_url ?? route.harkImageUrl,
    }));
    smsFailureCount = failedRows?.filter(row => row.channel==="sms").length ?? 0;
    harkFailureCount = failedRows?.filter(row => row.channel==="hark").length ?? 0;
  }
  const inventoryRows = (inventoryResult.data ?? []).filter(row => {
    const variant = Array.isArray(row.product_variants) ? row.product_variants[0] : row.product_variants;
    const product = Array.isArray(variant?.products) ? variant.products[0] : variant?.products;
    return inventoryStatus === "all" || product?.status === inventoryStatus;
  });
  const orderRows = (ordersResult.data ?? []).filter(order =>
    orderListStatus === "archived" ? Boolean(order.archived_at) : !order.archived_at
  );

  return <CommerceShell admin><main className="admin-page container">
    <div className="admin-heading">
      <div><span className="eyebrow">ADMIN OPERATIONS</span><h1>{view === "queue" ? "Verification queue" : view[0].toUpperCase() + view.slice(1)}</h1><p>Live staging records protected by Supabase roles and row-level security.</p></div>
    </div>
    <nav className="admin-tabs" aria-label="Admin sections">
      {[["queue","Review queue"],["orders","Orders"],["inventory","Inventory"],["settings","Settings"]].map(([key,label]) => <Link className={view === key ? "active" : ""} href={`/admin?view=${key}`} key={key}>{label}</Link>)}
    </nav>

    {view === "queue" && <>
      <section className="admin-stats" aria-label="Queue summary">
        <Card><Clock3/><span>Awaiting review</span><strong>{(submissionsResult.data ?? []).filter(row => ["submitted","under_review","possible_duplicate"].includes(row.status)).length}</strong><small>Actionable submissions</small></Card>
        <Card><AlertTriangle/><span>Exceptions</span><strong>{exceptions}</strong><small>Mismatch or duplicate risk</small></Card>
        <Card><CheckCircle2/><span>Verified today</span><strong>{verifiedToday}</strong><small>Authoritative records</small></Card>
      </section>
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

    {view === "orders" && <Card className="admin-data-card"><div className="admin-data-head"><Package/><div><h2>Orders</h2><p>Staging and production records remain explicitly separated.</p></div></div><div className="inventory-filters" aria-label="Order visibility filters">{[["active","Active"],["archived","Archived"]].map(([key,label]) => <Link className={orderListStatus === key ? "active" : ""} href={`/admin?view=orders&status=${key}`} key={key}>{label}</Link>)}</div><div className="admin-simple-table">{orderRows.map(order => <div className="admin-order-row" key={order.id}><Link href={`/admin/orders/${order.id}`}><div><strong>{order.order_number}</strong><small>{order.customer_email} · {new Date(order.created_at).toLocaleDateString()}</small></div><span>{formatUsd(order.total_cents)}</span><Badge tone={order.commerce_mode==="production"?"verified":"warm"}>{order.shipping_mode}</Badge><Badge tone={badgeTone(order.payment_status)}>{order.payment_status.replaceAll("_"," ")}</Badge><Badge tone={badgeTone(order.fulfillment_status)}>{order.fulfillment_status.replaceAll("_"," ")}</Badge><ArrowUpRight/></Link>
      {order.commerce_mode==="production"&&order.shipping_mode==="shippo"&&order.payment_status==="verified"&&order.fulfillment_status==="ready_for_fulfillment"&&<form action={purchaseOrderLabel}><input type="hidden" name="order_id" value={order.id}/><input type="hidden" name="idempotency_key" value={crypto.randomUUID()}/><Button>Purchase Shippo label</Button></form>}
      {order.commerce_mode==="production"&&order.shipping_mode!=="shippo"&&order.payment_status==="verified"&&order.fulfillment_status==="ready_for_fulfillment"&&<form action={recordManualShipment} className="manual-shipment-form"><input type="hidden" name="order_id" value={order.id}/><input type="hidden" name="idempotency_key" value={crypto.randomUUID()}/><Input name="carrier" placeholder="Carrier" required/><Input name="tracking_number" placeholder="Tracking number" required/><Input name="tracking_url" type="url" placeholder="Tracking URL (optional)"/><Button>Mark shipped</Button></form>}
      {order.commerce_mode==="production"&&order.shipping_mode!=="shippo"&&order.fulfillment_status==="shipped"&&<form action={markManualShipmentDelivered}><input type="hidden" name="order_id" value={order.id}/><Button variant="outline">Mark delivered</Button></form>}
      <div className="admin-order-archive-control"><AdminOrderArchiveAction orderId={order.id} orderNumber={order.order_number} archived={Boolean(order.archived_at)}/></div>
    </div>)}</div>{!orderRows.length && <div className="admin-empty"><Package/><h3>No {orderListStatus} orders</h3><p>{orderListStatus === "archived" ? "Archived orders will appear here and can be restored." : "Orders will appear after checkout creates them."}</p></div>}</Card>}

    {view === "inventory" && <Card className="admin-data-card"><div className="admin-data-head admin-inventory-head"><Database/><div><h2>Inventory</h2><p>On-hand, committed, and currently available units.</p></div>{canManageInventory ? <Button asChild><Link href="/admin/products/new"><Plus/> Add product</Link></Button> : <Button disabled title="Manager role required"><Plus/> Add product</Button>}</div><div className="inventory-filters" aria-label="Inventory status filters">{["active","draft","archived","all"].map(status => <Link className={inventoryStatus === status ? "active" : ""} href={`/admin?view=inventory&status=${status}`} key={status}>{status[0].toUpperCase()+status.slice(1)}</Link>)}</div><div className="inventory-table"><div><strong>Product / SKU</strong><strong>On hand</strong><strong>Committed</strong><strong>Available</strong><strong>Actions</strong></div>{inventoryRows.map(row => {
      const variant = Array.isArray(row.product_variants) ? row.product_variants[0] : row.product_variants;
      const product = Array.isArray(variant?.products) ? variant.products[0] : variant?.products;
      return <div key={variant?.id}><span><strong>{product?.title} · {variant?.title}</strong><small>{variant?.sku}</small></span><span>{row.on_hand}</span><span>{row.committed}</span><strong>{row.on_hand-row.committed}</strong><AdminInventoryActions productId={product!.id} productTitle={product!.title} archived={product!.status === "archived"} disabled={!canManageInventory}/></div>;
    })}</div>{!inventoryRows.length && <div className="admin-empty"><Database/><h3>No {inventoryStatus === "all" ? "" : `${inventoryStatus} `}inventory records</h3><p>Add a product or choose another status filter.</p></div>}</Card>}

    {view === "settings" && <div className="commerce-settings-grid">
      {isSuperAdmin && <Card className="admin-sms-panel notification-routing-panel">
        <div className="admin-data-head"><BellRing/><div><h2>Notification routing</h2><p>Choose SMS, Hark, both, or neither for each new operational event. Changes do not release historical events.</p></div></div>
        <div className="notification-provider-status">
          <div><strong>SMS · Brevo</strong><Badge tone={process.env.ADMIN_SMS_ENABLED==="true"&&process.env.BREVO_API_KEY&&process.env.APP_BASE_URL?"verified":"warm"}>{process.env.ADMIN_SMS_ENABLED==="true" ? process.env.BREVO_API_KEY&&process.env.APP_BASE_URL ? "Enabled" : "Configuration required" : "Disabled"}</Badge><small>{smsFailureCount} failed</small></div>
          <div><strong>Hark · Shared operations</strong><Badge tone={process.env.ADMIN_HARK_ENABLED==="true"&&process.env.HARK_WEBHOOK_URL&&process.env.APP_BASE_URL?"verified":"warm"}>{process.env.ADMIN_HARK_ENABLED==="true" ? process.env.HARK_WEBHOOK_URL&&process.env.APP_BASE_URL ? "Enabled" : "Configuration required" : "Disabled"}</Badge><small>{harkFailureCount} failed</small></div>
        </div>
        <AdminNotificationRouting routes={notificationRoutes}/>
      </Card>}
      {isSuperAdmin && <Card className="admin-sms-panel">
        <div className="admin-data-head"><MessageSquareText/><div><h2>Manager SMS alerts</h2><p>Brevo alerts are independent from push notifications. {process.env.ADMIN_SMS_ENABLED==="true" ? "Live delivery is enabled." : "Live delivery is disabled by ADMIN_SMS_ENABLED."}</p></div><Badge tone={process.env.BREVO_API_KEY&&process.env.APP_BASE_URL?"verified":"warm"}>{process.env.BREVO_API_KEY&&process.env.APP_BASE_URL?"Configured":"Configuration required"}</Badge></div>
        {smsFailureCount > 0 && <p className="admin-sms-warning">{smsFailureCount} SMS delivery {smsFailureCount===1?"failure requires":"failures require"} review.</p>}
        <div className="admin-sms-list">{smsReviewers.map(reviewer => <AdminSmsControls key={reviewer.userId} reviewer={reviewer}/>)}</div>
        {!smsReviewers.length && <div className="admin-empty"><MessageSquareText/><h3>No eligible reviewers</h3><p>Assign an active payment reviewer, manager, or super-admin role first.</p></div>}
      </Card>}
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
      <Card className="mode-panel"><div className="mode-panel-head"><div><span className="eyebrow">SHIPPING MODE</span><h2>{shippingSettings.mode.replaceAll("_"," ")}</h2><p>Version {shippingSettings.version} · Changes affect new orders only.</p></div><Badge tone={shippingSettings.mode==="shippo"?"verified":"warm"}>{shippingSettings.mode}</Badge></div>
        {isSuperAdmin&&<form action={changeShippingSettings} className="shipping-settings-form"><input type="hidden" name="expected_version" value={shippingSettings.version}/><label>Mode<select name="shipping_mode" defaultValue={shippingSettings.mode}><option value="shippo">Shippo rates and labels</option><option value="manual_free">Free manual shipping</option><option value="manual_fixed">Fixed-price manual shipping</option></select></label><label>Fixed price<Input name="fixed_price" type="number" min="0" max="10000" step="0.01" defaultValue={(shippingSettings.fixedPriceCents/100).toFixed(2)}/></label><Button>Save shipping mode</Button></form>}
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
