"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import { Accordion, Dialog, Tooltip } from "radix-ui";
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, CircleUserRound, Clock3, FileCheck2,
  FlaskConical, Heart, HelpCircle, Menu, Minus, PackageCheck, Plus, Search,
  ShieldCheck, ShoppingBag, SlidersHorizontal, Trash2, X
} from "lucide-react";
import { articles, batches, categories, products } from "@/lib/data";
import type { DemoOrder, Product } from "@/lib/types";
import { Badge, Button, Card, Input, Select, Separator } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useDemo } from "@/components/demo-store";
import { ProductVisual } from "@/components/product-visual";
import { calculateCartPricing } from "@/lib/product-finder/cart-pricing";
import { productBundles } from "@/lib/product-finder/bundles";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
function Header() {
  const { cart } = useDemo();
  const count = cart.reduce((n, i) => n + i.quantity, 0);
  return (
    <>
      <div className="notice">DEMONSTRATION STOREFRONT · FICTIONAL RESEARCH MATERIALS · NO REAL ORDERS</div>
      <header className="header">
        <div className="container header-inner">
          <Link href="/" className="wordmark" aria-label="Velle home">VELLE<span>RESEARCH</span></Link>
          <nav className="desktop-nav" aria-label="Primary navigation">
            <Link href="/shop">Shop</Link><Link href="/quality">Testing & quality</Link><Link href="/batch">Batch lookup</Link><Link href="/research">Research</Link><Link href="/support">Support</Link>
          </nav>
          <div className="header-actions">
            <Link href="/account" className="icon-link" aria-label="Demo account"><CircleUserRound /></Link>
            <Link href="/cart" className="icon-link cart-link" aria-label={`Cart with ${count} items`}><ShoppingBag /><span>{count}</span></Link>
            <Dialog.Root>
              <Dialog.Trigger asChild><button className="icon-link mobile-menu" aria-label="Open menu"><Menu /></button></Dialog.Trigger>
              <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="menu-sheet"><Dialog.Title className="sr-only">Menu</Dialog.Title><Dialog.Close className="sheet-close"><X /></Dialog.Close><div className="sheet-nav"><Link href="/shop">Shop</Link><Link href="/quality">Testing & quality</Link><Link href="/batch">Batch lookup</Link><Link href="/research">Research</Link><Link href="/support">Support</Link><Link href="/account">Demo account</Link></div><p className="micro">Research use only. This site is a fictional interface demonstration.</p></Dialog.Content></Dialog.Portal>
            </Dialog.Root>
          </div>
        </div>
      </header>
    </>
  );
}

function Footer() {
  const { reset } = useDemo();
  return <footer className="footer"><div className="container">
    <div className="footer-top"><div><div className="wordmark footer-mark">VELLE<span>RESEARCH</span></div><p>Research materials, documented by batch.</p></div><div className="footer-columns">
      <div><strong>Shop /</strong><Link href="/shop">All products</Link><Link href="/batch">Batch lookup</Link><Link href="/quality">Testing</Link></div>
      <div><strong>Learn /</strong><Link href="/research">Research library</Link><Link href="/support">Support</Link><Link href="/quality">Quality process</Link></div>
      <div><strong>Demo /</strong><Link href="/account">Account</Link><Link href="/cart">Cart</Link><button onClick={reset}>Reset demo</button></div>
    </div></div>
    <Separator />
    <div className="footer-legal"><p><strong>RESEARCH USE ONLY.</strong> All products, batches, reports, laboratories, prices, and orders shown are fictional demonstration content. Not for human or veterinary use. No medical guidance or real purchasing is offered.</p><span>© 2026 Velle Research — interface concept</span></div>
  </div></footer>;
}

function VerificationGate() {
  const { consent, acceptConsent } = useDemo();
  const [checked, setChecked] = useState(false);
  return <Dialog.Root open={!consent} onOpenChange={() => {}}>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="verification-dialog" onEscapeKeyDown={e => e.preventDefault()}>
      <div className="gate-mark"><FlaskConical /></div><Badge tone="dark">RESEARCH USE VERIFICATION</Badge>
      <Dialog.Title>Before entering Velle</Dialog.Title>
      <Dialog.Description>This fictional prototype depicts products intended for controlled laboratory research only. It does not sell real materials or provide medical guidance.</Dialog.Description>
      <label className="check-row"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} /><span>I understand this is a demonstration and that the depicted materials are not for human or veterinary use.</span></label>
      <Button disabled={!checked} onClick={acceptConsent} size="lg">Enter demonstration</Button>
      <a className="exit-link" href="about:blank">Exit prototype</a>
      <p className="micro">Consent version 2026.07 is saved on this device. No personal information is collected.</p>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}

