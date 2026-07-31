"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useTransition } from "react";
import { Check, ImageIcon, Info, LockKeyhole, Minus, Plus, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, Input, Separator } from "@/components/ui";
import { createGuestStagingOrder, quoteProductionShipping, type ShippingRate } from "@/app/checkout/actions";
import { formatUsd } from "@/lib/commerce/money";
import type { PaymentMethod } from "@/lib/commerce/types";

type Line = { id:string; sku:string; productTitle:string; variantTitle:string; priceCents:number; imageUrl:string; imageAlt:string };
type Details = { firstName:string;lastName:string;email:string;line1:string;line2:string;city:string;state:string;postalCode:string;phone:string;eligibilityAccepted:boolean };
const empty: Details = { firstName:"",lastName:"",email:"",line1:"",line2:"",city:"",state:"",postalCode:"",phone:"",eligibilityAccepted:false };

export function StagingCheckout({ ready, basket, mode, shippingMode, fixedShippingCents }: { ready:Record<string,boolean>; basket:Line[]; mode:"staging"|"production"; shippingMode:"shippo"|"manual_free"|"manual_fixed"; fixedShippingCents:number }) {
  const [method,setMethod]=useState<PaymentMethod>("zelle");
  const [step,setStep]=useState<"details"|"payment">("details");
  const [details,setDetails]=useState(empty);
  const [quantities,setQuantities]=useState<Record<string,number>>(()=>Object.fromEntries(basket.map(x=>[x.id,mode==="staging"?1:0])));
  const [rates,setRates]=useState<ShippingRate[]>([]);
  const [selectedRate,setSelectedRate]=useState<ShippingRate|null>(null);
  const [error,setError]=useState(""); const [pending,startTransition]=useTransition();
  const items=basket.filter(x=>(quantities[x.id]||0)>0).map(x=>({variantId:x.id,quantity:quantities[x.id]}));
  const subtotal=basket.reduce((sum,x)=>sum+x.priceCents*(quantities[x.id]||0),0);
  const shipping=mode==="staging"?1800:shippingMode==="manual_free"?0:shippingMode==="manual_fixed"?fixedShippingCents:selectedRate?.amountCents??0;
  const total=subtotal+shipping;
  const readyToStart=mode==="staging"?Object.values(ready).every(Boolean)&&basket.length===2:basket.length>0;
  const update=<K extends keyof Details>(key:K,value:Details[K])=>setDetails(current=>({...current,[key]:value}));
  const setLineQuantity=(id:string,quantity:number)=>setQuantities(current=>({...current,[id]:Math.max(0,Math.min(20,Number.isFinite(quantity)?Math.floor(quantity):0))}));

  function continueCheckout() {
    if(mode==="staging"||shippingMode!=="shippo"){setStep("payment");return;}
    setError(""); startTransition(async()=>{
      const result=await quoteProductionShipping({...details,items});
      if(!result.ok){setError(result.message);return;}
      setRates(result.rates);setSelectedRate(result.rates[0]??null);setStep("payment");
    });
  }
  function createOrder(){
    setError("");startTransition(async()=>{
      const result=await createGuestStagingOrder({...details,paymentMethod:method,eligibilityAccepted:details.eligibilityAccepted,idempotencyKey:crypto.randomUUID(),items,
        shippoShipmentId:selectedRate?.shipmentId,shippoRateId:selectedRate?.rateId,shippoRateSnapshot:selectedRate?.snapshot});
      if(!result.ok){setError(result.message);return;} window.location.assign(result.accessPath);
    });
  }
  return <main>
    <section className="page-hero commerce-hero"><div className="container"><span className="eyebrow">{mode==="staging"?"STAGING ORDER TEST":"SECURE CHECKOUT"}</span><h1>{mode==="staging"?"Checkout, with every state made clear":"Review and secure your order"}</h1><p>{mode==="staging"?"All payment details are fictional, and no funds should be sent.":"Prices, inventory, tax, and shipping are revalidated by the server."}</p></div></section>
    <section className="container checkout-layout commerce-checkout"><div className="commerce-main">
      <div className="checkout-steps"><span className={step==="details"?"active":""}>01 Details</span><span>02 Address & rates</span><span className={step==="payment"?"active":""}>03 Payment method</span><span>04 Review</span></div>
      {!readyToStart&&<div className="demo-alert"><LockKeyhole/><div><strong>{mode==="staging"?"Private staging is safely locked":"Production checkout is unavailable"}</strong><p>Complete the commerce readiness checklist.</p></div></div>}
      {error&&<div className="demo-alert" role="alert"><Info/><div><strong>Unable to continue</strong><p>{error}</p></div></div>}
      {step==="details"?<Card className="commerce-form-card"><form onSubmit={e=>{e.preventDefault();continueCheckout();}}>
        <div className="form-section-head"><span className="eyebrow">CONTACT & DELIVERY</span><Badge tone={mode==="production"?"verified":"warm"}>{mode.toUpperCase()}</Badge></div>
        {mode==="production"&&<>
          <div className="production-cart">
            <strong className="production-cart-title">Cart contents</strong>
            <div className="production-cart-list">{basket.map(line=>{
              const quantity=quantities[line.id]||0;
              return <div className="production-cart-row" key={line.id}>
                <div className="production-cart-product">
                  <span className="production-cart-thumbnail">{line.imageUrl?<img src={line.imageUrl} alt={line.imageAlt}/>:<ImageIcon aria-hidden="true"/>}</span>
                  <span className="production-cart-copy"><strong>{line.productTitle}</strong><small>{line.variantTitle}</small></span>
                </div>
                <div className="production-quantity" role="group" aria-label={`${line.productTitle} quantity`}>
                  <Button type="button" size="icon" variant="outline" onClick={()=>setLineQuantity(line.id,quantity-1)} disabled={quantity===0} aria-label={`Decrease ${line.productTitle} quantity`}><Minus/></Button>
                  <Input aria-label={`${line.productTitle} quantity value`} type="number" min="0" max="20" value={quantity} onChange={e=>setLineQuantity(line.id,Number(e.target.value))}/>
                  <Button type="button" size="icon" variant="outline" onClick={()=>setLineQuantity(line.id,quantity+1)} disabled={quantity===20} aria-label={`Increase ${line.productTitle} quantity`}><Plus/></Button>
                </div>
                <strong className="production-cart-price">{formatUsd(line.priceCents*quantity)}</strong>
              </div>;
            })}</div>
          </div>
          <Separator className="production-cart-separator"/>
        </>}
        <div className="form-grid">
          <label>First name<Input required value={details.firstName} onChange={e=>update("firstName",e.target.value)}/></label><label>Last name<Input required value={details.lastName} onChange={e=>update("lastName",e.target.value)}/></label>
          <label className="wide">Email<Input required type="email" value={details.email} onChange={e=>update("email",e.target.value)}/></label><label className="wide">Street address<Input required value={details.line1} onChange={e=>update("line1",e.target.value)}/></label>
          <label className="wide">Address line 2<Input value={details.line2} onChange={e=>update("line2",e.target.value)}/></label><label>City<Input required value={details.city} onChange={e=>update("city",e.target.value)}/></label>
          <label>State<Input required maxLength={2} value={details.state} onChange={e=>update("state",e.target.value)}/></label><label>Postal code<Input required pattern="\d{5}(-\d{4})?" value={details.postalCode} onChange={e=>update("postalCode",e.target.value)}/></label>
          <label>Phone<Input required value={details.phone} onChange={e=>update("phone",e.target.value)}/></label>
        </div>
        <label className="check-row"><input required type="checkbox" checked={details.eligibilityAccepted} onChange={e=>update("eligibilityAccepted",e.target.checked)}/><span>I attest that I am an adult, legally eligible to purchase, and understand these materials are for research use only.</span></label>
        <div className="form-actions"><Button type="submit" disabled={!readyToStart||!items.length||pending}>{pending?"Checking address and rates…":"Continue to payment method"}</Button></div>
      </form></Card>:<Card className="commerce-form-card">
        <span className="eyebrow">SELECT PAYMENT METHOD</span><h2>Send outside the website, then report it here</h2>
        {mode==="production"&&shippingMode==="shippo"&&<div className="shipping-rates"><strong>Shipping rate</strong>{rates.map(rate=><button type="button" className={selectedRate?.rateId===rate.rateId?"active":""} onClick={()=>setSelectedRate(rate)} key={rate.rateId}><span>{rate.label}{rate.estimatedDays?` · ${rate.estimatedDays} days`:""}</span><strong>{formatUsd(rate.amountCents)}</strong></button>)}</div>}
        <div className="payment-methods">{(["zelle","cash_app"] as const).map(value=><button key={value} type="button" className={method===value?"payment-method active":"payment-method"} onClick={()=>setMethod(value)}><span>{value==="zelle"?"Z":"$"}</span><div><strong>{value==="zelle"?"Zelle":"Cash App"}</strong><small>Manual verification</small></div>{method===value&&<Check/>}</button>)}</div>
        <div className="instruction-panel"><div><Badge tone="dark">{method==="zelle"?"ZELLE":"CASH APP"}</Badge><span className="eyebrow">EXACT AMOUNT</span></div><strong className="instruction-total">{formatUsd(total)}</strong><dl><div><dt>Destination</dt><dd>{mode==="staging"?(method==="zelle"?"test-only@example.invalid":"$TEST-NO-FUNDS"):"Shown securely after order creation"}</dd></div><div><dt>Payment window</dt><dd>24 hours after order creation</dd></div></dl></div>
        <div className="truth-callout"><Info/><p><strong>{mode==="staging"?"Do not send funds.":"Reports do not confirm payment."}</strong> An authorized reviewer independently verifies cleared funds before fulfillment.</p></div>
        <div className="form-actions"><Button variant="outline" onClick={()=>setStep("details")} disabled={pending}>Back</Button><Button onClick={createOrder} disabled={pending||(mode==="production"&&shippingMode==="shippo"&&!selectedRate)}>{pending?"Creating order…":"Create secured order"}</Button></div>
      </Card>}
    </div><Card className="order-summary commerce-summary"><span className="eyebrow">ORDER SNAPSHOT</span>{basket.filter(x=>(quantities[x.id]||0)>0).map(line=><div key={line.id}><span>{line.productTitle} · {line.variantTitle} × {quantities[line.id]}</span><strong>{formatUsd(line.priceCents*quantities[line.id])}</strong></div>)}<Separator/><div><span>Subtotal</span><strong>{formatUsd(subtotal)}</strong></div><div><span>{mode==="staging"?"Documented handling":"Shipping"}</span><strong>{mode==="production"&&shippingMode==="shippo"&&!selectedRate?"Select rate":shipping===0?"Free":formatUsd(shipping)}</strong></div><div><span>Tax</span><strong>{mode==="staging"?"Skipped for test":"Calculated server-side"}</strong></div><div className="total"><span>Preview total</span><strong>{formatUsd(total)}</strong></div><div className="secure-line"><ShieldCheck/><span>Prices, stock, shipping, and tax are revalidated by the server.</span></div></Card></section>
  </main>;
}
