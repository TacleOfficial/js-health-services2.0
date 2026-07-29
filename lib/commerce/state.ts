import type { OrderStatus, PaymentStatus, ReservationStatus } from "./types";

const orderTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["payment_review", "expired", "cancelled"],
  payment_review: ["processing", "on_hold", "cancelled", "expired"],
  processing: ["completed", "on_hold", "cancelled", "refunded"],
  completed: ["refunded"],
  on_hold: ["payment_review", "processing", "cancelled", "refunded"],
  cancelled: [],
  expired: ["awaiting_payment"],
  refunded: [],
};

const paymentTransitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  unpaid: ["submitted", "expired"],
  submitted: ["under_review", "possible_duplicate", "rejected", "expired"],
  under_review: ["verified", "rejected", "possible_duplicate"],
  possible_duplicate: ["under_review", "verified", "rejected"],
  verified: ["refunded", "partially_refunded"],
  partially_refunded: ["refunded"],
  rejected: ["submitted"],
  expired: ["submitted"],
  refunded: [],
};

const reservationTransitions: Record<ReservationStatus, readonly ReservationStatus[]> = {
  active: ["committed", "released", "expired"],
  committed: [],
  released: [],
  expired: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return orderTransitions[from].includes(to);
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return paymentTransitions[from].includes(to);
}

export function canTransitionReservation(from: ReservationStatus, to: ReservationStatus): boolean {
  return reservationTransitions[from].includes(to);
}
