import { NextRequest, NextResponse } from "next/server";
import { guestAccessCookie, hashGuestAccessToken, rateLimitStaging } from "@/lib/commerce/guest-access";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try { await rateLimitStaging("guest-access", 20, 900); }
  catch { return NextResponse.redirect(new URL("/checkout?access=limited", request.url)); }
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return NextResponse.redirect(new URL("/checkout?access=invalid", request.url));
  const db = createSupabaseServiceClient();
  const { data: order } = await db.from("orders").select("order_number,guest_access_expires_at")
    .eq("guest_access_token_hash", hashGuestAccessToken(token))
    .gt("guest_access_expires_at", new Date().toISOString())
    .is("customer_user_id", null)
    .maybeSingle();
  if (!order) return NextResponse.redirect(new URL("/checkout?access=expired", request.url));
  const emailFailed = request.nextUrl.searchParams.get("email") === "failed";
  const response = NextResponse.redirect(new URL(`/orders/${order.order_number}${emailFailed?"?email=failed":""}`, request.url));
  const expires = new Date(order.guest_access_expires_at);
  response.cookies.set(guestAccessCookie, token, {
    httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax",
    path: "/orders", expires,
  });
  return response;
}