function ProductCard({ product }: { product: Product }) {
  const { addToCart, favorites, toggleFavorite, compare, toggleCompare } = useDemo();
  const { toast } = useToast();
  const disabled = product.status === "Temporarily unavailable";
  function quickAdd() {
    addToCart(product.id, product.variants[0].id);
    toast({ title: "Added to cart", description: `${product.name} · ${product.variants[0].label}` });
  }
  function handleCompare() {
    if (!compare.includes(product.id) && compare.length >= 3) {
      toast({ title: "Comparison is full", description: "Remove a product before adding another." });
      return;
    }
    toggleCompare(product.id);
  }
  return <article className="product-card">
    <Link href={`/products/${product.slug}`}><ProductVisual product={product} /></Link>
    <button className={`favorite ${favorites.includes(product.id) ? "active" : ""}`} onClick={() => toggleFavorite(product.id)} aria-label={`Favorite ${product.name}`}><Heart /></button>
    <div className="product-card-body">
      <div className="badge-line"><Badge tone={product.documentStatus === "Batch verified" ? "verified" : product.documentStatus === "Testing pending" ? "warm" : "neutral"}>{product.documentStatus}</Badge><span className={product.status === "Low stock" ? "stock-low" : ""}>{product.status}</span></div>
      <Link href={`/products/${product.slug}`}><h3>{product.name}</h3></Link><p>{product.descriptor}</p>
      <div className="product-meta"><span>{product.variants[0].amount}</span><strong>From {money(product.variants[0].price)}</strong></div>
      <div className="product-actions"><Button disabled={disabled} onClick={quickAdd}>{disabled ? "Unavailable" : "Quick add"}</Button><Tooltip.Provider><Tooltip.Root><Tooltip.Trigger asChild><button className={`compare-button ${compare.includes(product.id) ? "active" : ""}`} aria-pressed={compare.includes(product.id)} onClick={handleCompare} aria-label={`${compare.includes(product.id) ? "Remove" : "Add"} ${product.name} ${compare.includes(product.id) ? "from" : "to"} comparison`}><SlidersHorizontal /></button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="tooltip">{compare.includes(product.id) ? "Remove from comparison" : "Add to comparison"}<Tooltip.Arrow /></Tooltip.Content></Tooltip.Portal></Tooltip.Root></Tooltip.Provider></div>
    </div>
  </article>;
}

function BeforeAfterComparison() {
  const [position, setPosition] = useState(50);
  return <section className="section comparison-section">
    <div className="container">
      <div className="comparison-heading">
        <div><span className="eyebrow">DOCUMENTATION WORKFLOW / FICTIONAL</span><h2>From intake to documented release</h2></div>
        <p>Drag the divider to compare an incoming fictional material with its organized product and documentation system.</p>
      </div>
      <div className="comparison-frame" style={{ "--comparison-position": `${position}%` } as React.CSSProperties}>
        <Image className="comparison-image comparison-before" src="/velle-intake.png" width={1536} height={1024} unoptimized alt="Fictional Velle research vial at material intake" />
        <div className="comparison-after-wrap">
          <Image className="comparison-image comparison-after" src="/velle-release.png" width={1536} height={1024} unoptimized alt="The same fictional Velle vial with organized packaging and documentation" />
        </div>
        <span className="comparison-label comparison-label-before">BEFORE / INTAKE</span>
        <span className="comparison-label comparison-label-after">AFTER / DOCUMENTED</span>
        <div className="comparison-divider" aria-hidden="true">
          <span className="comparison-handle"><ArrowLeft /><ArrowRight /></span>
        </div>
        <input
          className="comparison-range"
          type="range"
          min="0"
          max="100"
          value={position}
          onChange={event => setPosition(Number(event.target.value))}
          aria-label="Compare material intake with documented release"
          aria-valuetext={`Divider at ${position}%`}
        />
        <output className="comparison-progress" aria-live="polite">{position}%</output>
      </div>
      <div className="comparison-caption"><span>Incoming material</span><span>Drag or use arrow keys</span><span>Documented system</span></div>
    </div>
  </section>;
}

