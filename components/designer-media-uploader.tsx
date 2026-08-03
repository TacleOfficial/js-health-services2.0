"use client";

import { useActionState, useEffect, useRef } from "react";
import { ImageUp } from "lucide-react";
import { uploadDesignerMedia, type DesignerMediaState } from "@/app/admin/designer/actions";
import { Button } from "@/components/ui";

const initial: DesignerMediaState = { ok: false, message: "" };

export function DesignerMediaUploader({ onUploaded }: { onUploaded: (url: string) => void }) {
  const [state, action, pending] = useActionState(uploadDesignerMedia, initial);
  const callback = useRef(onUploaded);
  useEffect(() => { callback.current = onUploaded; }, [onUploaded]);
  useEffect(() => { if (state.ok && state.url) callback.current(state.url); }, [state.ok, state.url]);
  return <form action={action} className="designer-media-uploader">
    <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required />
    <Button variant="outline" disabled={pending}><ImageUp /> {pending ? "Uploading…" : "Upload image"}</Button>
    {state.message && <small className={state.ok ? "designer-success-text" : "designer-error-text"}>{state.message}</small>}
  </form>;
}
