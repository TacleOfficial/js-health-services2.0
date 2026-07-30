"use client";
/* eslint-disable @next/next/no-img-element */

import { Download, Eye, ImageUp, LoaderCircle, Trash2, Upload, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useMemo, useState, useTransition } from "react";
import { uploadProductMedia, type ProductMediaUploadResult } from "@/app/admin/actions";
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadList,
  FileUploadTrigger,
} from "@/components/ui/file-upload";
import { Button, Input } from "@/components/ui";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";
const MAX_SIZE = 5 * 1024 * 1024;

function fileNameFromUrl(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || "product-image");
  } catch {
    return "product-image";
  }
}

async function downloadFile(url: string, name: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Download failed");
    const objectUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function IconAction({ label, onClick, children, disabled = false }: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return <button type="button" className="file-upload-action" aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</button>;
}

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
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<ProductMediaUploadResult>({ ok: false });
  const [clientError, setClientError] = useState("");
  const [preview, setPreview] = useState<{ url: string; alt: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const selectedFile = files[0];
  const selectedUrl = useMemo(() => selectedFile ? URL.createObjectURL(selectedFile) : "", [selectedFile]);
  const errorId = `media-error-${label.replace(/\W/g, "-").toLowerCase()}`;

  useEffect(() => () => {
    if (selectedUrl) URL.revokeObjectURL(selectedUrl);
  }, [selectedUrl]);

  function upload() {
    if (!selectedFile) {
      setClientError("Choose an image before uploading.");
      return;
    }
    if (required && !alt.trim()) {
      setClientError("Add alternative text before uploading this image.");
      return;
    }
    const data = new FormData();
    data.set("media_key", mediaKey);
    data.set("file", selectedFile);
    setClientError("");
    startTransition(async () => {
      const result = await uploadProductMedia({ ok: false }, data);
      setState(result);
      if (result.ok && result.path && result.url) {
        onUploaded({ path: result.path, url: result.url });
        setFiles([]);
      }
    });
  }

  return <div className="product-media-uploader">
    <FileUpload
      value={files}
      onValueChange={(next) => {
        setFiles(next.slice(-1));
        setClientError("");
        setState({ ok: false });
      }}
      onFileReject={(_file, message) => setClientError(message)}
      accept={ACCEPTED_TYPES}
      maxSize={MAX_SIZE}
      label={label}
      disabled={pending}
      invalid={Boolean(clientError || (!state.ok && state.message))}
    >
      <FileUploadDropzone className="product-file-dropzone">
        <span className="product-file-upload-icon"><ImageUp /></span>
        <strong>Upload files</strong>
        <span>JPG, PNG, or WebP up to 5 MB</span>
        <FileUploadTrigger asChild><Button type="button" variant="outline" disabled={pending}>Browse files</Button></FileUploadTrigger>
      </FileUploadDropzone>
      <FileUploadList className="product-file-list">
        {files.map((file) => <FileUploadItem className="product-file-row" key={`${file.name}-${file.lastModified}`} value={file}>
          <FileUploadItemPreview className="product-file-thumbnail" />
          <FileUploadItemMetadata />
          <div className="product-file-actions">
            <IconAction label={`Preview ${file.name}`} onClick={() => setPreview({ url: selectedUrl, alt: alt || file.name })}><Eye /></IconAction>
            <IconAction label={`Download ${file.name}`} onClick={() => void downloadFile(selectedUrl, file.name)}><Download /></IconAction>
            <FileUploadItemDelete asChild><button type="button" className="file-upload-action" aria-label={`Remove ${file.name}`} title="Remove selection" disabled={pending}><X /></button></FileUploadItemDelete>
          </div>
        </FileUploadItem>)}
      </FileUploadList>
    </FileUpload>

    {url && !selectedFile ? <div className="product-file-row product-file-current" role="group" aria-label={`Current ${label}`}>
      <span className="product-file-thumbnail"><img src={url} alt="" /></span>
      <span className="product-file-metadata"><strong>{fileNameFromUrl(url)}</strong><small>Current uploaded image</small></span>
      <div className="product-file-actions">
        <IconAction label={`Preview current ${label}`} onClick={() => setPreview({ url, alt: alt || label })}><Eye /></IconAction>
        <IconAction label={`Download current ${label}`} onClick={() => void downloadFile(url, fileNameFromUrl(url))}><Download /></IconAction>
        {onRemove ? <IconAction label={`Remove current ${label} reference`} disabled={pending} onClick={onRemove}><Trash2 /></IconAction> : null}
      </div>
    </div> : null}

    {selectedFile ? <Button type="button" onClick={upload} disabled={pending}><>{pending ? <LoaderCircle className="file-upload-spinner" /> : <Upload />}{pending ? "Uploading…" : url ? "Replace image" : "Upload image"}</></Button> : null}
    <label>Alternative text<Input required={required} value={alt} onChange={(event) => onAltChange(event.target.value)} placeholder="Describe the image for screen readers" /></label>
    <p id={errorId} className="admin-product-error" role="alert" aria-live="polite">{clientError || state.message}</p>

    <Dialog.Root open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="product-file-preview-dialog">
          <Dialog.Title>Image preview</Dialog.Title>
          <Dialog.Description className="sr-only">Large preview of the selected product image.</Dialog.Description>
          <Dialog.Close className="product-file-preview-close" aria-label="Close image preview"><X /></Dialog.Close>
          {preview ? <img src={preview.url} alt={preview.alt} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </div>;
}
