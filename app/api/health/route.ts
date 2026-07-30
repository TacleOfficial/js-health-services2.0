import { commerceReadiness } from "@/lib/commerce/config";
import { getCommerceRuntime, getShippingSettings } from "@/lib/commerce/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  let runtime: { mode: string; version: number } | null = null;
  let shipping: { mode: string; version: number } | null = null;
  try {
    const current = await getCommerceRuntime();
    runtime = { mode: current.mode, version: current.version };
    const currentShipping = await getShippingSettings();
    shipping = { mode: currentShipping.mode, version: currentShipping.version };
  } catch {}
  return Response.json({
    status: "healthy",
    service: "velle-web",
    commerce: { deployment: commerceReadiness, runtime, shipping },
    timestamp: new Date().toISOString(),
  });
}
