import { Storefront } from "@/components/storefront";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { productContextSchema } from "@/lib/product-context";
import type { Product } from "@/lib/types";

export default async function RoutedPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  let databaseProduct:Product|undefined;
  let databaseProducts:Product[]=[];
  if(slug[0]==="shop"||(slug[0]==="products"&&slug[1])){
    try{
      const db=createSupabaseServiceClient();
      let query=db.from("products").select("id,slug,title,description,category,primary_image_path,primary_image_alt,context_document,context_image_path,context_image_alt,product_variants(id,title,price_cents,status,inventory_items(on_hand,committed))").eq("status","active");
      if(slug[0]==="products")query=query.eq("slug",slug[1]);
      const {data}=await query.order("created_at",{ascending:false});
      databaseProducts=(data??[]).map(item=>{
        const media=(path:string|null)=>path?`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-media/${path}`:undefined;
        const context=productContextSchema.safeParse(item.context_document);
        const variants=(item.product_variants??[]).filter(v=>v.status==="active").map(v=>({id:v.id,label:v.title,amount:v.title,price:v.price_cents/100}));
        const available=(item.product_variants??[]).some(v=>{const i=Array.isArray(v.inventory_items)?v.inventory_items[0]:v.inventory_items;return v.status==="active"&&i&&i.on_hand>i.committed;});
        return {id:item.id,slug:item.slug,name:item.title,code:item.slug.slice(0,3).toUpperCase(),descriptor:item.description,category:item.category,researchArea:item.category,form:"Research material",status:available?"In stock" as const:"Temporarily unavailable" as const,documentStatus:"CoA available" as const,batchId:"Database catalog",tone:"#e4e8e5",variants,
          primaryImageUrl:media(item.primary_image_path),primaryImageAlt:item.primary_image_alt??undefined,contextDocument:context.success?context.data:undefined,contextImageUrl:media(item.context_image_path),contextImageAlt:item.context_image_alt??undefined,databaseBacked:true};
      }).filter(product=>product.variants.length>0);
      databaseProduct=databaseProducts[0];
    }catch{}
  }
  return <Storefront path={`/${slug.join("/")}`} databaseProduct={databaseProduct} databaseProducts={databaseProducts}/>;
}
