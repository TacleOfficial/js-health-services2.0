import { Storefront } from "@/components/storefront";
import { loadPublishedDesignerContent } from "@/lib/designer-data";
import { loadActiveCatalogProducts } from "@/lib/catalog-data";

export default async function Home() {
  const [designer, databaseProducts] = await Promise.all([
    loadPublishedDesignerContent("/"),
    loadActiveCatalogProducts(),
  ]);
  return <Storefront path="/" designerGlobals={designer.globals} designerPage={designer.page} databaseProducts={databaseProducts} />;
}
