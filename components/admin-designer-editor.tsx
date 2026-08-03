"use client";
/* eslint-disable react-hooks/refs -- dnd-kit exposes callback refs and transform state from useSortable. */
/* eslint-disable react-hooks/set-state-in-effect -- server-action success must reconcile the authoritative revision. */

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, Eye, EyeOff, GripVertical, Monitor, PanelRightClose, PanelRightOpen, Plus, Save, Smartphone, Tablet, Trash2 } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import {
  designerBlockSchema,
  type DesignerBlock,
  type GlobalDocument,
  type PageDocument,
} from "@/lib/designer";
import { DesignerPageRenderer } from "@/components/designer-page-renderer";
import { DesignerMediaUploader } from "@/components/designer-media-uploader";
import { saveDesignerDraft, type DesignerActionState } from "@/app/admin/designer/actions";

type Version = { id: string; version_number: number; published_at: string; restored_from_version_id: string | null };
type Props = {
  entry: {
    id: string;
    contentKey: string;
    kind: "global" | "page" | "template" | "custom";
    title: string;
    slug: string | null;
    draftDocument: GlobalDocument | PageDocument;
    draftRevision: number;
    publishedVersionId: string | null;
    seo: Record<string, unknown>;
  };
  versions: Version[];
  isSuperAdmin: boolean;
  publishAction: (formData: FormData) => void | Promise<void>;
  rollbackAction: (formData: FormData) => void | Promise<void>;
  unpublishAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
};

const initialState: DesignerActionState = { ok: false, message: "" };
const blockLabels: Record<DesignerBlock["type"], string> = {
  hero: "Hero", rich_text: "Rich text", image: "Image", split: "Split content", cta: "Call to action",
  feature_grid: "Feature grid", faq: "FAQ", spacer: "Spacer / divider", product_grid: "Product grid",
  article_grid: "Article grid", locked: "Functional block",
};

function newBlock(type: DesignerBlock["type"]): DesignerBlock {
  const id = crypto.randomUUID();
  const candidates: Record<DesignerBlock["type"], unknown> = {
    hero: { id, type, visible: true, eyebrow: "NEW SECTION", title: "Page headline", text: "Add supporting copy.", primaryLabel: "Learn more", primaryHref: "/", secondaryLabel: "", secondaryHref: "" },
    rich_text: { id, type, visible: true, eyebrow: "", title: "Section heading", body: "Write your content here." },
    image: { id, type, visible: true, src: "/velle-system.png", alt: "Describe this image", caption: "" },
    split: { id, type, visible: true, eyebrow: "", title: "Split section", text: "Add supporting copy.", imageSrc: "/velle-system.png", imageAlt: "Describe this image", imageSide: "right" },
    cta: { id, type, visible: true, title: "Ready to continue?", text: "Add a concise call to action.", label: "Get started", href: "/" },
    feature_grid: { id, type, visible: true, eyebrow: "", title: "Features", items: [{ id: crypto.randomUUID(), title: "Feature", text: "Describe this feature." }] },
    faq: { id, type, visible: true, eyebrow: "", title: "Frequently asked questions", items: [{ id: crypto.randomUUID(), question: "Question", answer: "Answer" }] },
    spacer: { id, type, visible: true, size: "medium", divider: false },
    product_grid: { id, type, visible: true, eyebrow: "FEATURED MATERIALS", title: "Explore products", limit: 4 },
    article_grid: { id, type, visible: true, eyebrow: "RESEARCH NOTES", title: "Latest articles", limit: 3 },
    locked: { id, type, visible: true, component: "support", label: "Functional block" },
  };
  return designerBlockSchema.parse(candidates[type]);
}

