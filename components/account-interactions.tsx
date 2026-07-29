"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { products } from "@/lib/data";
import { importSavedProducts } from "@/app/account/actions";

export function SavedProductsImporter() {
  const [slugs, setSlugs] = useState<string[]>([]);
  useEffect(() => {
    try {
      const demo = JSON.parse(localStorage.getItem("velle-demo-v1") || "{}");
      const matches = (demo.favorites || []).map((id: string) => products.find(product => product.id === id)?.slug).filter(Boolean);
      queueMicrotask(() => setSlugs(matches));
    } catch {}
  }, []);
  if (!slugs.length) return null;
  return <Card className="import-banner"><div><strong>Bring over saved products</strong><p>We found {slugs.length} saved item{slugs.length === 1 ? "" : "s"} on this device.</p></div><Button onClick={async () => { await importSavedProducts(slugs); localStorage.removeItem("velle-demo-v1"); setSlugs([]); }}>Import once</Button></Card>;
}

export function StripeCardSetup({ cards }: { cards: Array<{ id: string; brand: string; last4: string; exp_month: number; exp_year: number }> }) {
  return <Card><h3>Credit and debit cards</h3>{cards.map(card => <div className="session-row" key={card.id}><strong>{card.brand.toUpperCase()} ···· {card.last4}</strong><span>{card.exp_month}/{card.exp_year}</span></div>)}<p className="muted">Card details are collected and stored by Stripe. Setup begins only from a server-created SetupIntent.</p><Button asChild><Link href="/api/stripe/setup">Add card securely</Link></Button></Card>;
}
