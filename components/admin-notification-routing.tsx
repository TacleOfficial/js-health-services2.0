"use client";

import { startTransition, useActionState } from "react";
import { BellRing, MessageSquareText, MoreHorizontal } from "lucide-react";
import { sendNotificationRouteTest, setNotificationRoute, type AdminSmsActionState } from "@/app/admin/actions";
import { Button } from "@/components/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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

function TestActions({ eventType, label }: { eventType: string; label: string }) {
  const [state, action, pending] = useActionState(sendNotificationRouteTest, initialState);
  const send = (channel: "sms"|"hark") => {
    const formData = new FormData();
    formData.set("event_type", eventType);
    formData.set("channel", channel);
    startTransition(() => action(formData));
  };
  return <div className="notification-test-actions">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" disabled={pending} aria-label={`Test actions for ${label}`}><MoreHorizontal/></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Send test notification</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => send("sms")}><MessageSquareText/> Send SMS test</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => send("hark")}><BellRing/> Send Hark test</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {state.message && <small className={state.ok ? "success" : "error"} role={state.ok ? "status" : "alert"}>{state.message}</small>}
  </div>;
}

export function AdminNotificationRouting({ routes }: { routes: Route[] }) {
  return <div className="notification-routing-table" role="table" aria-label="Notification event routing">
    <div className="notification-routing-row notification-routing-head" role="row">
      <strong>Event</strong><strong>SMS</strong><strong>Hark</strong><strong>Actions</strong>
    </div>
    {routes.map(route => <div className="notification-routing-row" role="row" key={route.eventType}>
      <span><strong>{route.label}</strong><small>{route.eventType}</small></span>
      <RouteToggle eventType={route.eventType} channel="sms" enabled={route.sms} label={route.label}/>
      <RouteToggle eventType={route.eventType} channel="hark" enabled={route.hark} label={route.label}/>
      <TestActions eventType={route.eventType} label={route.label}/>
    </div>)}
  </div>;
}
