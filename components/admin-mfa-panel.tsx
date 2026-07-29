"use client";

import Image from "next/image";
import { useState } from "react";
import { CheckCircle2, Copy, ShieldAlert } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Enrollment = { id: string; qr: string; secret: string };

function qrImageSource(value: string) {
  const source = value.trim();
  return source.startsWith("data:") ? source : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

export function AdminMfaPanel({ currentLevel, nextLevel }: { currentLevel: string; nextLevel: string }) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const active = currentLevel === "aal2";
  async function enroll() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return setMessage("Supabase is not configured.");
    setBusy(true); setMessage("");
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Velle Admin" });
    setBusy(false);
    if (error) return setMessage(error.message);
    setEnrollment({ id: data.id, qr: qrImageSource(data.totp.qr_code), secret: data.totp.secret });
  }
  async function verify() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !enrollment) return;
    setBusy(true); setMessage("");
    const challenge = await supabase.auth.mfa.challenge({ factorId: enrollment.id });
    if (challenge.error) { setBusy(false); return setMessage(challenge.error.message); }
    const result = await supabase.auth.mfa.verify({ factorId: enrollment.id, challengeId: challenge.data.id, code });
    setBusy(false);
    if (result.error) return setMessage(result.error.message);
    window.location.assign("/admin?view=security");
  }
  return <Card className="admin-security-card">
    <div className="admin-data-head">{active ? <CheckCircle2/> : <ShieldAlert/>}<div><span className="eyebrow">ADMINISTRATOR SECURITY</span><h2>{active ? "AAL2 session active" : "Set up multifactor authentication"}</h2><p>Payment approval, rejection, and checkout configuration require a verified TOTP challenge.</p></div></div>
    <div className="aal-status"><span>Current assurance</span><BadgeValue value={currentLevel}/><span>Available assurance</span><BadgeValue value={nextLevel}/></div>
    {active ? <p className="admin-success">This browser session can perform protected administrator mutations.</p> : enrollment ? <div className="mfa-enrollment">
      <Image src={enrollment.qr} width={190} height={190} unoptimized alt="Authenticator enrollment QR code"/>
      <div><h3>Scan with your authenticator app</h3><p>Or enter this setup key manually:</p><button type="button" className="mfa-secret" onClick={() => navigator.clipboard.writeText(enrollment.secret)}>{enrollment.secret}<Copy/></button><label>6-digit code<Input value={code} onChange={event => setCode(event.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" autoComplete="one-time-code"/></label><Button onClick={verify} disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify and activate"}</Button></div>
    </div> : <Button onClick={enroll} disabled={busy}>{busy ? "Preparing…" : "Enroll authenticator"}</Button>}
    {message && <p className="auth-message" role="status">{message}</p>}
  </Card>;
}

function BadgeValue({ value }: { value: string }) {
  return <strong className={value === "aal2" ? "aal-active" : ""}>{value.toUpperCase()}</strong>;
}
