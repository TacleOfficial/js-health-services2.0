export type ProductStatus = "In stock" | "Low stock" | "Temporarily unavailable";
export type DocumentStatus = "Batch verified" | "CoA available" | "Testing pending";

export interface ProductVariant {
  id: string;
  label: string;
  amount: string;
  price: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  code: string;
  descriptor: string;
  category: string;
  researchArea: string;
  form: string;
  status: ProductStatus;
  documentStatus: DocumentStatus;
  batchId: string;
  tone: string;
  featured?: boolean;
  variants: ProductVariant[];
  primaryImageUrl?: string;
  primaryImageAlt?: string;
  contextDocument?: import("./product-context").ProductContextDocument;
  contextImageUrl?: string;
  contextImageAlt?: string;
  databaseBacked?: boolean;
}

export interface BatchRecord {
  id: string;
  productSlug: string;
  status: "Verified" | "Pending" | "Archived";
  reportDate: string;
  laboratory: string;
  purity: string;
  method: string;
  storage: string;
}

export interface ResearchArticle {
  slug: string;
  title: string;
  summary: string;
  topic: string;
  evidence: string;
  readTime: string;
  updated: string;
}

export interface CartItem {
  productId: string;
  variantId: string;
  quantity: number;
  bundleId?: string;
  bundleInstanceId?: string;
  bundleRequiredQuantity?: number;
}

export interface DemoOrder {
  id: string;
  date: string;
  total: number;
  status: string;
  itemCount: number;
}

export interface VerificationConsent {
  version: string;
  acceptedAt: string;
}
