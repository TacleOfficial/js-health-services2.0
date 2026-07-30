"use client";

import Image from "next/image";
import { useState } from "react";
import { CheckCircle2, Copy, ShieldAlert } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Enrollment = { id: string; qr: string; secret: string };
type ExistingFactor = { id: string; friendlyName?: string };
type MfaFactor = { id: string; status: string; friendly_name?: string };

function qrImageSource(value: string) {
  const source = value.trim();
  return source.startsWith("data:") ? source : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

export function AdminMfaPanel({ currentLevel, nextLevel }: { currentLevel: string; nextLevel: string }) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [existingFactor, setExistingFactor] = useState<ExistingFactor | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const active = currentLevel === "aal2";
  const hasVerifiedFactor = !active && nextLevel === "aal2";

  async function enroll() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return setMessage("Supabase is not configured.");
    setBusy(true); setMessage("");
    const factors = await supabase.auth.mfa.listFactors();
    if (factors.error) { setBusy(false); return setMessage(factors.error.message); }
    const verified = factors.data.totp.find((factor: MfaFactor) => factor.status === "verified");
    if (verified) {
      setExistingFactor({ id: verified.id, friendlyName: verified.friendly_name });
      setBusy(false);
      return;
    }
    const stale = factors.data.totp.find((factor: MfaFactor) => factor.friendly_name === "Velle Admin");
    if (stale) {
      const cleanup = await supabase.auth.mfa.unenroll({ factorId: stale.id });
      if (cleanup.error) {
        setBusy(false);
        return setMessage("An unfinished Velle Admin enrollment already exists. Remove it from your account MFA settings or sign in with an AAL2 session, then try again.");
      }
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Velle Admin" });
    setBusy(false);
    if (error) return setMessage(error.message);
    setEnrollment({ id: data.id, qr: qrImageSource(data.totp.qr_code), secret: data.totp.secret });
  }

  async function useExistingFactor() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return setMessage("Supabase is not configured.");
    setBusy(true); setMessage("");
    const factors = await supabase.auth.mfa.listFactors();
    setBusy(false);
    if (factors.error) return setMessage(factors.error.message);
    const factor = factors.data.totp.find((candidate: MfaFactor) => candidate.status === "verified");
    if (!factor) return setMessage("No verified authenticator was found for this account.");
    setExistingFactor({ id: factor.id, friendlyName: factor.friendly_name });
  }

  async function verify() {
    const supabase = createSupabaseBrowserClient();
    const factorId = enrollment?.id ?? existingFactor?.id;
    if (!supabase || !factorId) return;
    setBusy(true); setMessage("");
    const result = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (result.error) return setMessage(result.error.message);
    window.location.assign("/admin?view=security");
  }

  return <Card className="admin-security-card">
    <div className="admin-data-head">{active ? <CheckCircle2/> : <ShieldAlert/>}<div><span className="eyebrow">ADMINISTRATOR SECURITY</span><h2>{active ? "AAL2 session active" : hasVerifiedFactor ? "Verify your authenticator" : "Set up multifactor authentication"}</h2><p>Payment approval, rejection, catalog management, and checkout configuration require a verified TOTP challenge.</p></div></div>
    <div className="aal-status"><span>Current assurance</span><BadgeValue value={currentLevel}/><span>Available assurance</span><BadgeValue value={nextLevel}/></div>
    {active ? <p className="admin-success">This browser session can perform protected administrator mutations.</p>
    : enrollment ? <div className="mfa-enrollment">
      <Image src={enrollment.qr} width={190} height={190} unoptimized alt="Authenticator enrollment QR code"/>
      <div><h3>Scan with your authenticator app</h3><p>Or enter this setup key manually:</p><button type="button" className="mfa-secret" onClick={() => navigator.clipboard.writeText(enrollment.secret)}>{enrollment.secret}<Copy/></button><CodeInput code={code} setCode={setCode}/><Button onClick={verify} disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify and activate"}</Button></div>
    </div>
    : existingFactor ? <div className="mfa-challenge"><h3>Verify your existing authenticator</h3><p>Open {existingFactor.friendlyName || "your authenticator app"} and enter its current 6-digit code to activate AAL2 for this session.</p><CodeInput code={code} setCode={setCode}/><Button onClick={verify} disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify authenticator"}</Button></div>
    : hasVerifiedFactor ? <Button onClick={useExistingFactor} disabled={busy}>{busy ? "Loading…" : "Verify existing authenticator"}</Button>
    : <Button onClick={enroll} disabled={busy}>{busy ? "Preparing…" : "Enroll authenticator"}</Button>}
    {message ? <p className="auth-message" role="status">{message}</p> : null}
  </Card>;
}

function CodeInput({ code, setCode }: { code: string; setCode: (value: string) => void }) {
  return <label>6-digit code<Input value={code} onChange={event => setCode(event.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" autoComplete="one-time-code"/></label>;
}

function BadgeValue({ value }: { value: string }) {
  return <strong className={value === "aal2" ? "aal-active" : ""}>{value.toUpperCase()}</strong>;
}