function HomePage() {
  const hero = products[0];
  const { compare } = useDemo();
  return <main>
    <section className="hero container">
      <div className="hero-copy"><Badge>DOCUMENTED RESEARCH MATERIALS</Badge><h1>Precision begins with verification</h1><p>Fictional research products presented with clear batch records, direct specifications, and no unsupported promises.</p><div className="hero-actions"><Button asChild size="lg"><Link href="/get-started">Find your Velle match <ArrowRight /></Link></Button><Button asChild variant="outline" size="lg"><Link href="/shop">Browse products</Link></Button><Button asChild variant="ghost" size="lg"><Link href="/batch">Verify a demo batch</Link></Button></div><div className="hero-proof"><span><FileCheck2 /> Batch-linked records</span><span><ShieldCheck /> Transparent status</span><span><PackageCheck /> Documented handling</span></div></div>
      <ProductVisual product={hero} hero />
    </section>
    <section className="trust-band"><div className="container trust-grid"><div><span>01</span><strong>Identity</strong><p>Keep each record connected to the material it describes.</p></div><div><span>02</span><strong>Documentation</strong><p>Surface methods, dates, status, and limitations in context.</p></div><div><span>03</span><strong>Traceability</strong><p>Follow a fictional batch from release through the demo order.</p></div></div></section>
    <section className="system-image-section container"><Image src="/velle-system.png" width={1536} height={1024} unoptimized alt="Velle fictional vial and packaging system arranged on a stone plinth" /><div><span className="eyebrow">PRODUCT SYSTEM / FICTIONAL</span><strong>Material, packaging, and record—considered together.</strong></div></section>
    <BeforeAfterComparison />
    <section className="section container"><div className="section-head"><div><span className="eyebrow">FEATURED MATERIALS</span><h2>A considered research catalog</h2></div><Link href="/shop" className="text-link">View all 12 <ArrowRight /></Link></div><CompareSelectionBar selectedIds={compare}/><div className="product-grid">{products.slice(0,4).map(p => <ProductCard key={p.id} product={p} />)}</div></section>
    <section className="section quality-feature"><div className="container split"><div className="quality-panel"><span className="eyebrow">DEMO QUALITY SYSTEM</span><h2>See the record behind the label</h2><p>Every status and result in this prototype is marked as fictional. The interface demonstrates how genuine documentation could remain connected to product, batch, and order.</p><Button asChild variant="outline"><Link href="/quality">Explore the process</Link></Button></div><MockReport /></div></section>
    <section className="section container"><div className="editorial-intro"><span className="eyebrow">RESEARCH NOTES</span><h2>Clarity before interpretation</h2><p>Short primers explain how to read documentation without turning analytical data into human-use claims.</p></div><div className="article-grid">{articles.slice(0,3).map((a,i)=><ArticleCard key={a.slug} article={a} index={i+1}/>)}</div></section>
    <FaqSection />
  </main>;
}

function ShopPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("featured");
  const { compare } = useDemo();
  const list = useMemo(() => {
    const filtered = products.filter(p => (category === "All" || p.category === category) && `${p.name} ${p.descriptor} ${p.researchArea}`.toLowerCase().includes(query.toLowerCase()));
    return [...filtered].sort((a,b) => sort === "price-low" ? a.variants[0].price-b.variants[0].price : sort === "name" ? a.name.localeCompare(b.name) : Number(Boolean(b.featured))-Number(Boolean(a.featured)));
  }, [query, category, sort]);
  return <main><PageHero eyebrow="CATALOG / 12 MATERIALS" title="Research products, documented by batch" text="Browse a fictional catalog designed around clear specifications and visible documentation states." />
    <section className="container shop-section"><div className="shop-tools"><label className="search-box"><Search /><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search materials or research area" aria-label="Search products" /></label><Select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sort products"><option value="featured">Featured first</option><option value="price-low">Price: low to high</option><option value="name">Name</option></Select></div>
      <div className="filter-row">{categories.map(c=><button key={c} className={category===c?"active":""} onClick={()=>setCategory(c)}>{c}</button>)}</div>
      <CompareSelectionBar selectedIds={compare}/>
      <div className="results-line"><span>{list.length} products</span><span>All content is fictional</span></div>
      {list.length ? <div className="product-grid">{list.map(p=><ProductCard key={p.id} product={p}/>)}</div> : <EmptyState title="No materials found" text="Try another search or clear the current category." action={()=>{setQuery("");setCategory("All")}} />}
    </section></main>;
}

