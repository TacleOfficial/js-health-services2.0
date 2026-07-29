import { commerceReadiness } from "@/lib/commerce/config";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "healthy",
    service: "velle-web",
    commerce: commerceReadiness,
    timestamp: new Date().toISOString(),
  });
}
