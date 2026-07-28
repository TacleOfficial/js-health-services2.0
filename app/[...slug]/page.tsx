import { Storefront } from "@/components/storefront";

export default async function RoutedPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <Storefront path={`/${slug.join("/")}`} />;
}