function ProductPage({ slug }: { slug: string }) {
  const product = products.find(p=>p.slug===slug);
  const [variantId,setVariantId]=useState(product?.variants[0].id || "");
  const [quantity,setQuantity]=useState(1);
  const { addToCart }=useDemo();
  if(!product) return <NotFound />;
  const variant=product.variants.find(v=>v.id===variantId)!;
  const batch=batches.find(b=>b.id===product.batchId);
  return <main>
    <div className="container breadcrumbs"><Link href="/shop"><ArrowLeft/> Back to shop</Link><span>Products / {product.name}</span></div>
    <section className="container product-detail">
      <div className="gallery"><ProductVisual product={product} hero/><div className="gallery-thumbs"><button className="active"><span>01</span>Product system</button><button><span>02</span>Label detail</button><button><span>03</span>Packaging</button></div></div>
      <div className="purchase-panel"><Badge tone={product.documentStatus==="Batch verified"?"verified":"neutral"}>{product.documentStatus}</Badge><h1>{product.name}</h1><p className="lead">{product.descriptor}</p><div className="price">{money(variant.price)} <span>Demo price</span></div>
        <fieldset><legend>Material amount</legend><div className="variant-grid">{product.variants.map(v=><button key={v.id} className={variantId===v.id?"active":""} onClick={()=>setVariantId(v.id)}><strong>{v.amount}</strong><span>{money(v.price)}</span></button>)}</div></fieldset>
        <div className="purchase-row"><div className="quantity"><button onClick={()=>setQuantity(Math.max(1,quantity-1))} aria-label="Decrease quantity"><Minus/></button><span>{quantity}</span><button onClick={()=>setQuantity(quantity+1)} aria-label="Increase quantity"><Plus/></button></div><Button size="lg" disabled={product.status==="Temporarily unavailable"} onClick={()=>addToCart(product.id,variant.id,quantity)}>{product.status==="Temporarily unavailable"?"Unavailable":"Add to demo cart"}</Button></div>
        <div className="ruo-box"><FlaskConical/><div><strong>Research use only</strong><p>Fictional demonstration material. Not for human or veterinary use. No real order will be placed.</p></div></div>
        <div className="purchase-details"><span><PackageCheck/> {product.status}</span><span><FileCheck2/> {product.batchId}</span><span><Clock3/> Demo dispatch: 1–2 days</span></div>
      </div>
    </section>
    <section className="spec-strip"><div className="container"><Spec label="FORM" value={product.form}/><Spec label="ACTIVE BATCH" value={product.batchId}/><Spec label="DOCUMENT" value={product.documentStatus}/><Spec label="STORAGE" value="Per fictional label"/></div></section>
    <section className="section container split product-story"><div><span className="eyebrow">PRODUCT CONTEXT</span><h2>Built for documented bench research</h2><p>{product.name} is a fictional reference material created solely to demonstrate a traceable commerce interface. Its naming, specifications, and availability do not correspond to a real compound.</p><p>The design keeps the material, selected amount, batch status, handling note, and evidence limitations close together.</p></div>{batch?<MockReport batch={batch}/>:<Card className="pending-card"><Clock3/><h3>Testing record pending</h3><p>This fictional batch is not released for the demo catalog.</p></Card>}</section>
    <section className="section muted-section"><div className="container"><div className="section-head"><div><span className="eyebrow">RELATED MATERIALS</span><h2>Explore the catalog</h2></div></div><div className="product-grid">{products.filter(p=>p.id!==product.id).slice(0,3).map(p=><ProductCard key={p.id} product={p}/>)}</div></div></section>
  </main>;
}

function MockReport({ batch=batches[0] }: { batch?: typeof batches[number] }) {
  return <Card className="report-card"><div className="report-header"><div><span>VELLE / DEMO RECORD</span><strong>FICTIONAL CERTIFICATE PREVIEW</strong></div><Badge tone={batch.status==="Verified"?"verified":"warm"}>{batch.status.toUpperCase()}</Badge></div><div className="demo-watermark">DEMO<br/>NOT A REAL COA</div><div className="report-lines"><span/><span/><span/><span className="short"/></div><div className="report-data"><Spec label="BATCH ID" value={batch.id}/><Spec label="REPORT DATE" value={batch.reportDate}/><Spec label="METHOD" value={batch.method}/><Spec label="RESULT" value={batch.purity}/></div><p>This preview is intentionally non-downloadable and cannot be used as laboratory evidence.</p></Card>;
}

function BatchPage() {
  const [query,setQuery]=useState("");
  const [searched,setSearched]=useState(false);
  const record=batches.find(b=>b.id.toLowerCase()===query.trim().toLowerCase());
  return <main><PageHero eyebrow="TRACEABILITY / DEMONSTRATION" title="Verify a batch" text="Enter an exact fictional identifier to inspect its connected demo record."/>
    <section className="container batch-search"><div className="search-panel"><label htmlFor="batch-id">Demo batch identifier</label><div><Input id="batch-id" value={query} onChange={e=>{setQuery(e.target.value);setSearched(false)}} placeholder="Try DEMO-ATL-2607"/><Button onClick={()=>setSearched(true)}>Verify batch</Button></div><p>Example identifiers: DEMO-ATL-2607, DEMO-HLX-2604, DEMO-VEC-PENDING, DEMO-LMN-2512</p></div>
    {searched && record && <div className="batch-result"><div className="result-summary"><Badge tone={record.status==="Verified"?"verified":"warm"}>{record.status.toUpperCase()}</Badge><h2>{products.find(p=>p.slug===record.productSlug)?.name}</h2><p>Exact demo match found. This record is fictional and provided only to demonstrate interface behavior.</p><div className="result-grid"><Spec label="BATCH ID" value={record.id}/><Spec label="LABORATORY" value={record.laboratory}/><Spec label="REPORT DATE" value={record.reportDate}/><Spec label="STORAGE" value={record.storage}/></div></div><MockReport batch={record}/></div>}
    {searched && !record && <EmptyState title="No exact demo match" text="The identifier is invalid or is not included in this prototype. Partial matches are never shown." action={()=>{setQuery("DEMO-ATL-2607");setSearched(false)}} actionLabel="Use an example"/>}
    {!searched && <div className="batch-help"><div className="label-diagram"><span>VELLE</span><strong>Atlas 10</strong><em>DEMO-ATL-2607</em></div><div><span className="eyebrow">WHERE TO LOOK</span><h2>Find the code on the label</h2><p>A complete identifier appears below the material name on the fictional vial label and demo order record.</p></div></div>}
    </section></main>;
}

