"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Info, LockKeyhole, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, Input, Separator } from "@/components/ui";
import { formatUsd } from "@/lib/commerce/money";
import type { PaymentMethod } from "@/lib/commerce/types";

const previewSubtotal = 12600;
const previewShipping = 1800;
const previewTax = 0;

export function StagingCheckout({ ready }: { ready: Record<string, boolean> }) {
  const [method, setMethod] = useState<PaymentMethod>("zelle");
  const [step, setStep] = useState<"details" | "payment">("details");
  const [copied, setCopied] = useState(false);
  const total = useMemo(() => previewSubtotal + previewShipping + previewTax, []);
  const integrationsReady = Object.values(ready).every(Boolean);

  function copyMemo() {
    void navigator.clipboard.writeText("VEL-STAGING-PREVIEW");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main>
      <section className="page-hero commerce-hero">
        <div className="container">
          <span className="eyebrow">SECURE MANUAL PAYMENT</span>
          <h1>Checkout, with every state made clear</h1>
          <p>Zelle and Cash App submissions enter human verification. A screenshot never confirms payment, and fulfillment stays locked until authorized approval.</p>
        </div>
      </section>
      <section className="container checkout-layout commerce-checkout">
        <div className="commerce-main">
          <div className="checkout-steps" aria-label="Checkout progress">
            <span className={step === "details" ? "active" : ""}>01 Details</span>
            <span>02 Shipping</span>
            <span className={step === "payment" ? "active" : ""}>03 Payment</span>
            <span>04 Review</span>
          </div>

          {!integrationsReady ? (
            <div className="demo-alert" role="status">
              <LockKeyhole />
              <div><strong>Private staging is safely locked</strong><p>Connect Supabase, Stripe Tax, Shippo, and Brevo before order submission becomes available.</p></div>
            </div>
          ) : null}

          {step === "details" ? (
            <Card className="commerce-form-card">
              <div className="form-section-head"><span className="eyebrow">CONTACT & DELIVERY</span><Badge tone="warm">STAGING</Badge></div>
              <div className="form-grid">
                <label>First name<Input name="firstName" autoComplete="given-name" placeholder="Avery" /></label>
                <label>Last name<Input name="lastName" autoComplete="family-name" placeholder="Morgan" /></label>
                <label className="wide">Email<Input type="email" name="email" autoComplete="email" placeholder="avery@example.com" /></label>
                <label className="wide">Street address<Input name="line1" autoComplete="address-line1" placeholder="100 Research Way" /></label>
                <label>City<Input name="city" autoComplete="address-level2" placeholder="Indianapolis" /></label>
                <label>State<Input name="state" autoComplete="address-level1" placeholder="IN" maxLength={2} /></label>
                <label>Postal code<Input name="postalCode" autoComplete="postal-code" placeholder="46204" /></label>
                <label>Phone<Input name="phone" autoComplete="tel" placeholder="(555) 010-0200" /></label>
              </div>
              <label className="check-row">
                <input type="checkbox" />
                <span>I attest that I am an adult, legally eligible to purchase, and understand these materials are for research use only.</span>
              </label>
              <div className="form-actions">
                <Button onClick={() => setStep("payment")}>Continue to payment method</Button>
              </div>
            </Card>
          ) : (
            <Card className="commerce-form-card">
              <span className="eyebrow">SELECT PAYMENT METHOD</span>
              <h2>Send outside the website, then report it here</h2>
              <div className="payment-methods">
                {(["zelle", "cash_app"] as const).map((value) => (
                  <button key={value} type="button" className={method === value ? "payment-method active" : "payment-method"} onClick={() => setMethod(value)}>
                    <span>{value === "zelle" ? "Z" : "$"}</span>
                    <div><strong>{value === "zelle" ? "Zelle" : "Cash App"}</strong><small>Manual verification</small></div>
                    {method === value ? <Check /> : null}
                  </button>
                ))}
              </div>
              <div className="instruction-panel">
                <div><Badge tone="dark">{method === "zelle" ? "ZELLE" : "CASH APP"}</Badge><span className="eyebrow">EXACT AMOUNT</span></div>
                <strong className="instruction-total">{formatUsd(total)}</strong>
                <dl>
                  <div><dt>Destination</dt><dd>Hidden until production configuration</dd></div>
                  <div><dt>Required memo</dt><dd>VEL-STAGING-PREVIEW <button onClick={copyMemo} aria-label="Copy payment memo"><Copy />{copied ? "Copied" : "Copy"}</button></dd></div>
                  <div><dt>Reservation window</dt><dd>24 hours after order creation</dd></div>
                </dl>
              </div>
              <div className="truth-callout"><Info/><p><strong>Sending evidence does not confirm payment.</strong> An authorized reviewer must independently verify cleared funds before fulfillment can begin.</p></div>
              <div className="form-actions">
                <Button variant="outline" onClick={() => setStep("details")}>Back</Button>
                <Button disabled={!integrationsReady}>Create secured order</Button>
              </div>
            </Card>
          )}
        </div>

        <Card className="order-summary commerce-summary">
          <span className="eyebrow">ORDER SNAPSHOT</span>
          <div><span>Atlas 10 · 5 mg</span><strong>{formatUsd(5800)}</strong></div>
          <div><span>Helix B7 · 5 mg</span><strong>{formatUsd(6800)}</strong></div>
          <Separator />
          <div><span>Subtotal</span><strong>{formatUsd(previewSubtotal)}</strong></div>
          <div><span>Documented handling</span><strong>{formatUsd(previewShipping)}</strong></div>
          <div><span>Tax</span><strong>Calculated server-side</strong></div>
          <div className="total"><span>Preview total</span><strong>{formatUsd(total)}</strong></div>
          <div className="secure-line"><ShieldCheck/><span>Prices, stock, shipping, and tax are revalidated by the server.</span></div>
          <div className="readiness-list">
            {Object.entries(ready).map(([name, isReady]) => <span key={name}><i className={isReady ? "ready" : ""}/>{name} {isReady ? "connected" : "not connected"}</span>)}
          </div>
        </Card>
      </section>
    </main>
  );
}
