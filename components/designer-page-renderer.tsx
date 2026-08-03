import Image from "next/image";
import Link from "next/link";
import { type DesignerBlock, type PageDocument } from "@/lib/designer";
import { Button, Separator } from "@/components/ui";

function RenderBlock({ block, preview = false }: { block: DesignerBlock; preview?: boolean }) {
  if (!block.visible) return preview ? <div className="designer-hidden-preview">Hidden section · {block.type.replaceAll("_", " ")}</div> : null;
  if (block.type === "hero") return <section className="designer-public-hero container"><div><span className="eyebrow">{block.eyebrow}</span><h1>{block.title}</h1><p>{block.text}</p><div>{block.primaryLabel && <Button asChild><Link href={block.primaryHref}>{block.primaryLabel}</Link></Button>}{block.secondaryLabel && block.secondaryHref && <Button asChild variant="outline"><Link href={block.secondaryHref}>{block.secondaryLabel}</Link></Button>}</div></div></section>;
  if (block.type === "rich_text") return <section className="section container designer-rich-text">{block.eyebrow && <span className="eyebrow">{block.eyebrow}</span>}{block.title && <h2>{block.title}</h2>}<div>{block.body.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></section>;
  if (block.type === "image") return <figure className="section container designer-image-block"><Image src={block.src} alt={block.alt} width={1536} height={1024} sizes="100vw" />{block.caption && <figcaption>{block.caption}</figcaption>}</figure>;
  if (block.type === "split") return <section className={`section container designer-split-block ${block.imageSide === "left" ? "image-left" : ""}`}><div>{block.eyebrow && <span className="eyebrow">{block.eyebrow}</span>}<h2>{block.title}</h2><p>{block.text}</p></div><Image src={block.imageSrc} alt={block.imageAlt} width={900} height={700} sizes="(max-width: 760px) 100vw, 50vw" /></section>;
  if (block.type === "cta") return <section className="section container"><div className="designer-cta-block"><div><h2>{block.title}</h2><p>{block.text}</p></div><Button asChild><Link href={block.href}>{block.label}</Link></Button></div></section>;
  if (block.type === "feature_grid") return <section className="section container">{(block.eyebrow || block.title) && <div className="section-head"><div>{block.eyebrow && <span className="eyebrow">{block.eyebrow}</span>}{block.title && <h2>{block.title}</h2>}</div></div>}<div className="designer-feature-grid">{block.items.map(item => <article key={item.id}><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></section>;
  if (block.type === "faq") return <section className="section container designer-faq-block">{block.eyebrow && <span className="eyebrow">{block.eyebrow}</span>}{block.title && <h2>{block.title}</h2>}{block.items.map(item => <details key={item.id}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>;
  if (block.type === "spacer") return <div className={`designer-spacer ${block.size}`}>{block.divider && <Separator />}</div>;
  if (block.type === "product_grid" || block.type === "article_grid") return <section className="section container designer-data-grid-placeholder"><span className="eyebrow">{block.eyebrow}</span><h2>{block.title || (block.type === "product_grid" ? "Products" : "Articles")}</h2><div>{Array.from({ length: Math.min(block.limit, 4) }, (_, index) => <div key={index}><span>{block.type === "product_grid" ? "Product" : "Article"} {index + 1}</span></div>)}</div></section>;
  return <section className="designer-locked-block-preview"><strong>{block.label}</strong><span>Locked functional block · {block.component.replaceAll("_", " ")}</span></section>;
}

export function DesignerPageRenderer({ document, preview = false }: { document: PageDocument; preview?: boolean }) {
  return <main className={preview ? "designer-preview-document" : "designer-published-document"}>
    {document.blocks.map(block => <RenderBlock block={block} preview={preview} key={block.id} />)}
  </main>;
}
