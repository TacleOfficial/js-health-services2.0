"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TextAlign from "@tiptap/extension-text-align";
import { Bold, Italic, Link2, List, ListOrdered, Quote, Table2 } from "lucide-react";
import { useState } from "react";
import type { ProductContextDocument } from "@/lib/product-context";
import { ProductMediaUploader } from "./product-media-uploader";

export function ProductContextEditor({value,onChange,mediaKey}:{value:ProductContextDocument;onChange:(value:ProductContextDocument)=>void;mediaKey:string}){
  const [inlineAlt,setInlineAlt]=useState("");
  const editor=useEditor({
    immediatelyRender:false,
    extensions:[StarterKit.configure({
      heading:{levels:[2,3,4]},code:false,codeBlock:false,horizontalRule:false,link:false,strike:false,
    }),Link.configure({openOnClick:false,protocols:["https"]}),Image.configure({allowBase64:false}),Table.configure({resizable:true}),TableRow,TableHeader,TableCell,TextAlign.configure({types:["heading","paragraph"]})],
    content:value,
    onUpdate:({editor})=>onChange(editor.getJSON() as ProductContextDocument),
    editorProps:{attributes:{class:"product-context-prose","aria-label":"Product Context rich text"}},
  });
  if(!editor)return null;
  const addLink=()=>{const href=window.prompt("Secure link URL (https://)");if(href)editor.chain().focus().extendMarkRange("link").setLink({href}).run();};
  return <div className="product-context-editor">
    <div className="rich-toolbar" role="toolbar" aria-label="Product Context formatting">
      <button type="button" onClick={()=>editor.chain().focus().toggleBold().run()} aria-label="Bold"><Bold/></button>
      <button type="button" onClick={()=>editor.chain().focus().toggleItalic().run()} aria-label="Italic"><Italic/></button>
      {[2,3,4].map(level=><button type="button" key={level} onClick={()=>editor.chain().focus().toggleHeading({level:level as 2|3|4}).run()}>H{level}</button>)}
      <button type="button" onClick={()=>editor.chain().focus().toggleBulletList().run()} aria-label="Bulleted list"><List/></button>
      <button type="button" onClick={()=>editor.chain().focus().toggleOrderedList().run()} aria-label="Numbered list"><ListOrdered/></button>
      <button type="button" onClick={()=>editor.chain().focus().toggleBlockquote().run()} aria-label="Blockquote"><Quote/></button>
      <button type="button" onClick={addLink} aria-label="Add link"><Link2/></button>
      <button type="button" onClick={()=>editor.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run()} aria-label="Insert table"><Table2/></button>
      {(["left","center","right"] as const).map(alignment=><button type="button" key={alignment} onClick={()=>editor.chain().focus().setTextAlign(alignment).run()}>{alignment[0].toUpperCase()}</button>)}
    </div>
    <EditorContent editor={editor}/>
    <details><summary>Add an inline image</summary><ProductMediaUploader label="Inline context image" mediaKey={mediaKey} url="" alt={inlineAlt} required onAltChange={setInlineAlt} onUploaded={({url})=>{if(inlineAlt.trim())editor.chain().focus().setImage({src:url,alt:inlineAlt.trim()}).run();}}/></details>
  </div>;
}
