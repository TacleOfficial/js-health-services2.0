import { notFound } from "next/navigation";
import { CommerceShell } from "@/components/commerce-shell";
import { AdminDesignerEditor } from "@/components/admin-designer-editor";
import { requireAdmin } from "@/lib/account";
import { getDesignerEntry, getDesignerVersions } from "@/lib/designer-data";
import { deleteCustomDesignerPage, publishDesignerEntry, rollbackDesignerEntry, unpublishDesignerEntry } from "../actions";

export default async function DesignerEditorPage({ params }: { params: Promise<{ contentKey: string }> }) {
  const { contentKey } = await params;
  const { supabase } = await requireAdmin(`/admin/designer/${contentKey}`);
  const entry = await getDesignerEntry(contentKey);
  if (!entry) notFound();
  const [{ data: isSuperAdmin }, versions] = await Promise.all([
    supabase.rpc("has_admin_role", { allowed: ["super_admin"] }),
    getDesignerVersions(entry.id),
  ]);
  return <CommerceShell admin><main className="designer-admin-page">
    <AdminDesignerEditor entry={entry} versions={versions} isSuperAdmin={Boolean(isSuperAdmin)}
      publishAction={publishDesignerEntry} rollbackAction={rollbackDesignerEntry} unpublishAction={unpublishDesignerEntry} deleteAction={deleteCustomDesignerPage}/>
  </main></CommerceShell>;
}
