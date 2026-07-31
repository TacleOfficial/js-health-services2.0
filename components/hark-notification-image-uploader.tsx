"use client";
/* eslint-disable @next/next/no-img-element */

import { ImageUp, LoaderCircle, Trash2, Upload, X } from "lucide-react";
import { useState, useTransition } from "react";
import { uploadHarkNotificationImage, type ProductMediaUploadResult } from "@/app/admin/actions";
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
import { Button } from "@/components/ui";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";
const MAX_SIZE = 5 * 1024 * 1024;

export function HarkNotificationImageUploader({ eventType, url, onChange }: {
  eventType: string; url: string; onChange: (url: string) => void;
}) {
  const [files,setFiles] = useState<File[]>([]);
  const [state,setState] = useState<ProductMediaUploadResult>({ ok:false });
  const [clientError,setClientError] = useState("");
  const [pending,startTransition] = useTransition();
  const selected = files[0];

  function upload() {
    if (!selected) return setClientError("Choose an image before uploading.");
    const data = new FormData();
    data.set("event_type",eventType);
    data.set("file",selected);
    setClientError("");
    startTransition(async () => {
      const result = await uploadHarkNotificationImage({ ok:false },data);
      setState(result);
      if (result.ok && result.url) {
        onChange(result.url);
        setFiles([]);
      }
    });
  }

  return <div className="hark-image-uploader">
    <FileUpload
      value={files}
      onValueChange={next => { setFiles(next.slice(-1)); setClientError(""); setState({ ok:false }); }}
      onFileReject={(_file,message) => setClientError(message)}
      accept={ACCEPTED_TYPES}
      maxSize={MAX_SIZE}
      label="Hark notification image"
      disabled={pending}
      invalid={Boolean(clientError || (!state.ok && state.message))}
    >
      <FileUploadDropzone className="product-file-dropzone hark-file-dropzone">
        <span className="product-file-upload-icon"><ImageUp/></span>
        <strong>Upload notification image</strong>
        <span>JPG, PNG, or WebP up to 5 MB</span>
        <FileUploadTrigger asChild><Button type="button" size="sm" variant="outline" disabled={pending}>Browse files</Button></FileUploadTrigger>
      </FileUploadDropzone>
      <FileUploadList className="product-file-list">
        {files.map(file => <FileUploadItem className="product-file-row" key={`${file.name}-${file.lastModified}`} value={file}>
          <FileUploadItemPreview className="product-file-thumbnail"/>
          <FileUploadItemMetadata/>
          <FileUploadItemDelete asChild><button type="button" className="file-upload-action" aria-label={`Remove ${file.name}`}><X/></button></FileUploadItemDelete>
        </FileUploadItem>)}
      </FileUploadList>
    </FileUpload>
    {url && !selected && <figure className="hark-current-image-preview">
      <div><img src={url} alt="Current Hark notification preview"/></div>
      <figcaption>
        <span><strong>Current notification image</strong><small>Saved public Hark image URL</small></span>
        <button type="button" className="file-upload-action" onClick={() => onChange("")} aria-label="Remove Hark notification image" title="Remove image"><Trash2/></button>
      </figcaption>
    </figure>}
    {selected && <Button type="button" size="sm" onClick={upload} disabled={pending}>{pending ? <LoaderCircle className="file-upload-spinner"/> : <Upload/>}{pending ? "Uploading…" : url ? "Replace image" : "Upload image"}</Button>}
    {(clientError || state.message) && <p className="admin-product-error" role="alert">{clientError || state.message}</p>}
  </div>;
}
