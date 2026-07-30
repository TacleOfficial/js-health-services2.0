import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CommerceShell } from "@/components/commerce-shell";
import { AdminMfaPanel } from "@/components/admin-mfa-panel";
import { requireAdmin } from "@/lib/account";

export default async function AdminSecurityPage() {
  const { supabase } = await requireAdmin();
  const [{ data, error }, aalRequired] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.rpc("admin_aal2_is_required"),
  ]);
  if (error) throw new Error(`Unable to read the current assurance level: ${error.message}`);
  return <CommerceShell admin><main className="admin-page container">
    <Link href="/admin" className="admin-back"><ArrowLeft />Back to admin</Link>
    <div className="admin-heading">
      <div><span className="eyebrow">ADMIN SECURITY</span><h1>Authentication assurance</h1><p>{aalRequired.data === false ? "AAL2 is currently optional. You can still enroll an authenticator before the requirement is re-enabled." : "Enroll and verify an authenticator before performing protected admin operations."}</p></div>
    </div>
    <nav className="admin-tabs" aria-label="Admin sections">
      <Link href="/admin">Review queue</Link><Link href="/admin?view=orders">Orders</Link><Link href="/admin?view=inventory">Inventory</Link><Link href="/admin?view=settings">Payment settings</Link><Link className="active" href="/admin/security">Security</Link>
    </nav>
    <AdminMfaPanel currentLevel={data.currentLevel ?? "aal1"} nextLevel={data.nextLevel ?? "aal1"} />
  </main></CommerceShell>;
}