function QualityPage() {
  return <main><PageHero eyebrow="TESTING & QUALITY" title="Evidence stays connected" text="A demonstration of how identity, purity, documentation, and release status can be presented without overstating what the evidence means."/>
    <section className="container section process-grid">{["Material received","Identity review","Analytical review","Record connected","Demo release"].map((s,i)=><div key={s}><span>0{i+1}</span><strong>{s}</strong><p>{["A fictional intake record begins the chain.","The interface distinguishes identity from purity.","Methods and limitations remain visible.","The record is linked to one exact demo batch.","Only verified demo states appear as available."][i]}</p></div>)}</section>
    <section className="quality-dark"><div className="container split"><div><Badge tone="neutral">NO FABRICATED EVIDENCE</Badge><h2>A report is only useful in context</h2><p>Real certificates must come from genuine laboratories. This prototype uses watermarked, non-downloadable layouts and clearly fictional values to demonstrate responsible presentation.</p></div><MockReport/></div></section>
    <section className="section container"><div className="editorial-intro"><span className="eyebrow">TERMS THAT ANSWER DIFFERENT QUESTIONS</span><h2>Identity is not purity. Purity is not assay.</h2></div><div className="definition-grid"><Card><span>01</span><h3>Identity</h3><p>Asks whether the material matches its stated identity under the reported method.</p></Card><Card><span>02</span><h3>Purity</h3><p>Describes the proportion represented by the target peak under a defined analytical method.</p></Card><Card><span>03</span><h3>Assay</h3><p>Measures content or potency under its own validated procedure and units.</p></Card></div></section>
  </main>;
}

function ResearchPage({ slug }: { slug?: string }) {
  if (slug) {
    const article=articles.find(a=>a.slug===slug); if(!article)return <NotFound/>;
    return <main className="article-page"><div className="container article-layout"><aside><Link href="/research"><ArrowLeft/> Research library</Link><span>TOPIC</span><strong>{article.topic}</strong><span>SCOPE</span><strong>{article.evidence}</strong><span>UPDATED</span><strong>{article.updated}</strong></aside><article><Badge>{article.evidence}</Badge><h1>{article.title}</h1><p className="article-lead">{article.summary}</p><div className="article-callout"><strong>Scope note</strong><p>This educational demo discusses document interpretation only. It does not establish efficacy, safety, dosing, or suitability for any use.</p></div><h2>Start with the question</h2><p>Analytical documents are easiest to interpret when the method and the question it answers are explicit. A single result should not be extended beyond its stated scope.</p><h2>Keep the record connected</h2><p>Material name, batch identifier, report date, laboratory, method, and result belong together. Removing one piece can make an otherwise precise number misleading.</p><figure><div className="figure-chart"><span style={{height:"28%"}}/><span style={{height:"48%"}}/><span style={{height:"88%"}}/><span style={{height:"34%"}}/><span style={{height:"18%"}}/></div><figcaption>Figure 1. Abstract educational visualization — not analytical data.</figcaption></figure><h2>Read the limitation nearby</h2><p>A responsible interface places the limitation beside the interpretation, not behind a distant disclaimer. That design choice helps prevent a method-specific observation from becoming an unsupported claim.</p></article></div></main>;
  }
  return <main><PageHero eyebrow="RESEARCH LIBRARY" title="Documentation, explained with restraint" text="Educational primers about analytical records, traceability, and careful interpretation."/><section className="section container"><div className="article-grid article-grid-wide">{articles.map((a,i)=><ArticleCard key={a.slug} article={a} index={i+1}/>)}</div></section></main>;
}

function ArticleCard({article,index}:{article:typeof articles[number];index:number}){return <Link href={`/research/${article.slug}`} className="article-card"><div><span>0{index}</span><Badge>{article.evidence}</Badge></div><h3>{article.title}</h3><p>{article.summary}</p><footer><span>{article.topic} · {article.readTime}</span><ArrowRight/></footer></Link>}

