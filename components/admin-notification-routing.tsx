"use client";

import { useActionState } from "react";
import { setNotificationRoute, type AdminSmsActionState } from "@/app/admin/actions";

type Route = { eventType: string; label: string; sms: boolean; hark: boolean };
const initialState: AdminSmsActionState = { ok: true, message: "" };

function RouteToggle({ eventType, channel, enabled, label }: {
  eventType: string; channel: "sms"|"hark"; enabled: boolean; label: string;
}) {
  const [state, action, pending] = useActionState(setNotificationRoute, initialState);
  return <form action={action} className="notification-route-toggle">
    <input type="hidden" name="event_type" value={eventType}/>
    <input type="hidden" name="channel" value={channel}/>
    <input type="hidden" name="enabled" value={String(!enabled)}/>
    <button
      type="submit"
      role="switch"
      aria-checked={enabled}
      aria-label={`${channel === "sms" ? "SMS" : "Hark"} for ${label}`}
      disabled={pending}
      className={enabled ? "active" : ""}
    ><span/>{pending ? "Saving…" : enabled ? "On" : "Off"}</button>
    {!state.ok && state.message && <small className="error" role="alert">{state.message}</small>}
  </form>;
}

export function AdminNotificationRouting({ routes }: { routes: Route[] }) {
  return <div className="notification-routing-table" role="table" aria-label="Notification event routing">
    <div className="notification-routing-row notification-routing-head" role="row">
      <strong>Event</strong><strong>SMS</strong><strong>Hark</strong>
    </div>
    {routes.map(route => <div className="notification-routing-row" role="row" key={route.eventType}>
      <span><strong>{route.label}</strong><small>{route.eventType}</small></span>
      <RouteToggle eventType={route.eventType} channel="sms" enabled={route.sms} label={route.label}/>
      <RouteToggle eventType={route.eventType} channel="hark" enabled={route.hark} label={route.label}/>
    </div>)}
  </div>;
}
