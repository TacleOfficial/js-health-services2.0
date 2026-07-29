import type { CartItem, Product } from "../types";
import type { ProductBundle } from "./types";

export type BundleDiscountLine = { bundleId: string; bundleInstanceId: string; name: string; amount: number };

export function calculateCartPricing(cart: CartItem[], products: Product[], bundles: ProductBundle[]) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const bundleMap = new Map(bundles.map((bundle) => [bundle.id, bundle]));
  const subtotal = cart.reduce((total, item) => {
    const product = productMap.get(item.productId);
    const variant = product?.variants.find((candidate) => candidate.id === item.variantId);
    return total + (variant?.price ?? 0) * item.quantity;
  }, 0);
  const instances = new Map<string, CartItem[]>();
  cart.forEach((item) => {
    if (!item.bundleInstanceId) return;
    instances.set(item.bundleInstanceId, [...(instances.get(item.bundleInstanceId) ?? []), item]);
  });
  const bundleDiscounts: BundleDiscountLine[] = [];
  instances.forEach((items, bundleInstanceId) => {
    const bundleId = items[0]?.bundleId;
    const bundle = bundleId ? bundleMap.get(bundleId) : undefined;
    if (!bundle?.active) return;
    const complete = bundle.productIds.every((productId) =>
      items.some((item) => item.productId === productId && item.quantity >= (item.bundleRequiredQuantity ?? 1)),
    );
    if (!complete || items.some((item) => item.bundleId !== bundle.id)) return;
    const eligibleSubtotal = bundle.productIds.reduce((total, productId) => {
      const item = items.find((candidate) => candidate.productId === productId)!;
      const product = productMap.get(productId);
      const variant = product?.variants.find((candidate) => candidate.id === item.variantId);
      return total + (variant?.price ?? 0) * (item.bundleRequiredQuantity ?? 1);
    }, 0);
    const amount = bundle.discountType === "percentage" ? eligibleSubtotal * bundle.discountValue / 100 : bundle.discountValue;
    bundleDiscounts.push({ bundleId: bundle.id, bundleInstanceId, name: bundle.name, amount });
  });
  const discountTotal = bundleDiscounts.reduce((total, line) => total + line.amount, 0);
  return { subtotal, bundleDiscounts, discountTotal, discountedSubtotal: Math.max(0, subtotal - discountTotal) };
}
