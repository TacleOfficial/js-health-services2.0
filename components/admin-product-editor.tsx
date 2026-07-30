"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, Input, Select } from "@/components/ui";
import { saveAdminProduct } from "@/app/admin/actions";
import type { AdminProductActionState, AdminProductInput } from "@/lib/admin-products";

const initialActionState: AdminProductActionState = { ok: false };
const blankVariant = () => ({
  sku: "", title: "", price: 0, weightGrams: 0, status: "draft" as const, onHand: 0, committed: 0,
});

export function AdminProductEditor({ initial, canManage }: { initial?: AdminProductInput; canManage: boolean }) {
  const [product, setProduct] = useState<AdminProductInput>(initial ?? {
    title: "", slug: "", description: "", category: "", status: "draft", variants: [blankVariant()],
  });
  const [slugEdited, setSlugEdited] = useState(Boolean(initial));
  const [state, action, pending] = useActionState(saveAdminProduct, initialActionState);
  const updateVariant = (index: number, values: Partial<AdminProductInput["variants"][number]>) => {
    setProduct(current => ({ ...current, variants: current.variants.map((variant, variantIndex) => variantIndex === index ? { ...variant, ...values } : variant) }));
  };
  return <form action={action} className="admin-product-form">
    <input type="hidden" name="payload" value={JSON.stringify(product)} />
    {!canManage ? <Card className="admin-aal-warning"><div><strong>Manager access required</strong><p>A manager or super-admin role is required to change catalog data.</p></div></Card> : null}
    {state.message ? <p className="admin-product-error" role="alert">{state.message}</p> : null}
    <Card className="admin-product-section">
      <div className="admin-product-section-head"><div><span className="eyebrow">PRODUCT DETAILS</span><h2>Catalog information</h2></div></div>
      <div className="admin-product-fields">
        <label>Product title<Input required value={product.title} onChange={event => {
          const title = event.target.value;
          setProduct(current => ({ ...current, title, slug: slugEdited ? current.slug : title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }));
        }} /></label>
        <label>Slug<Input required value={product.slug} onChange={event => { setSlugEdited(true); setProduct(current => ({ ...current, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })); }} /></label>
        <label>Category<Input required value={product.category} onChange={event => setProduct(current => ({ ...current, category: event.target.value }))} /></label>
        <label>Status<Select value={product.status} onChange={event => setProduct(current => ({ ...current, status: event.target.value as AdminProductInput["status"] }))}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></Select></label>
        <label className="admin-product-wide">Description<textarea required rows={5} value={product.description} onChange={event => setProduct(current => ({ ...current, description: event.target.value }))} /></label>
      </div>
    </Card>
    <Card className="admin-product-section">
      <div className="admin-product-section-head"><div><span className="eyebrow">VARIANTS & INVENTORY</span><h2>Sellable variants</h2><p>Each variant has independent pricing, status, and stock.</p></div><Button type="button" variant="outline" onClick={() => setProduct(current => ({ ...current, variants: [...current.variants, blankVariant()] }))}><Plus /> Add variant</Button></div>
      <div className="admin-variant-list">{product.variants.map((variant, index) => <section className="admin-variant-card" key={variant.id ?? `new-${index}`}>
        <div className="admin-variant-heading"><strong>Variant {index + 1}</strong><Button type="button" size="sm" variant="ghost" disabled={product.variants.length === 1} onClick={() => setProduct(current => ({ ...current, variants: current.variants.filter((_, variantIndex) => variantIndex !== index) }))}><Trash2 /> Remove</Button></div>
        <div className="admin-variant-fields">
          <label>Variant title<Input required value={variant.title} onChange={event => updateVariant(index, { title: event.target.value })} /></label>
          <label>SKU<Input required value={variant.sku} onChange={event => updateVariant(index, { sku: event.target.value.toUpperCase() })} /></label>
          <label>Price (USD)<Input required type="number" min="0" step="0.01" value={variant.price} onChange={event => updateVariant(index, { price: Number(event.target.value) })} /></label>
          <label>Weight (grams)<Input required type="number" min="0" step="1" value={variant.weightGrams} onChange={event => updateVariant(index, { weightGrams: Number(event.target.value) })} /></label>
          <label>Status<Select value={variant.status} onChange={event => updateVariant(index, { status: event.target.value as typeof variant.status })}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></Select></label>
          <label>On hand<Input required type="number" min={variant.committed} step="1" value={variant.onHand} onChange={event => updateVariant(index, { onHand: Number(event.target.value) })} /></label>
          <label>Committed<Input readOnly value={variant.committed} aria-describedby={`committed-${index}`} /><small id={`committed-${index}`}>Managed by active reservations.</small></label>
        </div>
      </section>)}</div>
    </Card>
    <div className="admin-product-submit"><Button asChild variant="outline"><Link href="/admin?view=inventory">Cancel</Link></Button><Button disabled={!canManage || pending}>{pending ? "Saving…" : initial ? "Save product" : "Create product"}</Button></div>
  </form>;
}
