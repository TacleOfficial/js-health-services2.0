import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const guestAccessCookie = "velle_guest_order_access";

export function createGuestAccessToken() {
  return randomBytes(32).toString("base64url");
}

export function hashGuestAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function rateLimitStaging(scope: string, limit: number, windowSeconds: number) {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const identity = forwarded || requestHeaders.get("x-real-ip") || "unknown";
  const key = hashGuestAccessToken(`${scope}:${identity}`);
  const db = createSupabaseServiceClient();
  const { data, error } = await db.rpc("consume_staging_rate_limit", {
    p_key_hash: key, p_limit: limit, p_window_seconds: windowSeconds,
  });
  if (error || !data) throw new Error("Too many staging requests. Please try again later.");
}

export async function getGuestOrderAccess(orderNumber?: string) {
  const token = (await cookies()).get(guestAccessCookie)?.value;
  if (!token) return null;
  const db = createSupabaseServiceClient();
  let query = db.from("orders").select("*,order_items(*),payment_submissions(*)")
    .eq("guest_access_token_hash", hashGuestAccessToken(token))
    .gt("guest_access_expires_at", new Date().toISOString())
    .is("customer_user_id", null);
  if (orderNumber) query = query.eq("order_number", orderNumber);
  const { data } = await query.maybeSingle();
  return data ?? null;
}
