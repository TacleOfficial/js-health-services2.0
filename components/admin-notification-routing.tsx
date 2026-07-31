"use client";

import { startTransition, useActionState, useState } from "react";
import { BellRing, MessageSquareText, MoreHorizontal, Pencil } from "lucide-react";
import { Dialog } from "radix-ui";
import { saveHarkNotificationTemplate, sendNotificationRouteTest, setNotificationRoute, type AdminSmsActionState } from "@/app/admin/actions";
import { Button } from "@/components/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { HarkNotificationImageUploader } from "@/components/hark-notification-image-uploader";

type Route = {
  eventType: string; label: string; sms: boolean; hark: boolean;
  harkTitle: string; harkBody: string; harkImageUrl: string; variables: string[];
};
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

function TestActions({ route }: { route: Route }) {
  const { eventType, label } = route;
  const [editOpen, setEditOpen] = useState(false);
  const [imageUrl,setImageUrl] = useState(route.harkImageUrl);
  const [state, action, pending] = useActionState(sendNotificationRouteTest, initialState);
  const [editState, editAction, editPending] = useActionState(saveHarkNotificationTemplate, initialState);
  const send = (channel: "sms"|"hark") => {
    const formData = new FormData();
    formData.set("event_type", eventType);
    formData.set("channel", channel);
    startTransition(() => action(formData));
  };
  return <Dialog.Root open={editOpen} onOpenChange={setEditOpen}><div className="notification-test-actions">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" disabled={pending} aria-label={`Test actions for ${label}`}><MoreHorizontal/></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Send test notification</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => send("sms")}><MessageSquareText/> Send SMS test</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => send("hark")}><BellRing/> Send Hark test</DropdownMenuItem>
        <DropdownMenuSeparator/>
        <DropdownMenuItem onSelect={() => setEditOpen(true)}><Pencil/> Edit Hark notification</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {state.message && <small className={state.ok ? "success" : "error"} role={state.ok ? "status" : "alert"}>{state.message}</small>}
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay"/>
      <Dialog.Content className="admin-confirm-dialog hark-template-dialog" aria-describedby={`hark-template-description-${eventType}`}>
        <Dialog.Title>Edit Hark notification</Dialog.Title>
        <Dialog.Description id={`hark-template-description-${eventType}`}>Customize the one-shot Hark notification for <strong>{label}</strong>.</Dialog.Description>
        <form action={editAction}>
          <input type="hidden" name="event_type" value={eventType}/>
          <label>Title<input name="title_template" defaultValue={route.harkTitle} maxLength={80} required/></label>
          <label>Body<textarea name="body_template" defaultValue={route.harkBody} maxLength={2000} rows={5} required/></label>
          <label>Image URL <span>Upload an image below or enter another public HTTPS URL.</span><input name="image_url" type="url" inputMode="url" value={imageUrl} onChange={event => setImageUrl(event.target.value)} maxLength={2048} placeholder="https://example.com/notification.png"/></label>
          <HarkNotificationImageUploader eventType={eventType} url={imageUrl} onChange={setImageUrl}/>
          <div className="hark-template-variables">
            <span>Available placeholders</span>
            <div>{route.variables.map(variable => <code key={variable}>{`{${variable}}`}</code>)}</div>
          </div>
          {editState.message && <p className={editState.ok ? "success" : "error"} role={editState.ok ? "status" : "alert"}>{editState.message}</p>}
          <div className="admin-confirm-actions">
            <Dialog.Close asChild><Button type="button" variant="outline">Cancel</Button></Dialog.Close>
            <Button disabled={editPending}>{editPending ? "Saving…" : "Save notification"}</Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </div></Dialog.Root>;
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
      <TestActions route={route}/>
    </div>)}
  </div>;
}