function SupportPage(){return <main><PageHero eyebrow="SUPPORT CENTER" title="Clear answers, direct paths" text="Explore common prototype questions or open a fictional support request."/><section className="container support-search"><Search/><Input placeholder="Search support topics" aria-label="Search support topics"/></section><section className="container support-grid"><Card><PackageCheck/><h3>Orders & shipping</h3><p>Demo order status, fictional fulfillment, and handling.</p></Card><Card><FileCheck2/><h3>Testing & records</h3><p>Batch lookup, report status, and documentation language.</p></Card><Card><FlaskConical/><h3>Research-use limits</h3><p>What this demonstration does and does not represent.</p></Card></section><FaqSection/><section className="section container support-cta"><div><span className="eyebrow">STILL NEED HELP?</span><h2>Open a demo support request</h2><p>No message will be transmitted. This interaction is presentational only.</p></div><Button onClick={()=>alert("Demo only — no support request was sent.")}>Contact demo support</Button></section></main>}

function FaqSection(){const qs=[["Is this a real store?","No. Velle Research is an original interface concept. Every product, laboratory, result, price, batch, and order is fictional."],["Can I enter real payment information?","No. The checkout is a simulation. Use only the on-screen demo values; nothing is transmitted or retained."],["Are the report previews genuine CoAs?","No. They are visibly watermarked, non-downloadable interface demonstrations and are not laboratory evidence."],["Does this site offer medical guidance?","No. It does not provide dosing, administration, reconstitution, treatment, or health guidance."]];return <section className="section faq-section"><div className="container faq-layout"><div><span className="eyebrow">FREQUENTLY ASKED</span><h2>Questions, answered plainly</h2></div><Accordion.Root type="single" collapsible>{qs.map(([q,a],i)=><Accordion.Item key={q} value={`q${i}`}><Accordion.Header><Accordion.Trigger><span>{q}</span><ChevronDown/></Accordion.Trigger></Accordion.Header><Accordion.Content>{a}</Accordion.Content></Accordion.Item>)}</Accordion.Root></div></section>}

function AccountPage(){const {orders,favorites}=useDemo();return <main><PageHero eyebrow="DEMO ACCOUNT" title="Good afternoon, researcher" text="A local-only view of saved products, rewards, and fictional orders."/><section className="container account-layout"><aside><strong>Overview</strong><span>Orders</span><span>Saved products</span><span>Rewards</span><span>Profile</span></aside><div><div className="account-stats"><Card><span>DEMO REWARDS</span><strong>420</strong><p>Fictional points balance</p></Card><Card><span>SAVED MATERIALS</span><strong>{favorites.length}</strong><p>Stored on this device</p></Card><Card><span>DEMO ORDERS</span><strong>{orders.length}</strong><p>No real purchases</p></Card></div><section className="account-orders"><div className="section-head compact"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Demo orders</h2></div></div>{orders.length?orders.map(o=><Card key={o.id} className="order-row"><div><Badge tone="verified">{o.status}</Badge><strong>{o.id}</strong><span>{o.date}</span></div><div><strong>{money(o.total)}</strong><span>{o.itemCount} item{o.itemCount!==1?"s":""}</span></div></Card>):<EmptyState title="No demo orders yet" text="Complete the simulated checkout to see a local order here." href="/shop" actionLabel="Browse products"/>}</section></div></section></main>}

function CartPage(){const {cart,updateQuantity}=useDemo();const detail=cart.map(item=>{const p=products.find(x=>x.id===item.productId)!;const v=p.variants.find(x=>x.id===item.variantId)!;return {...item,p,v}});const pricing=calculateCartPricing(cart,products,productBundles);return <main><PageHero eyebrow="DEMO CART" title="Review your materials" text="No real purchase will be made. Prices and fulfillment details are fictional."/><section className="container cart-layout"><div>{detail.length?detail.map(i=><div className="cart-item" key={`${i.productId}-${i.variantId}-${i.bundleInstanceId??"regular"}`}><ProductVisual product={i.p}/><div>{i.bundleId?<Badge tone="warm">Bundle item</Badge>:<Badge>{i.p.documentStatus}</Badge>}<h3>{i.p.name}</h3><p>{i.v.label} · {i.p.batchId}</p><div className="quantity"><button aria-label={`Decrease ${i.p.name} quantity`} onClick={()=>updateQuantity(i.productId,i.variantId,i.quantity-1,i.bundleInstanceId)}><Minus/></button><span>{i.quantity}</span><button aria-label={`Increase ${i.p.name} quantity`} onClick={()=>updateQuantity(i.productId,i.variantId,i.quantity+1,i.bundleInstanceId)}><Plus/></button></div></div><div className="cart-price"><strong>{money(i.v.price*i.quantity)}</strong><button onClick={()=>updateQuantity(i.productId,i.variantId,0,i.bundleInstanceId)}><Trash2/> Remove</button></div></div>):<EmptyState title="Your demo cart is empty" text="Browse the fictional catalog to add a research material." href="/shop" actionLabel="Browse products"/>}</div>{detail.length>0?<OrderSummary pricing={pricing}/>:null}</section></main>}