function SortableBlock({ block, selected, onSelect, onToggle, onDuplicate, onRemove }: {
  block: DesignerBlock; selected: boolean; onSelect: () => void; onToggle: () => void; onDuplicate: () => void; onRemove: () => void;
}) {
  const sortable = useSortable({ id: block.id });
  return <article ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className={`designer-block-row ${selected ? "selected" : ""}`}>
    <button className="designer-grip" {...sortable.attributes} {...sortable.listeners} aria-label={`Move ${blockLabels[block.type]}`}><GripVertical /></button>
    <button className="designer-block-select" onClick={onSelect}><strong>{blockLabels[block.type]}</strong><span>{block.type === "locked" ? block.label : block.visible ? "Visible" : "Hidden"}</span></button>
    <button onClick={onToggle} aria-label={block.visible ? "Hide section" : "Show section"}>{block.visible ? <Eye /> : <EyeOff />}</button>
    <button onClick={onDuplicate} aria-label="Duplicate section"><Copy /></button>
    {block.type !== "locked" && <button onClick={onRemove} aria-label="Remove section"><Trash2 /></button>}
  </article>;
}

function BlockFields({ block, onChange }: { block: DesignerBlock; onChange: (block: DesignerBlock) => void }) {
  const entries = Object.entries(block).filter(([key]) => !["id", "type", "visible", "items", "component"].includes(key));
  const update = (key: string, value: string | number | boolean) => onChange({ ...block, [key]: value } as DesignerBlock);
  return <div className="designer-field-list">
    <div className="designer-property-heading"><span className="eyebrow">SECTION</span><h2>{blockLabels[block.type]}</h2></div>
    {entries.map(([key, value]) => typeof value === "boolean"
      ? <label className="designer-check" key={key}><input type="checkbox" checked={value} onChange={event => update(key, event.target.checked)}/>{key.replaceAll("_", " ")}</label>
      : key === "body" || key === "text" || key === "caption"
        ? <label key={key}>{key.replaceAll("_", " ")}<textarea value={String(value)} rows={key === "body" ? 9 : 4} onChange={event => update(key, event.target.value)}/></label>
        : key === "imageSide"
          ? <label key={key}>Image side<Select value={String(value)} onChange={event => update(key, event.target.value)}><option value="left">Left</option><option value="right">Right</option></Select></label>
          : key === "size"
            ? <label key={key}>Size<Select value={String(value)} onChange={event => update(key, event.target.value)}><option>small</option><option>medium</option><option>large</option></Select></label>
            : <label key={key}>{key.replace(/([A-Z])/g, " $1").replaceAll("_", " ")}<Input value={String(value)} type={typeof value === "number" ? "number" : "text"} onChange={event => update(key, typeof value === "number" ? Number(event.target.value) : event.target.value)}/></label>)}
    {"items" in block && <label>Items JSON<textarea rows={12} value={JSON.stringify(block.items, null, 2)} onChange={event => {
      try { onChange({ ...block, items: JSON.parse(event.target.value) } as DesignerBlock); } catch {}
    }}/><small>Each item needs a unique UUID. Invalid JSON is ignored until corrected.</small></label>}
  </div>;
}

function GlobalEditor({ document, onChange }: { document: GlobalDocument; onChange: (document: GlobalDocument) => void }) {
  const set = <K extends keyof GlobalDocument>(key: K, value: GlobalDocument[K]) => onChange({ ...document, [key]: value });
  return <div className="designer-global-editor">
    <section><span className="eyebrow">BRAND</span><h2>Navigation logo</h2><label>Wordmark<Input value={document.logoText} onChange={event => set("logoText", event.target.value)}/></label><label>Subtext<Input value={document.logoSubtext} onChange={event => set("logoSubtext", event.target.value)}/></label><label>Logo image URL<Input value={document.logoImage} onChange={event => set("logoImage", event.target.value)}/></label><DesignerMediaUploader onUploaded={url => set("logoImage", url)}/><label>Image alt text<Input value={document.logoAlt} onChange={event => set("logoAlt", event.target.value)}/></label><label>Logo destination<Input value={document.logoHref} onChange={event => set("logoHref", event.target.value)}/></label></section>
    <section><span className="eyebrow">BANNER</span><h2>Announcement</h2><label className="designer-check"><input type="checkbox" checked={document.banner.enabled} onChange={event => set("banner", { ...document.banner, enabled: event.target.checked })}/> Show banner</label><label>Message<Input value={document.banner.text} onChange={event => set("banner", { ...document.banner, text: event.target.value })}/></label><label>Optional destination<Input value={document.banner.href} onChange={event => set("banner", { ...document.banner, href: event.target.value })}/></label></section>
    <section><span className="eyebrow">LINKS</span><h2>Primary navigation</h2><textarea rows={18} value={JSON.stringify(document.navigation, null, 2)} onChange={event => { try { set("navigation", JSON.parse(event.target.value)); } catch {} }}/><small>Links render in this order. Each item needs a unique UUID and desktop/mobile visibility values.</small></section>
  </div>;
}

