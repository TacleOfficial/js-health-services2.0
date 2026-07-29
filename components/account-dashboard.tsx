import Link from "next/link";
import {
  Bell, ChevronRight, CircleUserRound, CreditCard, Gift, Heart, HelpCircle,
  Home, LayoutDashboard, LockKeyhole, MapPin, Package, Plus, ShieldCheck,
} from "lucide-react";
import { Badge, Button, Card, Input, Select, Separator } from "@/components/ui";
import { products } from "@/lib/data";
import type { AccountSnapshot } from "@/lib/account";
import {
  changePassword, createTicket, deleteAddress, markNotificationsRead, removeSavedProduct,
  replyToTicket, saveAddress, sendMagicLink, signOut, updateNotificationPreferences,
  updatePaymentPreference, updateProfile,
} from "@/app/account/actions";
import { SavedProductsImporter, StripeCardSetup } from "@/components/account-interactions";

export const accountNav = [
  ["", "Overview", Home], ["orders", "Orders", Package], ["saved", "Saved products", Heart],
  ["rewards", "Rewards", Gift], ["profile", "Profile", CircleUserRound], ["addresses", "Addresses", MapPin],
  ["payments", "Payment methods", CreditCard], ["notifications", "Notifications", Bell],
  ["security", "Security", LockKeyhole], ["support", "Support", HelpCircle],
] as const;

const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const date = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
const Field = ({ label, name, defaultValue = "", type = "text", required = false }: { label: string; name: string; defaultValue?: string; type?: string; required?: boolean }) =>
  <label className="account-field"><span>{label}</span><Input name={name} defaultValue={defaultValue} type={type} required={required} /></label>;

export function AccountShell({ snapshot, children }: { snapshot: AccountSnapshot; children: React.ReactNode }) {
  const name = snapshot.profile?.first_name || snapshot.user.email?.split("@")[0] || "Researcher";
  return <main className="account-root">
    <section className="account-banner"><div className="container"><span className="eyebrow">CUSTOMER ACCOUNT</span><h1>Welcome back, {name}</h1><p>Manage orders, saved materials, rewards, and account security.</p></div></section>
    <div className="container account-workspace">
      <aside className="account-sidebar" aria-label="Account navigation">
        {accountNav.map(([path, label, Icon]) => <Link key={label} href={`/account${path ? `/${path}` : ""}`}><Icon />{label}</Link>)}
        {snapshot.isAdmin && <><div className="account-sidebar-separator" role="separator" /><Link className="account-admin-link" href="/admin"><LayoutDashboard />Admin dashboard</Link></>}
      </aside>
      <nav className="account-mobile-nav" aria-label="Account sections">
        {accountNav.map(([path, label]) => <Link key={label} href={`/account${path ? `/${path}` : ""}`}>{label}</Link>)}
        {snapshot.isAdmin && <Link className="account-admin-link" href="/admin">Admin dashboard</Link>}
      </nav>
      <div className="account-content">{children}</div>
    </div>
  </main>;
}

