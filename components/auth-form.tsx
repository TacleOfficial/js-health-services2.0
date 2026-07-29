"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button, Card, Input } from "@/components/ui";

type Mode = "sign-in" | "sign-up" | "forgot" | "reset";
export function AuthForm({ mode }: { mode: Mode }) {
  const search = useSearchParams();
  const [message, setMessage] = useState(search.get("error") || "");
  const [busy, setBusy] = useState(false);
  const next = search.get("next")?.startsWith("/") ? search.get("next")! : "/account";
  const title = mode === "sign-in" ? "Sign in to your account" : mode === "sign-up" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Choose a new password";
  async function submit(data: FormData, passwordless = false) {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return setMessage("Supabase is not configured for this environment.");
    setBusy(true); setMessage("");
    const email = String(data.get("email") || "");
    const password = String(data.get("password") || "");
    const origin = window.location.origin;
    let result;
    if (mode === "reset") result = await supabase.auth.updateUser({ password });
    else if (mode === "forgot") result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/auth/reset-password` });
    else if (passwordless) result = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    else if (mode === "sign-up") result = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    else result = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) return setMessage(result.error.message);
    if (mode === "sign-in" && !passwordless) window.location.assign(next);
    else if (mode === "reset") window.location.assign("/account/security");
    else setMessage(mode === "forgot" || passwordless || mode === "sign-up" ? "Check your email to continue." : "Done.");
  }
  return <main className="auth-page"><Card className="auth-card"><Link href="/" className="wordmark">VELLE<span>RESEARCH SYSTEMS</span></Link><span className="eyebrow">SECURE CUSTOMER ACCESS</span><h1>{title}</h1>
    <p>{mode === "reset" ? "Use at least 12 characters." : "Your account data is protected by Supabase authentication and row-level security."}</p>
    <form action={data => submit(data)}>{mode !== "reset" && <label>Email<Input name="email" type="email" autoComplete="email" required /></label>}{!["forgot"].includes(mode) && <label>{mode === "reset" ? "New password" : "Password"}<Input name="password" type="password" minLength={12} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} required /></label>}<Button disabled={busy}>{busy ? "Working…" : mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : mode === "forgot" ? "Send reset link" : "Update password"}</Button></form>
    {mode === "sign-in" && <><div className="auth-or"><span>or</span></div><form action={data => submit(data, true)}><label>Email<Input name="email" type="email" required /></label><Button variant="outline" disabled={busy}>Email me a magic link</Button></form></>}
    {message && <p className="auth-message" role="status">{message}</p>}
    <div className="auth-links">{mode === "sign-in" && <><Link href="/auth/forgot-password">Forgot password?</Link><Link href="/auth/sign-up">Create account</Link></>}{mode === "sign-up" && <Link href="/auth/sign-in">Already have an account?</Link>}{["forgot","reset"].includes(mode) && <Link href="/auth/sign-in">Return to sign in</Link>}</div>
  </Card></main>;
}
