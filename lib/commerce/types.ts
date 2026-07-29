export const ORDER_STATUSES = [
  "draft", "awaiting_payment", "payment_review", "processing", "completed",
  "cancelled", "expired", "refunded", "on_hold",
] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

export const PAYMENT_STATUSES = [
  "unpaid", "submitted", "under_review", "verified", "rejected", "expired",
  "refunded", "partially_refunded", "possible_duplicate",
] as const;
export type PaymentStatus = typeof PAYMENT_STATUSES[number];

export const FULFILLMENT_STATUSES = [
  "unfulfilled", "ready_for_fulfillment", "processing", "shipped",
  "delivered", "cancelled",
] as const;
export type FulfillmentStatus = typeof FULFILLMENT_STATUSES[number];

export const RESERVATION_STATUSES = ["active", "committed", "released", "expired"] as const;
export type ReservationStatus = typeof RESERVATION_STATUSES[number];

export const PAYMENT_METHODS = ["zelle", "cash_app"] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export const ADMIN_ROLES = [
  "support", "payment_reviewer", "fulfillment", "manager", "super_admin",
] as const;
export type AdminRole = typeof ADMIN_ROLES[number];

export interface MoneyBreakdown {
  currency: "USD";
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  paymentAdjustmentCents: 0;
  totalCents: number;
}

export interface CheckoutLineInput {
  variantId: string;
  quantity: number;
}

export interface AddressInput {
  firstName: string;
  lastName: string;
  company?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: "US";
  phone: string;
}

export interface CheckoutInput {
  email: string;
  shippingAddress: AddressInput;
  billingAddress?: AddressInput;
  shippingRateId: string;
  paymentMethod: PaymentMethod;
  items: CheckoutLineInput[];
  eligibilityAccepted: true;
  eligibilityVersion: string;
  idempotencyKey: string;
}

export interface PaymentSubmissionInput {
  orderId: string;
  method: PaymentMethod;
  senderName: string;
  senderContact: string;
  amountReportedCents: number;
  paymentDate: string;
  approximateTime: string;
  transactionReference?: string;
  customerNote?: string;
  idempotencyKey: string;
}

export interface AdminPushPayload {
  eventId: string;
  eventType:
    | "payment_submission_created"
    | "payment_submission_updated"
    | "payment_amount_mismatch"
    | "possible_duplicate_payment"
    | "late_payment_submission"
    | "payment_review_assigned"
    | "inventory_commit_failed";
  orderId: string;
  orderNumber: string;
  paymentSubmissionId?: string;
  route: string;
  createdAt: string;
}
