import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const requireCustomer = cache(async () => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/auth/sign-in?error=Supabase%20is%20not%20configured");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in?next=/account");
  await supabase.from("profiles").upsert({ id: user.id, email: user.email, updated_at: new Date().toISOString() }, { onConflict: "id", ignoreDuplicates: true });
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    try {
      const payload = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString()) as { session_id?: string };
      if (payload.session_id) {
        const requestHeaders = await headers();
        await supabase.from("customer_sessions").upsert({
          user_id: user.id, session_id: payload.session_id,
          user_agent: requestHeaders.get("user-agent")?.slice(0, 500),
          last_seen_at: new Date().toISOString(),
        }, { onConflict: "user_id,session_id" });
      }
    } catch {}
  }
  return { supabase, user };
});

export type AccountSnapshot = Awaited<ReturnType<typeof getAccountSnapshot>>;

const adminRoles = ["support", "payment_reviewer", "fulfillment", "manager", "super_admin"];

export async function requireAdmin() {
  const customer = await requireCustomer();
  const { data, error } = await customer.supabase.rpc("has_admin_role", { allowed: adminRoles });
  if (error || !data) redirect("/account");
  return customer;
}

export async function getAccountSnapshot() {
  const { supabase, user } = await requireCustomer();
  const [
    profile, orders, saved, rewards, addresses, preferences, notifications,
    tickets, sessions, cards, paymentConfigs, adminAccess,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("orders").select("*, order_items(*)").eq("customer_user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("saved_products").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("reward_ledger").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("customer_addresses").select("*").eq("user_id", user.id).order("created_at"),
    supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("customer_notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("support_tickets").select("*, support_messages(*)").eq("user_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("customer_sessions").select("*").eq("user_id", user.id).order("last_seen_at", { ascending: false }),
    supabase.from("stripe_payment_methods").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("payment_method_configs").select("method,display_name,is_active"),
    supabase.rpc("has_admin_role", { allowed: adminRoles }),
  ]);
  const firstError = [profile, orders, saved, rewards, addresses, preferences, notifications, tickets, sessions, cards, paymentConfigs, adminAccess].find(result => result.error)?.error;
  if (firstError) throw new Error(`Account data is unavailable: ${firstError.message}`);
  const points = (rewards.data ?? []).reduce((sum, entry) => sum + Number(entry.points), 0);
  const qualifying = (rewards.data ?? []).filter(entry => new Date(entry.qualifying_at) > new Date(Date.now() - 365 * 86400000)).reduce((sum, entry) => sum + Math.max(0, Number(entry.points)), 0);
  return {
    user,
    profile: profile.data,
    orders: orders.data ?? [],
    saved: saved.data ?? [],
    rewards: rewards.data ?? [],
    addresses: addresses.data ?? [],
    preferences: preferences.data,
    notifications: notifications.data ?? [],
    tickets: tickets.data ?? [],
    sessions: sessions.data ?? [],
    cards: cards.data ?? [],
    paymentConfigs: paymentConfigs.data ?? [],
    isAdmin: Boolean(adminAccess.data),
    points,
    qualifying,
    tier: qualifying >= 1500 ? "Premier" : qualifying >= 500 ? "Plus" : "Base",
  };
}
