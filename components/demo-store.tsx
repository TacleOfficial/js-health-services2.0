"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { products } from "@/lib/data";
import { productBundles } from "@/lib/product-finder/bundles";
import type { CartItem, DemoOrder } from "@/lib/types";

const storageKey = "velle-demo-v1";

type DemoState = {
  cart: CartItem[];
  favorites: string[];
  compare: string[];
  orders: DemoOrder[];
  consent?: { version: string; acceptedAt: string };
};

type DemoContextValue = DemoState & {
  addToCart: (productId: string, variantId: string, quantity?: number) => void;
  addBundle: (bundleId: string) => boolean;
  updateQuantity: (productId: string, variantId: string, quantity: number, bundleInstanceId?: string) => void;
  toggleFavorite: (id: string) => void;
  toggleCompare: (id: string) => void;
  acceptConsent: () => void;
  completeOrder: (total: number) => DemoOrder;
  reset: () => void;
};

const initialState: DemoState = { cart: [], favorites: [], compare: [], orders: [] };
const DemoContext = createContext<DemoContextValue | null>(null);

function unlinkBundle(cart: CartItem[], bundleInstanceId: string) {
  return cart.map((item) => item.bundleInstanceId === bundleInstanceId
    ? { productId: item.productId, variantId: item.variantId, quantity: item.quantity }
    : item);
}

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DemoState>(initialState);
  const [ready, setReady] = useState(false);
  const { toast } = useToast();
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      // Hydrate device-local demo state after the server render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setState(JSON.parse(saved) as DemoState);
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(storageKey, JSON.stringify(state)); }, [state, ready]);

  const value: DemoContextValue = {
    ...state,
    addToCart(productId, variantId, quantity = 1) {
      setState((current) => {
        const found = current.cart.find((item) => item.productId === productId && item.variantId === variantId && !item.bundleInstanceId);
        const cart = found
          ? current.cart.map((item) => item === found ? { ...item, quantity: item.quantity + quantity } : item)
          : [...current.cart, { productId, variantId, quantity }];
        return { ...current, cart };
      });
    },
    addBundle(bundleId) {
      const bundle = productBundles.find((candidate) => candidate.id === bundleId && candidate.active);
      if (!bundle) return false;
      const bundleProducts = bundle.productIds.map((id) => products.find((product) => product.id === id));
      if (bundleProducts.some((product) => !product || product.status === "Temporarily unavailable")) return false;
      const bundleInstanceId = crypto.randomUUID();
      const items: CartItem[] = bundleProducts.map((product) => ({
        productId: product!.id, variantId: product!.variants[0].id, quantity: 1,
        bundleId, bundleInstanceId, bundleRequiredQuantity: 1,
      }));
      setState((current) => ({ ...current, cart: [...current.cart, ...items] }));
      return true;
    },
    updateQuantity(productId, variantId, quantity, bundleInstanceId) {
      const target = state.cart.find((item) =>
        item.productId === productId && item.variantId === variantId &&
        (bundleInstanceId === undefined || item.bundleInstanceId === bundleInstanceId));
      const brokenInstance = target?.bundleInstanceId && quantity < (target.bundleRequiredQuantity ?? 1)
        ? target.bundleInstanceId : undefined;
      setState((current) => {
        let cart = quantity <= 0
          ? current.cart.filter((item) => item !== target)
          : current.cart.map((item) => item === target ? { ...item, quantity } : item);
        if (brokenInstance) cart = unlinkBundle(cart, brokenInstance);
        return { ...current, cart };
      });
      if (brokenInstance) toast({ title: "Bundle discount removed", description: "Bundle discount removed because the bundle was changed." });
    },
    toggleFavorite(id) { setState((current) => ({ ...current, favorites: current.favorites.includes(id) ? current.favorites.filter((value) => value !== id) : [...current.favorites, id] })); },
    toggleCompare(id) { setState((current) => ({ ...current, compare: current.compare.includes(id) ? current.compare.filter((value) => value !== id) : current.compare.length < 3 ? [...current.compare, id] : current.compare })); },
    acceptConsent() { setState((current) => ({ ...current, consent: { version: "2026.07", acceptedAt: new Date().toISOString() } })); },
    completeOrder(total) {
      const order = { id: `DEMO-${Math.floor(100000 + Math.random() * 900000)}`, date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), total, status: "Demo order placed", itemCount: state.cart.reduce((count, item) => count + item.quantity, 0) };
      setState((current) => ({ ...current, cart: [], orders: [order, ...current.orders] }));
      return order;
    },
    reset() { localStorage.removeItem(storageKey); setState(initialState); },
  };
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) throw new Error("DemoProvider missing");
  return value;
}
