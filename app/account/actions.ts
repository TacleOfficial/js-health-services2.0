"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { requireCustomer } from "@/lib/account";

const text = z.string().trim().max(120);
const bool = (data: FormData, key: string) => data.get(key) === "on";
const value = (data: FormData, key: string) => String(data.get(key) ?? "");
const refresh = (path = "/account") => revalidatePath(path, "layout");

export async function updateProfile(data: FormData) {
  const { supabase, user } = await requireCustomer();
  const payload = z.object({ first_name: text, last_name: text, phone: text, organization: text }).parse({
    first_name: value(data, "first_name"), last_name: value(data, "last_name"),
    phone: value(data, "phone"), organization: value(data, "organization"),
  });
  const { error } = await supabase.from("profiles").upsert({ id: user.id, email: user.email, ...payload, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  const email = z.string().email().parse(value(data, "email"));
  if (email !== user.email) {
    const { error: authError } = await supabase.auth.updateUser({ email });
    if (authError) throw new Error(authError.message);
  }
  refresh();
}

export async function saveAddress(data: FormData) {
  const { supabase, user } = await requireCustomer();
  const schema = z.object({
    id: z.string().uuid().optional(), label: text.min(1), recipient_name: text.min(1),
    line1: text.min(1), line2: text, city: text.min(1), region: text.min(2),
    postal_code: text.min(3), country: z.string().length(2), phone: text,
  });
  const idValue = value(data, "id");
  const payload = schema.parse({
    id: idValue || undefined, label: value(data, "label"), recipient_name: value(data, "recipient_name"),
    line1: value(data, "line1"), line2: value(data, "line2"), city: value(data, "city"),
    region: value(data, "region"), postal_code: value(data, "postal_code"),
    country: value(data, "country") || "US", phone: value(data, "phone"),
  });
  const record = { ...payload, user_id: user.id, is_default_shipping: bool(data, "is_default_shipping"), is_default_billing: bool(data, "is_default_billing"), updated_at: new Date().toISOString() };
  if (record.is_default_shipping) await supabase.from("customer_addresses").update({ is_default_shipping: false }).eq("user_id", user.id);
  if (record.is_default_billing) await supabase.from("customer_addresses").update({ is_default_billing: false }).eq("user_id", user.id);
  const { error } = await supabase.from("customer_addresses").upsert(record);
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteAddress(data: FormData) {
  const { supabase } = await requireCustomer();
  const id = z.string().uuid().parse(value(data, "id"));
  const { data: address } = await supabase.from("customer_addresses").select("is_default_shipping,is_default_billing").eq("id", id).single();
  if (address?.is_default_shipping || address?.is_default_billing) throw new Error("Choose a replacement default address before deleting this one.");
  const { error } = await supabase.from("customer_addresses").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function removeSavedProduct(data: FormData) {
  const { supabase, user } = await requireCustomer();
  const slug = z.string().trim().min(1).parse(value(data, "slug"));
  const { error } = await supabase.from("saved_products").delete().eq("user_id", user.id).eq("product_slug", slug);
  if (error) throw new Error(error.message);
  refresh();
}

export async function importSavedProducts(slugs: string[]) {
  const { supabase, user } = await requireCustomer();
  const valid = z.array(z.string().trim().min(1)).max(100).parse(slugs);
  if (valid.length) {
    const { error } = await supabase.from("saved_products").upsert(valid.map(product_slug => ({ user_id: user.id, product_slug })), { onConflict: "user_id,product_slug" });
    if (error) throw new Error(error.message);
  }
  refresh();
}

export async function updatePaymentPreference(data: FormData) {
  const { supabase, user } = await requireCustomer();
  const payload = z.object({
    preferred_payment_method: z.enum(["zelle", "cash_app"]),
    payment_sender_name: text, payment_sender_contact: text,
  }).parse({
    preferred_payment_method: value(data, "preferred_payment_method"),
    payment_sender_name: value(data, "payment_sender_name"),
    payment_sender_contact: value(data, "payment_sender_contact"),
  });
  const { error } = await supabase.from("profiles").upsert({ id: user.id, email: user.email, ...payload });
  if (error) throw new Error(error.message);
  refresh();
}

export async function updateNotificationPreferences(data: FormData) {
  const { supabase, user } = await requireCustomer();
  const keys = ["email_orders","email_payments","email_rewards","email_support","email_marketing","in_app_orders","in_app_payments","in_app_rewards","in_app_support"] as const;
  const payload = Object.fromEntries(keys.map(key => [key, bool(data, key)]));
  const { error } = await supabase.from("notification_preferences").upsert({ user_id: user.id, ...payload, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  refresh();
}

export async function markNotificationsRead() {
  const { supabase, user } = await requireCustomer();
  const { error } = await supabase.from("customer_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  if (error) throw new Error(error.message);
  refresh();
}

export async function createTicket(data: FormData) {
  const { supabase, user } = await requireCustomer();
  const subject = text.min(3).parse(value(data, "subject"));
  const body = z.string().trim().min(1).max(5000).parse(value(data, "body"));
  const orderId = value(data, "order_id") || null;
  const { data: ticket, error } = await supabase.from("support_tickets").insert({ user_id: user.id, subject, order_id: orderId }).select("id").single();
  if (error) throw new Error(error.message);
  const { error: messageError } = await supabase.from("support_messages").insert({ ticket_id: ticket.id, author_user_id: user.id, author_type: "customer", body });
  if (messageError) throw new Error(messageError.message);
  refresh();
}

export async function replyToTicket(data: FormData) {
  const { supabase, user } = await requireCustomer();
  const ticketId = z.string().uuid().parse(value(data, "ticket_id"));
  const body = z.string().trim().min(1).max(5000).parse(value(data, "body"));
  const { error } = await supabase.from("support_messages").insert({ ticket_id: ticketId, author_user_id: user.id, author_type: "customer", body });
  if (error) throw new Error(error.message);
  await supabase.from("support_tickets").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", ticketId);
  refresh();
}

export async function changePassword(data: FormData) {
  const { supabase } = await requireCustomer();
  const password = z.string().min(12).parse(value(data, "password"));
  if (password !== value(data, "confirm_password")) throw new Error("Passwords do not match.");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

export async function sendMagicLink() {
  const { supabase, user } = await requireCustomer();
  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const { error } = await supabase.auth.signInWithOtp({ email: user.email!, options: { emailRedirectTo: `${origin}/auth/callback?next=/account/security` } });
  if (error) throw new Error(error.message);
}

export async function signOut(scope: "local" | "others" | "global" = "local") {
  const { supabase } = await requireCustomer();
  await supabase.auth.signOut({ scope });
  if (scope === "others") {
    revalidatePath("/account/security");
    return;
  }
  redirect("/auth/sign-in");
}