function Heading({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <header className="account-heading"><div><h2>{title}</h2><p>{text}</p></div>{action}</header>;
}
function Empty({ title, text, href, label }: { title: string; text: string; href?: string; label?: string }) {
  return <Card className="account-empty"><HelpCircle /><h3>{title}</h3><p>{text}</p>{href && <Button asChild variant="outline"><Link href={href}>{label}</Link></Button>}</Card>;
}
function OrderRows({ orders, limit }: { orders: AccountSnapshot["orders"]; limit?: number }) {
  const list = limit ? orders.slice(0, limit) : orders;
  if (!list.length) return <Empty title="No orders yet" text="Completed storefront orders will appear here." href="/shop" label="Browse products" />;
  return <div className="account-list">{list.map(order => <Link className="account-order-row" href={`/orders/${order.order_number}`} key={order.id}>
    <div><Badge tone={order.payment_status === "verified" ? "verified" : "warm"}>{String(order.order_status).replaceAll("_", " ")}</Badge><strong>{order.order_number}</strong><span>{date(order.created_at)} · {order.order_items?.length ?? 0} lines</span></div>
    <div><strong>{usd(order.total_cents)}</strong><span>{String(order.fulfillment_status).replaceAll("_", " ")}</span></div><ChevronRight />
  </Link>)}</div>;
}

export function AccountSection({ section, snapshot }: { section: string; snapshot: AccountSnapshot }) {
  if (section === "overview") {
    const next = snapshot.qualifying < 500 ? 500 : 1500;
    const open = snapshot.tickets.filter(ticket => !["resolved", "closed"].includes(ticket.status)).length;
    return <><Heading title="Account overview" text="Your most important account activity at a glance." />
      <div className="account-stat-grid">
        <Card><Gift /><span>REWARDS</span><strong>{snapshot.points}</strong><p>{snapshot.tier} tier · {Math.max(0, next - snapshot.qualifying)} to next tier</p></Card>
        <Card><Heart /><span>SAVED</span><strong>{snapshot.saved.length}</strong><p>Saved research materials</p></Card>
        <Card><HelpCircle /><span>SUPPORT</span><strong>{open}</strong><p>Open conversations</p></Card>
      </div>
      <Heading title="Recent orders" text="The latest activity from your order history." action={<Link className="text-link" href="/account/orders">View all</Link>} />
      <OrderRows orders={snapshot.orders} limit={3} />
    </>;
  }
  if (section === "orders") return <><Heading title="Orders" text="Track payment, fulfillment, and delivery state from authoritative order records." /><OrderRows orders={snapshot.orders} /></>;
  if (section === "saved") {
    const savedProducts = snapshot.saved.map(saved => products.find(product => product.slug === saved.product_slug)).filter(Boolean);
    return <><Heading title="Saved products" text="Keep a shortlist and revisit current availability." /><SavedProductsImporter />
      {savedProducts.length ? <div className="saved-grid">{savedProducts.map(product => product && <Card key={product.slug} className="saved-card">
        <div className="saved-swatch" style={{ background: product.tone }}><span>{product.code}</span></div>
        <Badge>{product.status}</Badge><h3>{product.name}</h3><p>{product.descriptor}</p><strong>From {usd(product.variants[0].price * 100)}</strong>
        <div><Button asChild><Link href={`/products/${product.slug}`}>View product</Link></Button><form action={removeSavedProduct}><input type="hidden" name="slug" value={product.slug} /><Button variant="outline">Remove</Button></form></div>
      </Card>)}</div> : <Empty title="Nothing saved yet" text="Use the heart on a catalog product to build your shortlist." href="/shop" label="Browse products" />}</>;
  }
  if (section === "rewards") {
    const threshold = snapshot.qualifying < 500 ? 500 : 1500;
    const percent = Math.min(100, snapshot.qualifying / threshold * 100);
    return <><Heading title="Rewards" text="One point per whole dollar after an order is completed. Refunds reverse their points." />
      <Card className="rewards-hero"><span className="eyebrow">{snapshot.tier.toUpperCase()} TIER</span><strong>{snapshot.points} points</strong><div className="reward-track"><i style={{ width: `${percent}%` }} /></div><p>{snapshot.qualifying} qualifying points in the rolling 12-month period. Plus begins at 500; Premier at 1,500.</p></Card>
      <div className="tier-grid"><Card><strong>Base</strong><span>0 points</span><p>Earn on completed purchases.</p></Card><Card><strong>Plus</strong><span>500 points</span><p>Priority account support.</p></Card><Card><strong>Premier</strong><span>1,500 points</span><p>Highest service tier.</p></Card></div>
      <Heading title="Points activity" text="An immutable record of earnings, adjustments, and reversals." />
      {snapshot.rewards.length ? <div className="account-list">{snapshot.rewards.map(entry => <div className="ledger-row" key={entry.id}><div><strong>{entry.description}</strong><span>{date(entry.created_at)}</span></div><strong className={entry.points < 0 ? "negative" : ""}>{entry.points > 0 ? "+" : ""}{entry.points}</strong></div>)}</div> : <Empty title="No points activity" text="Points appear after your first completed order." />}</>;
  }
  if (section === "profile") return <><Heading title="Profile" text="Keep your contact and organization details current." /><Card><form action={updateProfile} className="account-form-grid">
    <Field label="First name" name="first_name" defaultValue={snapshot.profile?.first_name} required /><Field label="Last name" name="last_name" defaultValue={snapshot.profile?.last_name} required />
    <Field label="Email" name="email" defaultValue={snapshot.user.email} type="email" required /><Field label="Phone" name="phone" defaultValue={snapshot.profile?.phone} />
    <Field label="Organization" name="organization" defaultValue={snapshot.profile?.organization} /><div className="form-submit"><Button>Save profile</Button></div>
  </form></Card></>;
  if (section === "addresses") return <><Heading title="Addresses" text="Manage shipping and billing destinations." />
    <div className="address-grid">{snapshot.addresses.map(address => <Card key={address.id}><Badge>{address.label}</Badge><h3>{address.recipient_name}</h3><p>{address.line1}<br />{address.line2 && <>{address.line2}<br /></>}{address.city}, {address.region} {address.postal_code}</p><div className="address-flags">{address.is_default_shipping && <span>Default shipping</span>}{address.is_default_billing && <span>Default billing</span>}</div><form action={deleteAddress}><input type="hidden" name="id" value={address.id} /><Button variant="outline" disabled={address.is_default_shipping || address.is_default_billing}>Delete</Button></form></Card>)}</div>
    <Card><h3><Plus /> Add an address</h3><form action={saveAddress} className="account-form-grid">
      <Field label="Label" name="label" required /><Field label="Recipient" name="recipient_name" required /><Field label="Address" name="line1" required />
      <Field label="Apt / suite" name="line2" /><Field label="City" name="city" required /><Field label="State / region" name="region" required />
      <Field label="Postal code" name="postal_code" required /><Field label="Country code" name="country" defaultValue="US" required /><Field label="Phone" name="phone" />
      <label className="account-check"><input type="checkbox" name="is_default_shipping" /> Default shipping</label><label className="account-check"><input type="checkbox" name="is_default_billing" /> Default billing</label>
      <div className="form-submit"><Button>Save address</Button></div>
    </form></Card></>;
  if (section === "payments") {
    const stripeEnabled = snapshot.paymentConfigs.some(config => config.method === "stripe_card" && config.is_active);
    return <><Heading title="Payment methods" text="Store preferences only—never bank credentials or raw card details." />
      <Card><form action={updatePaymentPreference} className="account-form-grid"><label className="account-field"><span>Preferred transfer method</span><Select name="preferred_payment_method" defaultValue={snapshot.profile?.preferred_payment_method ?? "zelle"}><option value="zelle">Zelle</option><option value="cash_app">Cash App</option></Select></label>
        <Field label="Sender name" name="payment_sender_name" defaultValue={snapshot.profile?.payment_sender_name} /><Field label="Sender email or handle" name="payment_sender_contact" defaultValue={snapshot.profile?.payment_sender_contact} />
        <div className="form-submit"><Button>Save preference</Button></div></form></Card>
      {stripeEnabled ? <StripeCardSetup cards={snapshot.cards} /> : <Card className="locked-card"><ShieldCheck /><div><strong>Card payments are not currently available</strong><p>Credit and debit card controls appear only after an administrator enables the verified Stripe integration.</p></div></Card>}
    </>;
  }
  if (section === "notifications") {
    const p = snapshot.preferences;
    return <><Heading title="Notifications" text="Choose where account updates reach you." action={<form action={markNotificationsRead}><Button variant="outline">Mark all read</Button></form>} />
      <Card><form action={updateNotificationPreferences}><div className="preference-grid">{[
        ["orders","Orders"],["payments","Payments"],["rewards","Rewards"],["support","Support"],
      ].map(([key,label]) => <div key={key}><strong>{label}</strong><label><input type="checkbox" name={`email_${key}`} defaultChecked={p?.[`email_${key}`]} /> Email</label><label><input type="checkbox" name={`in_app_${key}`} defaultChecked={p?.[`in_app_${key}`]} /> In app</label></div>)}</div>
        <label className="account-check"><input type="checkbox" name="email_marketing" defaultChecked={p?.email_marketing} /> Product and research updates by email</label><Button>Save preferences</Button></form></Card>
      <Heading title="Inbox" text={`${snapshot.notifications.filter(n => !n.read_at).length} unread messages`} />
      {snapshot.notifications.length ? <div className="account-list">{snapshot.notifications.map(item => <div key={item.id} className={`notification-row ${item.read_at ? "" : "unread"}`}><Bell /><div><strong>{item.title}</strong><p>{item.body}</p><span>{date(item.created_at)}</span></div></div>)}</div> : <Empty title="Your inbox is clear" text="Order, payment, reward, and support updates will appear here." />}</>;
  }
  if (section === "security") return <><Heading title="Security" text="Use a unique password and review active account access." />
    <Card><h3>Change password</h3><form action={changePassword} className="account-form-grid"><Field label="New password" name="password" type="password" required /><Field label="Confirm password" name="confirm_password" type="password" required /><div className="form-submit"><Button>Update password</Button></div></form></Card>
    <Card className="security-row"><div><strong>Passwordless access</strong><p>Email a fresh, single-use magic link to {snapshot.user.email}.</p></div><form action={sendMagicLink}><Button variant="outline">Send magic link</Button></form></Card>
    <Card><h3>Sessions</h3>{snapshot.sessions.length ? snapshot.sessions.map(session => <div className="session-row" key={session.id}><div><strong>{session.user_agent || "Browser session"}</strong><span>Last active {date(session.last_seen_at)}</span></div><Badge>{session.revoked_at ? "Revoked" : "Active"}</Badge></div>) : <p className="muted">The current Supabase session is active. Device history begins after the account migration is applied.</p>}<Separator /><div className="security-actions"><form action={signOut.bind(null, "others")}><Button variant="outline">Sign out other devices</Button></form><form action={signOut.bind(null, "global")}><Button>Sign out everywhere</Button></form></div></Card>
  </>;
  if (section === "support") return <><Heading title="Support" text="Create a private ticket, link an order, and keep the conversation together." />
    <Card><h3>Start a ticket</h3><form action={createTicket} className="account-form-grid"><Field label="Subject" name="subject" required /><label className="account-field"><span>Related order</span><Select name="order_id" defaultValue=""><option value="">No order</option>{snapshot.orders.map(order => <option value={order.id} key={order.id}>{order.order_number}</option>)}</Select></label><label className="account-field account-wide"><span>How can we help?</span><textarea name="body" rows={5} required maxLength={5000} /></label><div className="form-submit"><Button>Create ticket</Button></div></form></Card>
    <Heading title="Ticket inbox" text="Replies and status updates appear here." />
    {snapshot.tickets.length ? <div className="ticket-list">{snapshot.tickets.map(ticket => <Card key={ticket.id}><div className="ticket-head"><div><Badge>{ticket.status.replaceAll("_", " ")}</Badge><h3>{ticket.subject}</h3><span>{date(ticket.updated_at)}</span></div></div><div className="thread">{ticket.support_messages?.sort((a: {created_at:string},b: {created_at:string}) => a.created_at.localeCompare(b.created_at)).map((message: {id:string; author_type:string; body:string; created_at:string}) => <div className={`message ${message.author_type}`} key={message.id}><strong>{message.author_type === "customer" ? "You" : "Velle support"}</strong><p>{message.body}</p><span>{date(message.created_at)}</span></div>)}</div>{!["resolved","closed"].includes(ticket.status) && <form action={replyToTicket} className="reply-form"><input type="hidden" name="ticket_id" value={ticket.id} /><textarea name="body" required maxLength={5000} placeholder="Write a reply" /><Button>Reply</Button></form>}</Card>)}</div> : <Empty title="No support tickets" text="Start a ticket when you need help with an account or order." />}</>;
  return null;
}
