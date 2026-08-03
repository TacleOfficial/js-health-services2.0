import { Storefront } from "@/components/storefront";
import { loadPublishedDesignerContent } from "@/lib/designer-data";

export default async function Home() {
  const designer = await loadPublishedDesignerContent("/");
  return <Storefront path="/" designerGlobals={designer.globals} designerPage={designer.page} />;
}
