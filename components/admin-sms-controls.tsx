"use client";

import { useActionState } from "react";
import { Badge, Button, Input } from "@/components/ui";
import {
  confirmAdminSmsVerification,
  requestAdminSmsVerification,
  saveAdminSmsPhone,
  setAdminSmsEnabled,
  type AdminSmsActionState,
} from "@/app/admin/actions";

const initialState: AdminSmsActionState = { ok: true, message: "" };

export function AdminSmsControls({ reviewer }: {
  reviewer: {
    userId: string; name: string; email: string; roles: string[];
    phone: string|null; verifiedAt: string|null; enabled: boolean;
  };
}) {
  const [saveState, saveAction, savePending] = useActionState(saveAdminSmsPhone, initialState);
  const [sendState, sendAction, sendPending] = useActionState(requestAdminSmsVerification, initialState);
  const [verifyState, verifyAction, verifyPending] = useActionState(confirmAdminSmsVerification, initialState);
  const [toggleState, toggleAction, togglePending] = useActionState(setAdminSmsEnabled, initialState);
  const status = [toggleState, verifyState, sendState, saveState].find(state => state.message);

  return <section className="admin-sms-reviewer">
    <div className="admin-sms-identity"><strong>{reviewer.name}</strong><span>{reviewer.email || reviewer.userId}</span><small>{reviewer.roles.join(", ").replaceAll("_"," ")}</small></div>
    <form action={saveAction} className="admin-sms-phone-form">
      <input type="hidden" name="admin_user_id" value={reviewer.userId}/>
      <Input name="phone_e164" type="tel" aria-label={`Phone for ${reviewer.name}`} aria-describedby={`sms-status-${reviewer.userId}`} defaultValue={reviewer.phone ?? ""} placeholder="+13175550123" required/>
      <Button variant="outline" disabled={savePending}>{savePending ? "Saving…" : "Save number"}</Button>
    </form>
    <div className="admin-sms-verification">
      {reviewer.verifiedAt ? <Badge tone="verified">Verified ••••{reviewer.phone?.slice(-4)}</Badge> : <>
        <form action={sendAction}><input type="hidden" name="admin_user_id" value={reviewer.userId}/><Button variant="outline" disabled={!reviewer.phone || sendPending}>{sendPending ? "Sending…" : "Send code"}</Button></form>
        <form action={verifyAction}><input type="hidden" name="admin_user_id" value={reviewer.userId}/><Input name="verification_code" aria-label={`Verification code for ${reviewer.name}`} aria-describedby={`sms-status-${reviewer.userId}`} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="6-digit code" required/><Button variant="outline" disabled={verifyPending}>{verifyPending ? "Verifying…" : "Verify"}</Button></form>
      </>}
    </div>
    <form action={toggleAction} className="admin-sms-toggle-form"><input type="hidden" name="admin_user_id" value={reviewer.userId}/><input type="hidden" name="enabled" value={String(!reviewer.enabled)}/><Button disabled={!reviewer.verifiedAt || togglePending} variant={reviewer.enabled?"outline":"primary"}>{togglePending ? "Saving…" : reviewer.enabled ? "Disable alerts" : "Enable alerts"}</Button></form>
    <p id={`sms-status-${reviewer.userId}`} className={`admin-sms-status${status && !status.ok ? " error" : ""}`} role="status" aria-live="polite">{status?.message}</p>
  </section>;
}