function OrderSummary({pricing,checkout=false}:{pricing:ReturnType<typeof calculateCartPricing>;checkout?:boolean}){const shipping=pricing.discountedSubtotal>=150?0:18;return <Card className="order-summary"><span className="eyebrow">ORDER SUMMARY</span><div><span>Subtotal</span><strong>{money(pricing.subtotal)}</strong></div>{pricing.bundleDiscounts.map(line=><div className="bundle-discount-line" key={line.bundleInstanceId}><span>{line.name}</span><strong>−{money(line.amount)}</strong></div>)}<div><span>Demo handling</span><strong>{shipping?money(shipping):"Included"}</strong></div><div><span>Estimated tax</span><strong>{money(0)}</strong></div><Separator/><div className="total"><span>Demo total</span><strong>{money(pricing.discountedSubtotal+shipping)}</strong></div><p>Research-use acknowledgement remains required. No fees or payment will be processed.</p>{!checkout?<Button asChild size="lg"><Link href="/checkout">Continue to demo checkout</Link></Button>:null}</Card>}

function CheckoutPage(){const {cart,completeOrder}=useDemo();const [step,setStep]=useState("details");const [order,setOrder]=useState<DemoOrder|null>(null);const pricing=calculateCartPricing(cart,products,productBundles);const subtotal=pricing.discountedSubtotal;const total=subtotal+(subtotal>=150?0:18);if(order)return <main className="confirmation"><div className="container"><div className="success-icon"><Check/></div><Badge tone="verified">DEMO ORDER CONFIRMED</Badge><h1>Simulation complete</h1><p>No payment was processed and no fulfillment will occur. A non-sensitive order summary is saved locally for this demonstration.</p><Card><Spec label="ORDER" value={order.id}/><Spec label="DATE" value={order.date}/><Spec label="TOTAL" value={money(order.total)}/><Spec label="STATUS" value={order.status}/></Card><div><Button asChild><Link href="/account">View demo account</Link></Button><Button asChild variant="outline"><Link href="/shop">Return to shop</Link></Button></div></div></main>;if(!cart.length)return <main><PageHero eyebrow="DEMO CHECKOUT" title="Your cart is empty" text="Add a fictional material before starting the checkout simulation."/><div className="container"><EmptyState title="Nothing to check out" text="No order can be simulated yet." href="/shop" actionLabel="Browse products"/></div></main>;
  return <main><PageHero eyebrow="SIMULATION ONLY" title="Demo checkout" text="Use fictional information only. Values entered below are kept in memory for this screen and discarded."/><section className="container checkout-layout"><div><div className="checkout-steps"><span className={step==="details"?"active":""}>01 Details</span><span className={step==="shipping"?"active":""}>02 Shipping</span><span className={step==="payment"?"active":""}>03 Demo payment</span></div><div className="demo-alert"><ShieldCheck/><div><strong>Do not enter real personal or payment information</strong><p>This form never transmits or stores field values. Use the fictional values shown in the placeholders.</p></div></div>
    {step==="details"&&<form className="form-grid" onSubmit={e=>{e.preventDefault();setStep("shipping")}}><h2>Contact & address</h2><label>Email<Input required type="email" placeholder="researcher@example.test"/></label><label>Full name<Input required placeholder="Demo Researcher"/></label><label className="wide">Address<Input required placeholder="100 Fictional Lab Way"/></label><label>City<Input required placeholder="Testville"/></label><label>State<Select required defaultValue=""><option value="" disabled>Select</option><option>Indiana</option><option>Ohio</option></Select></label><label>Postal code<Input required placeholder="00000" pattern="[0-9]{5}"/></label><div className="form-actions wide"><Button type="submit">Continue to shipping</Button></div></form>}
    {step==="shipping"&&<form onSubmit={e=>{e.preventDefault();setStep("payment")}}><h2>Demo shipping method</h2><label className="radio-card"><input type="radio" name="shipping" defaultChecked/><div><strong>Documented handling</strong><span>Fictional delivery in 2–4 business days</span></div><strong>{subtotal>=150?"Included":"$18.00"}</strong></label><label className="check-row"><input type="checkbox" required/><span>I acknowledge that all depicted products and fulfillment details are fictional and research-use-only.</span></label><div className="form-actions"><Button variant="outline" type="button" onClick={()=>setStep("details")}>Back</Button><Button type="submit">Continue to demo payment</Button></div></form>}
    {step==="payment"&&<form className="form-grid" onSubmit={e=>{e.preventDefault();setOrder(completeOrder(total))}}><h2>Demo payment</h2><div className="fake-card wide"><span>SIMULATION CARD</span><strong>4242 4242 4242 4242</strong><small>NO PAYMENT CAPABILITY</small></div><label className="wide">Card-shaped demo field<Input required defaultValue="4242 4242 4242 4242" readOnly aria-describedby="payment-note"/></label><label>Expiry<Input required defaultValue="12/34" readOnly/></label><label>Security code<Input required defaultValue="000" readOnly/></label><p id="payment-note" className="micro wide">These fixed demonstration values cannot be changed and are not payment credentials.</p><div className="form-actions wide"><Button variant="outline" type="button" onClick={()=>setStep("shipping")}>Back</Button><Button type="submit">Place demo order</Button></div></form>}
  </div><OrderSummary pricing={pricing} checkout/></section></main>}

