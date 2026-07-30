"use client";

import { useState, useTransition } from "react";
import { Check, Info, LockKeyhole, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, Input, Separator } from "@/components/ui";
import { createGuestStagingOrder } from "@/app/checkout/actions";
import { formatUsd } from "@/lib/commerce/money";
import type { PaymentMethod } from "@/lib/commerce/types";

type BasketLine = { sku: string; productTitle: string; variantTitle: string; priceCents: number };
type Details = {
  firstName: string; lastName: string; email: string; line1: string; line2: string;
  city: string; state: string; postalCode: string; phone: string; eligibilityAccepted: boolean;
};

const emptyDetails: Details = {
  firstName: "", lastName: "", email: "", line1: "", line2: "",
  city: "", state: "", postalCode: "", phone: "", eligibilityAccepted: false,
};

export function StagingCheckout({ ready, basket }: {
  ready: Record<string, boolean>;
  basket: BasketLine[];
}) {
  const [method, setMethod] = useState<PaymentMethod>("zelle");
  const [step, setStep] = useState<"details" | "payment">("details");
  const [details, setDetails] = useState<Details>(emptyDetails);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const subtotal = basket.reduce((sum, line) => sum + line.priceCents, 0);
  const shipping = 1800;
  const total = subtotal + shipping;
  const integrationsReady = Object.values(ready).every(Boolean) && basket.length === 2;

  function update<K extends keyof Details>(key: K, value: Details[K]) {
    setDetails(current => ({ ...current, [key]: value }));
  }

  function createOrder() {
    setError("");
    startTransition(async () => {
      const result = await createGuestStagingOrder({
        ...details, paymentMethod: method, eligibilityAccepted: details.eligibilityAccepted,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      window.location.assign(result.accessPath);
    });
  }

  return (
    <main>
      <section className="page-hero commerce-hero">
        <div className="container">
          <span className="eyebrow">STAGING ORDER TEST</span>
          <h1>Checkout, with every state made clear</h1>
          <p>This creates a durable staging order and inventory reservation. All payment details are fictional, and no funds should be sent.</p>
        </div>
      </section>
      <section className="container checkout-layout commerce-checkout">
        <div className="commerce-main">
          <div className="checkout-steps" aria-label="Checkout progress">
            <span className={step === "details" ? "active" : ""}>01 Details</span>
            <span>02 Address check</span>
            <span className={step === "payment" ? "active" : ""}>03 Test method</span>
            <span>04 Review</span>
          </div>
          {!integrationsReady ? <div className="demo-alert" role="status"><LockKeyhole/><div><strong>Private staging is safely locked</strong><p>Apply the latest database migration and configure the required staging integrations.</p></div></div> : null}
          {error ? <div className="demo-alert" role="alert"><Info/><div><strong>Order not created</strong><p>{error}</p></div></div> : null}

          {step === "details" ? (
            <Card className="commerce-form-card">
              <form onSubmit={event => { event.preventDefault(); setStep("payment"); }}>
                <div className="form-section-head"><span className="eyebrow">CONTACT & DELIVERY</span><Badge tone="warm">STAGING</Badge></div>
                <div className="form-grid">
                  <label>First name<Input required autoComplete="given-name" value={details.firstName} onChange={e=>update("firstName",e.target.value)} placeholder="Avery"/></label>
                  <label>Last name<Input required autoComplete="family-name" value={details.lastName} onChange={e=>update("lastName",e.target.value)} placeholder="Morgan"/></label>
                  <label className="wide">Email<Input required type="email" autoComplete="email" value={details.email} onChange={e=>update("email",e.target.value)} placeholder="tester@example.com"/></label>
                  <label className="wide">Street address<Input required autoComplete="address-line1" value={details.line1} onChange={e=>update("line1",e.target.value)} placeholder="100 Research Way"/></label>
                  <label className="wide">Address line 2<Input autoComplete="address-line2" value={details.line2} onChange={e=>update("line2",e.target.value)} placeholder="Suite or unit"/></label>
                  <label>City<Input required autoComplete="address-level2" value={details.city} onChange={e=>update("city",e.target.value)} placeholder="Indianapolis"/></label>
                  <label>State<Input required autoComplete="address-level1" value={details.state} onChange={e=>update("state",e.target.value)} placeholder="IN" maxLength={2}/></label>
                  <label>Postal code<Input required autoComplete="postal-code" value={details.postalCode} onChange={e=>update("postalCode",e.target.value)} placeholder="46204" pattern="\d{5}(-\d{4})?"/></label>
                  <label>Phone<Input required autoComplete="tel" value={details.phone} onChange={e=>update("phone",e.target.value)} placeholder="(555) 010-0200"/></label>
                </div>
                <label className="check-row"><input required type="checkbox" checked={details.eligibilityAccepted} onChange={e=>update("eligibilityAccepted",e.target.checked)}/><span>I attest that I am an adult, legally eligible to purchase, and understand this is a fictional staging test.</span></label>
                <div className="form-actions"><Button type="submit" disabled={!integrationsReady}>Continue to test payment method</Button></div>
              </form>
            </Card>
          ) : (
            <Card className="commerce-form-card">
              <span className="eyebrow">SELECT TEST PAYMENT METHOD</span>
              <h2>Choose a fictional reporting path</h2>
              <div className="payment-methods">
                {(["zelle","cash_app"] as const).map(value => <button key={value} type="button" className={method===value?"payment-method active":"payment-method"} onClick={()=>setMethod(value)}>
                  <span>{value==="zelle"?"Z":"$"}</span><div><strong>{value==="zelle"?"Zelle":"Cash App"}</strong><small>Fictional manual verification</small></div>{method===value?<Check/>:null}
                </button>)}
              </div>
              <div className="instruction-panel">
                <div><Badge tone="dark">{method==="zelle"?"ZELLE":"CASH APP"}</Badge><span className="eyebrow">EXACT TEST AMOUNT</span></div>
                <strong className="instruction-total">{formatUsd(total)}</strong>
                <dl>
                  <div><dt>Fake destination</dt><dd>{method==="zelle"?"test-only@example.invalid":"$TEST-NO-FUNDS"}</dd></div>
                  <div><dt>Required memo</dt><dd>Generated after order creation</dd></div>
                  <div><dt>Reservation window</dt><dd>24 hours after order creation</dd></div>
                </dl>
              </div>
              <div className="truth-callout"><Info/><p><strong>Do not send funds.</strong> This test creates an unpaid order. You will report a fictional payment on the next screen.</p></div>
              <div className="form-actions"><Button variant="outline" onClick={()=>setStep("details")} disabled={pending}>Back</Button><Button onClick={createOrder} disabled={!integrationsReady||pending}>{pending?"Creating staging order…":"Create secured test order"}</Button></div>
            </Card>
          )}
        </div>

        <Card className="order-summary commerce-summary">
          <span className="eyebrow">ORDER SNAPSHOT</span>
          {basket.map(line=><div key={line.sku}><span>{line.productTitle} · {line.variantTitle}</span><strong>{formatUsd(line.priceCents)}</strong></div>)}
          <Separator/><div><span>Subtotal</span><strong>{formatUsd(subtotal)}</strong></div>
          <div><span>Documented handling</span><strong>{formatUsd(shipping)}</strong></div>
          <div><span>Tax</span><strong>Skipped for staging test</strong></div>
          <div className="total"><span>Test total</span><strong>{formatUsd(total)}</strong></div>
          <div className="secure-line"><ShieldCheck/><span>Prices and stock are revalidated by the server.</span></div>
          <div className="readiness-list">{Object.entries(ready).map(([name,isReady])=><span key={name}><i className={isReady?"ready":""}/>{name==="tax"?"Tax skipped for test":`${name} ${isReady?"connected":"not connected"}`}</span>)}</div>
        </Card>
      </section>
    </main>
  );
}
