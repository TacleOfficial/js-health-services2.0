import { Storefront } from "@/components/storefront";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { productContextSchema } from "@/lib/product-context";
import type { Product } from "@/lib/types";

export default async function RoutedPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  let databaseProduct:Product|undefined;
  if(slug[0]==="products"&&slug[1]){
    try{
      const db=createSupabaseServiceClient();
      const {data}=await db.from("products").select("id,slug,title,description,category,primary_image_path,primary_image_alt,context_document,context_image_path,context_image_alt,product_variants(id,title,price_cents,status,inventory_items(on_hand,committed))").eq("slug",slug[1]).eq("status","active").maybeSingle();
      if(data){
        const media=(path:string|null)=>path?`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-media/${path}`:undefined;
        const context=productContextSchema.safeParse(data.context_document);
        const variants=(data.product_variants??[]).filter(v=>v.status==="active").map(v=>({id:v.id,label:v.title,amount:v.title,price:v.price_cents/100}));
        const available=(data.product_variants??[]).some(v=>{const i=Array.isArray(v.inventory_items)?v.inventory_items[0]:v.inventory_items;return v.status==="active"&&i&&i.on_hand>i.committed;});
        databaseProduct={id:data.id,slug:data.slug,name:data.title,code:data.slug.slice(0,3).toUpperCase(),descriptor:data.description,category:data.category,researchArea:data.category,form:"Research material",status:available?"In stock":"Temporarily unavailable",documentStatus:"CoA available",batchId:"Database catalog",tone:"#e4e8e5",variants,
          primaryImageUrl:media(data.primary_image_path),primaryImageAlt:data.primary_image_alt??undefined,contextDocument:context.success?context.data:undefined,contextImageUrl:media(data.context_image_path),contextImageAlt:data.context_image_alt??undefined,databaseBacked:true};
      }
    }catch{}
  }
  return <Storefront path={`/${slug.join("/")}`} databaseProduct={databaseProduct}/>;
}
