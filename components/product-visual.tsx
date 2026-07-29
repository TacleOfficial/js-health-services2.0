import type { Product } from "@/lib/types";

export function ProductVisual({ product, hero = false }: { product: Product; hero?: boolean }) {
  return (
    <div className={`product-visual ${hero ? "product-visual-hero" : ""}`} style={{ background: product.tone }}>
      <span className="visual-code">{product.code} / {product.variants[0].amount}</span>
      <div className="vial-shadow" />
      <div className="vial">
        <div className="vial-cap" />
        <div className="vial-glass">
          <div className="vial-label">
            <span className="vial-brand">VELLE</span>
            <strong>{product.name}</strong>
            <span>{product.variants[0].amount}</span>
            <small>RESEARCH USE ONLY</small>
          </div>
        </div>
      </div>
      {hero ? <div className="carton"><span>VELLE / RESEARCH MATERIAL</span><strong>{product.name}</strong><small>{product.batchId}</small></div> : null}
    </div>
  );
}
