"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { assertStagingCheckoutEnabled } from "@/lib/commerce/config";
import { getGuestOrderAccess, rateLimitStaging } from "@/lib/commerce/guest-access";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const reportSchema = z.object({
  orderNumber: z.string().min(8).max(40),
  senderName: z.string().trim().min(2).max(120),
  senderContact: z.string().trim().min(3).max(160),
  amount: z.coerce.number().positive().max(100000),
  paymentDate: z.iso.date(),
  approximateTime: z.string().regex(/^\d{2}:\d{2}$/),
  transactionReference: z.string().trim().max(120).optional(),
  customerNote: z.string().trim().max(500).optional(),
  idempotencyKey: z.uuid(),
  fictionalAcknowledged: z.literal("on"),
});

export async function submitGuestPaymentReport(formData: FormData) {
  assertStagingCheckoutEnabled();
  await rateLimitStaging("payment-report", 5, 3600);
  const parsed = reportSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/orders/${String(formData.get("orderNumber") || "")}?report=invalid`);
  const input = parsed.data;
  const order = await getGuestOrderAccess(input.orderNumber);
  if (!order) redirect("/checkout?access=expired");
  const db = createSupabaseServiceClient();
  const { error } = await db.rpc("submit_guest_payment", {
    p_order_id: order.id,
    p_method: order.payment_method,
    p_sender_name: input.senderName,
    p_sender_contact: input.senderContact,
    p_amount_reported_cents: Math.round(input.amount * 100),
    p_payment_date: input.paymentDate,
    p_approximate_time: input.approximateTime,
    p_transaction_reference: input.transactionReference || null,
    p_customer_note: input.customerNote || null,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) redirect(`/orders/${input.orderNumber}?report=failed`);
  redirect(`/orders/${input.orderNumber}?report=submitted`);
}
