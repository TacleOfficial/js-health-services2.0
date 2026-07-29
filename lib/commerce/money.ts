import type { MoneyBreakdown } from "./types";

export function assertCents(value: number, label = "amount"): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer number of cents`);
  }
  return value;
}

export function calculateTotal(input: Omit<MoneyBreakdown, "totalCents" | "paymentAdjustmentCents">): MoneyBreakdown {
  const subtotalCents = assertCents(input.subtotalCents, "subtotal");
  const discountCents = assertCents(input.discountCents, "discount");
  const shippingCents = assertCents(input.shippingCents, "shipping");
  const taxCents = assertCents(input.taxCents, "tax");
  if (discountCents > subtotalCents) throw new Error("discount cannot exceed subtotal");
  return {
    currency: "USD",
    subtotalCents,
    discountCents,
    shippingCents,
    taxCents,
    paymentAdjustmentCents: 0,
    totalCents: subtotalCents - discountCents + shippingCents + taxCents,
  };
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(assertCents(cents) / 100);
}
