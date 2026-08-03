import { notFound } from "next/navigation";
import { CommerceShell } from "@/components/commerce-shell";
import { DesignerPageRenderer } from "@/components/designer-page-renderer";
import { requireAdmin } from "@/lib/account";
import { getDesignerEntry } from "@/lib/designer-data";

export default async function DesignerPreviewPage({ params }: { params: Promise<{ contentKey: string }> }) {
  const { contentKey } = await params;
  await requireAdmin(`/admin/designer/${contentKey}/preview`);
  const entry = await getDesignerEntry(contentKey);
  if (!entry || entry.draftDocument.kind !== "page") notFound();
  return <CommerceShell><div className="designer-draft-ribbon">DRAFT PREVIEW · NOT PUBLISHED</div><DesignerPageRenderer document={entry.draftDocument} preview/></CommerceShell>;
}
