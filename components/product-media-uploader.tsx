"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { ImagePlus, Trash2, Upload } from "lucide-react";
import { uploadProductMedia, type ProductMediaUploadResult } from "@/app/admin/actions";
import { Button, Input } from "@/components/ui";

export function ProductMediaUploader({ label, mediaKey, url, alt, onUploaded, onRemove, onAltChange, required = false }: {
  label: string;
  mediaKey: string;
  url: string;
  alt: string;
  required?: boolean;
  onUploaded: (media: { path: string; url: string }) => void;
  onRemove?: () => void;
  onAltChange: (alt: string) => void;
}) {
  const [state, setState] = useState<ProductMediaUploadResult>({ ok: false });
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const errorId = `media-error-${label.replace(/\W/g, "-").toLowerCase()}`;

  function upload() {
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setState({ ok: false, message: "Choose an image before uploading." });
      return;
    }
    const data = new FormData();
    data.set("media_key", mediaKey);
    data.set("file", file);
    startTransition(async () => {
      const result = await uploadProductMedia({ ok: false }, data);
      setState(result);
      if (result.ok && result.path && result.url) onUploaded({ path: result.path, url: result.url });
    });
  }

  return <div className="product-media-uploader">
    <div className="product-media-preview">
      {url ? <Image src={url} alt={alt || ""} fill sizes="(max-width: 800px) 100vw, 50vw" /> : <><ImagePlus /><span>No image uploaded</span></>}
    </div>
    <div className="product-media-controls">
      <label>{label}<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-describedby={errorId} /></label>
      <Button type="button" variant="outline" disabled={pending} onClick={upload}><Upload />{pending ? "Uploading…" : url ? "Replace image" : "Upload image"}</Button>
      {url && onRemove ? <Button type="button" variant="ghost" onClick={onRemove}><Trash2 />Remove reference</Button> : null}
    </div>
    <label>Alternative text<Input required={required} value={alt} onChange={(event) => onAltChange(event.target.value)} placeholder="Describe the image for screen readers" /></label>
    <p id={errorId} className="admin-product-error" role="alert" aria-live="polite">{state.message}</p>
  </div>;
}
