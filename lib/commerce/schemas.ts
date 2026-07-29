import { z } from "zod";
import { PAYMENT_METHODS } from "./types";

const addressSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  company: z.string().trim().max(120).optional(),
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().max(160).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  postalCode: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/),
  country: z.literal("US"),
  phone: z.string().trim().min(7).max(30),
});

export const checkoutSchema = z.object({
  email: z.email(),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
  shippingRateId: z.string().min(1).max(200),
  paymentMethod: z.enum(PAYMENT_METHODS),
  items: z.array(z.object({
    variantId: z.string().min(1).max(100),
    quantity: z.number().int().min(1).max(20),
  })).min(1).max(50),
  eligibilityAccepted: z.literal(true),
  eligibilityVersion: z.string().min(1).max(50),
  idempotencyKey: z.uuid(),
});

export const paymentSubmissionSchema = z.object({
  orderId: z.uuid(),
  method: z.enum(PAYMENT_METHODS),
  senderName: z.string().trim().min(2).max(120),
  senderContact: z.string().trim().min(3).max(160),
  amountReportedCents: z.number().int().positive(),
  paymentDate: z.iso.date(),
  approximateTime: z.string().regex(/^\d{2}:\d{2}$/),
  transactionReference: z.string().trim().max(120).optional(),
  customerNote: z.string().trim().max(500).optional(),
  idempotencyKey: z.uuid(),
});