function ComparePage(){const {compare,toggleCompare}=useDemo();const selected=products.filter(p=>compare.includes(p.id));const rows: Array<[string,(p:Product)=>string]>=[["Amount",(p:Product)=>p.variants[0].amount],["Price",(p:Product)=>money(p.variants[0].price)],["Form",(p:Product)=>p.form],["Status",(p:Product)=>p.status],["Document",(p:Product)=>p.documentStatus],["Batch",(p:Product)=>p.batchId]];return <main><PageHero eyebrow="PRODUCT COMPARISON" title="Compare documented facts" text="Up to three fictional materials, aligned by specification rather than unsupported outcomes."/><section className="container compare-page">{selected.length?<div className="compare-table"><div className="compare-row compare-products"><strong>Material</strong>{selected.map(p=><div key={p.id}><ProductVisual product={p}/><h3>{p.name}</h3><button onClick={()=>toggleCompare(p.id)}>Remove</button></div>)}</div>{rows.map(([label,get])=><div className="compare-row" key={label}><strong>{label}</strong>{selected.map(p=><span key={p.id}>{get(p)}</span>)}</div>)}</div>:<EmptyState title="No products selected" text="Choose compare on up to three catalog cards." href="/shop" actionLabel="Browse products"/>}</section></main>}

function CompareSelectionBar({ selectedIds }: { selectedIds: string[] }) {
  const { toggleCompare } = useDemo();
  const selected = products.filter((product) => selectedIds.includes(product.id));
  if (!selected.length) return null;
  return <aside className="compare-selection" aria-label="Selected products for comparison">
    <div className="compare-selection-copy"><Badge tone="dark">{selected.length}/3 selected</Badge><span>{selected.map((product) => product.name).join(" · ")}</span></div>
    <div className="compare-selection-actions"><button type="button" onClick={() => selected.forEach((product) => toggleCompare(product.id))}>Clear selection</button><Button asChild size="sm"><Link href="/compare">Compare products <ArrowRight /></Link></Button></div>
  </aside>;
}

function PageHero({eyebrow,title,text}:{eyebrow:string;title:string;text:string}){return <section className="page-hero container"><Badge>{eyebrow}</Badge><h1>{title}</h1><p>{text}</p></section>}
function Spec({label,value}:{label:string;value:string}){return <div className="spec"><span>{label}</span><strong>{value}</strong></div>}
function EmptyState({title,text,action,href,actionLabel="Clear filters"}:{title:string;text:string;action?:()=>void;href?:string;actionLabel?:string}){return <Card className="empty-state"><HelpCircle/><h3>{title}</h3><p>{text}</p>{href?<Button asChild variant="outline"><Link href={href}>{actionLabel}</Link></Button>:action&&<Button variant="outline" onClick={action}>{actionLabel}</Button>}</Card>}
function NotFound(){return <main><div className="container not-found"><span className="eyebrow">404 / NOT FOUND</span><h1>This record is not in the demonstration</h1><p>The route or identifier does not match the fictional prototype data.</p><Button asChild><Link href="/shop">Return to catalog</Link></Button></div></main>}

function Router({path}:{path:string}) {
  const clean=path.replace(/^\/|\/$/g,""); const parts=clean.split("/");
  if(!clean)return <HomePage/>; if(clean==="shop")return <ShopPage/>; if(parts[0]==="products")return <ProductPage slug={parts[1]||""}/>; if(clean==="batch")return <BatchPage/>; if(clean==="quality")return <QualityPage/>; if(parts[0]==="research")return <ResearchPage slug={parts[1]}/>; if(clean==="support")return <SupportPage/>; if(clean==="account")return <AccountPage/>; if(clean==="cart")return <CartPage/>; if(clean==="checkout")return <CheckoutPage/>; if(clean==="compare")return <ComparePage/>; return <NotFound/>;
}

export function Storefront({path}:{path:string}) {
  return <Tooltip.Provider delayDuration={250}><Header/><Router path={path}/><Footer/><VerificationGate/></Tooltip.Provider>;
}
