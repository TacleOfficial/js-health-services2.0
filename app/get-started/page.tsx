import type { Metadata } from "next";
import { ProductFinder } from "@/components/product-finder/product-finder";

export const metadata: Metadata = {
  title: "Find your Velle match",
  description: "Explore the fictional Velle catalog with a private, goal-based product finder.",
  robots: { index: false, follow: false },
};

export default function GetStartedPage() {
  return <ProductFinder />;
}
