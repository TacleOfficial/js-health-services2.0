import Link from "next/link";
import { FilePlus2, Palette } from "lucide-react";
import { CommerceShell } from "@/components/commerce-shell";
import { Button, Card, Input } from "@/components/ui";
import { requireAdmin } from "@/lib/account";
import { listDesignerEntries } from "@/lib/designer-data";
import { createCustomDesignerPage } from "./actions";

export default async function DesignerIndexPage() {
  const { supabase } = await requireAdmin("/admin/designer");
  const [{ data: canEdit }, entries] = await Promise.all([
    supabase.rpc("has_admin_role", { allowed: ["manager", "super_admin"] }),
    listDesignerEntries(),
  ]);
  const customPages = entries.filter(entry => entry.kind === "custom");
  return <CommerceShell admin><main className="admin-page container designer-index">
    <div className="admin-heading"><div><span className="eyebrow">STOREFRONT DESIGNER</span><h1>Custom pages</h1><p>Create, edit, preview, publish, and restore storefront content.</p></div></div>
    <div className="designer-index-grid">
      <Card><Palette /><h2>Page library</h2><p>Fixed routes and shared templates are nested under Designer in the admin sidebar.</p><Button asChild variant="outline"><Link href="/admin/designer/home">Edit homepage</Link></Button></Card>
      <Card><FilePlus2 /><h2>Create custom page</h2><form action={createCustomDesignerPage}><label>Page title<Input name="title" required maxLength={100}/></label><label>Root URL slug<Input name="slug" required pattern="[a-z0-9][a-z0-9-]*" placeholder="about-us"/></label><label className="designer-check"><input type="checkbox" name="include_in_navigation" value="true"/> Add to global navigation</label><Button disabled={!canEdit}>Create draft</Button></form></Card>
    </div>
    <Card className="designer-custom-list"><h2>Custom page drafts</h2>{customPages.map(page => <Link href={`/admin/designer/${page.contentKey}`} key={page.id}><span><strong>{page.title}</strong><small>/{page.slug}</small></span><span>{page.publishedVersionId ? "Published" : "Draft only"}</span></Link>)}{!customPages.length && <p>No custom pages yet.</p>}</Card>
  </main></CommerceShell>;
}
