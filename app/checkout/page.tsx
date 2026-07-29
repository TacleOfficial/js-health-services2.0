import type { Metadata } from "next";
import { CommerceShell } from "@/components/commerce-shell";
import { StagingCheckout } from "@/components/staging-checkout";
import { commerceReadiness } from "@/lib/commerce/config";

export const metadata: Metadata = {
  title: "Private staging checkout",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return <CommerceShell><StagingCheckout ready={commerceReadiness} /></CommerceShell>;
}
