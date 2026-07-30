import Image from "next/image";
import type { ProductContextDocument } from "@/lib/product-context";

function Node({node,index}:{node:any;index:number}):React.ReactNode{
  const children=node.content?.map((child:any,i:number)=><Node node={child} index={i} key={i}/>);
  const style=node.attrs?.textAlign?{textAlign:node.attrs.textAlign as "left"|"center"|"right"}:undefined;
  if(node.type==="text"){
    let content:React.ReactNode=node.text??"";
    for(const mark of node.marks??[]){
      if(mark.type==="bold")content=<strong>{content}</strong>;
      if(mark.type==="italic")content=<em>{content}</em>;
      if(mark.type==="link")content=<a href={mark.attrs?.href} rel="noreferrer">{content}</a>;
    }
    return content;
  }
  if(node.type==="paragraph")return <p style={style}>{children}</p>;
  if(node.type==="heading"){const Tag=`h${node.attrs?.level??2}` as "h2"|"h3"|"h4";return <Tag style={style}>{children}</Tag>;}
  if(node.type==="bulletList")return <ul>{children}</ul>;
  if(node.type==="orderedList")return <ol>{children}</ol>;
  if(node.type==="listItem")return <li>{children}</li>;
  if(node.type==="blockquote")return <blockquote>{children}</blockquote>;
  if(node.type==="hardBreak")return <br/>;
  if(node.type==="image")return <Image src={node.attrs.src} alt={node.attrs.alt} width={1200} height={800} sizes="(max-width: 800px) 100vw, 720px"/>;
  if(node.type==="table")return <table><tbody>{children}</tbody></table>;
  if(node.type==="tableRow")return <tr>{children}</tr>;
  if(node.type==="tableHeader")return <th>{children}</th>;
  if(node.type==="tableCell")return <td>{children}</td>;
  if(node.type==="doc")return <>{children}</>;
  return null;
}
export function ProductContextRenderer({document}:{document:ProductContextDocument}){return <div className="product-context-rendered"><Node node={document} index={0}/></div>;}