export function AdminDesignerEditor({ entry, versions, isSuperAdmin, publishAction, rollbackAction, unpublishAction, deleteAction }: Props) {
  const [document, setDocument] = useState(entry.draftDocument);
  const [revision, setRevision] = useState(entry.draftRevision);
  const [selectedId, setSelectedId] = useState(document.kind === "page" ? document.blocks[0]?.id ?? null : null);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [dirty, setDirty] = useState(false);
  const [addType, setAddType] = useState<DesignerBlock["type"]>("hero");
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [seo, setSeo] = useState({
    title: String(entry.seo.title ?? ""), description: String(entry.seo.description ?? ""),
    socialImage: String(entry.seo.socialImage ?? ""), indexable: entry.seo.indexable !== false,
  });
  const [state, saveAction, pending] = useActionState(saveDesignerDraft, initialState);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const page = document.kind === "page" ? document : null;
  const selected = page?.blocks.find(block => block.id === selectedId);

  useEffect(() => {
    if (state.ok && state.revision) { setRevision(state.revision); setDirty(false); }
  }, [state]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const updateDocument = (next: GlobalDocument | PageDocument) => { setDocument(next); setDirty(true); };
  const updateBlocks = (blocks: DesignerBlock[]) => page && updateDocument({ ...page, blocks });
  const onDragEnd = (event: DragEndEvent) => {
    if (!page || !event.over || event.active.id === event.over.id) return;
    const from = page.blocks.findIndex(block => block.id === event.active.id);
    const to = page.blocks.findIndex(block => block.id === event.over?.id);
    updateBlocks(arrayMove(page.blocks, from, to));
  };
  const serialized = useMemo(() => JSON.stringify(document), [document]);

  return <div className="designer-workspace">
    <header className="designer-toolbar">
      <div><span className="eyebrow">{entry.kind.toUpperCase()}</span><h1>{entry.title}</h1><small>{dirty ? "Unsaved changes" : `Draft revision ${revision}`}</small></div>
      <div className="designer-device-switcher" aria-label="Preview width">
        <button className={device === "desktop" ? "active" : ""} onClick={() => setDevice("desktop")} aria-label="Desktop preview"><Monitor /></button>
        <button className={device === "tablet" ? "active" : ""} onClick={() => setDevice("tablet")} aria-label="Tablet preview"><Tablet /></button>
        <button className={device === "mobile" ? "active" : ""} onClick={() => setDevice("mobile")} aria-label="Mobile preview"><Smartphone /></button>
      </div>
      <div className="designer-toolbar-actions">
        {page && <Button asChild variant="outline"><a href={`/admin/designer/${entry.contentKey}/preview`} target="_blank" rel="noreferrer"><Eye /> Full preview</a></Button>}
        <form action={saveAction}><input type="hidden" name="entry_id" value={entry.id}/><input type="hidden" name="kind" value={entry.kind}/><input type="hidden" name="revision" value={revision}/><input type="hidden" name="document" value={serialized}/><input type="hidden" name="seo" value={JSON.stringify(seo)}/><Button disabled={pending || !dirty}><Save /> {pending ? "Saving…" : "Save draft"}</Button></form>
        <form action={publishAction}><input type="hidden" name="entry_id" value={entry.id}/><Button disabled={!isSuperAdmin || dirty} title={dirty ? "Save the draft before publishing." : !isSuperAdmin ? "Super-admin role required." : ""}>Publish</Button></form>
        {entry.kind === "custom" && entry.publishedVersionId && <form action={unpublishAction}><input type="hidden" name="entry_id" value={entry.id}/><Button variant="outline" disabled={!isSuperAdmin}>Unpublish</Button></form>}
      </div>
      {state.message && <p className={state.ok ? "designer-success" : "designer-error"}>{state.message}</p>}
    </header>

    {document.kind === "globals" ? <GlobalEditor document={document} onChange={updateDocument}/> : <div className={`designer-columns ${propertiesOpen ? "" : "properties-collapsed"}`}>
      <aside className="designer-blocks-panel">
        <div className="designer-panel-title"><span className="eyebrow">PAGE SECTIONS</span><strong>{page!.blocks.length} blocks</strong></div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={page!.blocks.map(block => block.id)} strategy={verticalListSortingStrategy}>
            {page!.blocks.map(block => <SortableBlock key={block.id} block={block} selected={selectedId === block.id} onSelect={() => setSelectedId(block.id)}
              onToggle={() => updateBlocks(page!.blocks.map(item => item.id === block.id ? { ...item, visible: !item.visible } : item))}
              onDuplicate={() => { const copy = { ...block, id: crypto.randomUUID(), type: block.type } as DesignerBlock; const index = page!.blocks.findIndex(item => item.id === block.id); updateBlocks([...page!.blocks.slice(0, index + 1), copy, ...page!.blocks.slice(index + 1)]); setSelectedId(copy.id); }}
              onRemove={() => { updateBlocks(page!.blocks.filter(item => item.id !== block.id)); setSelectedId(null); }}/>)}
          </SortableContext>
        </DndContext>
        <div className="designer-add-block"><Select value={addType} onChange={event => setAddType(event.target.value as DesignerBlock["type"])}>{Object.entries(blockLabels).filter(([type]) => type !== "locked").map(([type, label]) => <option value={type} key={type}>{label}</option>)}</Select><Button size="sm" variant="outline" onClick={() => { const block = newBlock(addType); updateBlocks([...page!.blocks, block]); setSelectedId(block.id); }}><Plus /> Add</Button></div>
      </aside>
      <section className={`designer-canvas ${device}`}><div><DesignerPageRenderer document={page!} preview/></div></section>
      <aside className={`designer-properties-panel ${propertiesOpen ? "" : "collapsed"}`}>
        <button className="designer-properties-toggle" type="button" onClick={() => setPropertiesOpen(open => !open)} aria-expanded={propertiesOpen} aria-label={propertiesOpen ? "Collapse properties sidebar" : "Expand properties sidebar"}>
          {propertiesOpen ? <PanelRightClose /> : <PanelRightOpen />}<span>{propertiesOpen ? "Hide inspector" : "Show inspector"}</span>
        </button>
        {propertiesOpen && <div className="designer-properties-content"><div className="designer-page-chrome"><span className="eyebrow">PAGE CHROME</span><label>Header<Select value={page!.headerMode} onChange={event => {
          const mode=event.target.value as PageDocument["headerMode"];
          updateDocument({...page!,headerMode:mode,headerOverride:mode==="override"?(page!.headerOverride??{logoText:"VELLE",logoSubtext:"RESEARCH",logoImage:"",logoAlt:"Velle Research",logoHref:"/"}):page!.headerOverride});
        }}><option value="inherit">Use global</option><option value="override">Override</option><option value="hidden">Hidden</option></Select></label><label>Banner<Select value={page!.bannerMode} onChange={event => {
          const mode=event.target.value as PageDocument["bannerMode"];
          updateDocument({...page!,bannerMode:mode,bannerOverride:mode==="override"?(page!.bannerOverride??{enabled:true,text:"Page announcement",href:""}):page!.bannerOverride});
        }}><option value="inherit">Use global</option><option value="override">Override</option><option value="hidden">Hidden</option></Select></label>
        {page!.headerMode==="override"&&<><label>Logo text<Input value={page!.headerOverride?.logoText??""} onChange={event=>updateDocument({...page!,headerOverride:{...page!.headerOverride!,logoText:event.target.value}})}/></label><label>Logo subtext<Input value={page!.headerOverride?.logoSubtext??""} onChange={event=>updateDocument({...page!,headerOverride:{...page!.headerOverride!,logoSubtext:event.target.value}})}/></label><label>Logo image URL<Input value={page!.headerOverride?.logoImage??""} onChange={event=>updateDocument({...page!,headerOverride:{...page!.headerOverride!,logoImage:event.target.value}})}/></label><label>Logo alt text<Input value={page!.headerOverride?.logoAlt??""} onChange={event=>updateDocument({...page!,headerOverride:{...page!.headerOverride!,logoAlt:event.target.value}})}/></label></>}
        {page!.bannerMode==="override"&&<><label className="designer-check"><input type="checkbox" checked={page!.bannerOverride?.enabled??true} onChange={event=>updateDocument({...page!,bannerOverride:{...page!.bannerOverride!,enabled:event.target.checked}})}/>Show banner</label><label>Banner text<Input value={page!.bannerOverride?.text??""} onChange={event=>updateDocument({...page!,bannerOverride:{...page!.bannerOverride!,text:event.target.value}})}/></label><label>Banner destination<Input value={page!.bannerOverride?.href??""} onChange={event=>updateDocument({...page!,bannerOverride:{...page!.bannerOverride!,href:event.target.value}})}/></label></>}
        </div>
        {selected ? <BlockFields block={selected} onChange={block => updateBlocks(page!.blocks.map(item => item.id === block.id ? block : item))}/> : <p>Select a section to edit its content.</p>}
        </div>}
      </aside>
    </div>}

    {entry.kind !== "global" && <section className="designer-seo-panel"><div><span className="eyebrow">SEARCH & SHARING</span><h2>Page metadata</h2></div><label>SEO title<Input maxLength={70} value={seo.title} onChange={event => { setSeo({...seo,title:event.target.value}); setDirty(true); }}/></label><label>Description<textarea maxLength={180} rows={3} value={seo.description} onChange={event => { setSeo({...seo,description:event.target.value}); setDirty(true); }}/></label><label>Social image URL<Input value={seo.socialImage} onChange={event => { setSeo({...seo,socialImage:event.target.value}); setDirty(true); }}/></label><label className="designer-check"><input type="checkbox" checked={seo.indexable} onChange={event => { setSeo({...seo,indexable:event.target.checked}); setDirty(true); }}/> Allow search indexing</label></section>}
    <section className="designer-version-panel"><div><span className="eyebrow">PUBLISHED HISTORY</span><h2>Versions</h2></div>{versions.map(version => <div key={version.id}><span><strong>Version {version.version_number}</strong><small>{new Date(version.published_at).toLocaleString()}{version.restored_from_version_id ? " · restored" : ""}</small></span><form action={rollbackAction}><input type="hidden" name="entry_id" value={entry.id}/><input type="hidden" name="version_id" value={version.id}/><Button variant="outline" size="sm" disabled={!isSuperAdmin}>Restore</Button></form></div>)}{!versions.length && <p>No published versions yet.</p>}</section>
    {entry.kind === "custom" && <form action={deleteAction} className="designer-delete-page"><input type="hidden" name="entry_id" value={entry.id}/><Button className="admin-destructive-button" disabled={!isSuperAdmin}><Trash2 /> Delete custom page</Button></form>}
  </div>;
}
