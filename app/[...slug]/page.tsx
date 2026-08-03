import { Storefront } from "@/components/storefront";
import type { Product } from "@/lib/types";
import { loadPublishedDesignerContent } from "@/lib/designer-data";
import { loadActiveCatalogProducts } from "@/lib/catalog-data";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const content = await loadPublishedDesignerContent(`/${slug.join("/")}`);
  const title = typeof content.seo.title === "string" && content.seo.title ? content.seo.title : undefined;
  const description = typeof content.seo.description === "string" && content.seo.description ? content.seo.description : undefined;
  const socialImage = typeof content.seo.socialImage === "string" && content.seo.socialImage ? content.seo.socialImage : undefined;
  return {
    title, description,
    robots: content.seo.indexable === false ? { index: false, follow: false } : undefined,
    openGraph: socialImage ? { images: [socialImage] } : undefined,
  };
}

export default async function RoutedPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = `/${slug.join("/")}`;
  const designerPromise = loadPublishedDesignerContent(path);
  let databaseProduct:Product|undefined;
  let databaseProducts:Product[]=[];
  if(slug[0]==="shop"||(slug[0]==="products"&&slug[1])){
    databaseProducts=await loadActiveCatalogProducts(slug[0]==="products" ? slug[1] : undefined);
    databaseProduct=databaseProducts[0];
  }
  const designer = await designerPromise;
  return <Storefront path={path} databaseProduct={databaseProduct} databaseProducts={databaseProducts} designerGlobals={designer.globals} designerPage={designer.page} designerCustom={designer.custom}/>;
}
