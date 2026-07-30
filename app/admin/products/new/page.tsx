import { CommerceShell } from "@/components/commerce-shell";
import { AdminProductEditor } from "@/components/admin-product-editor";
import { requireAdmin } from "@/lib/account";

export default async function NewAdminProductPage() {
  const { supabase } = await requireAdmin();
  const [role, aal, aalRequired] = await Promise.all([
    supabase.rpc("has_admin_role", { allowed: ["manager", "super_admin"] }),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.rpc("admin_aal2_is_required"),
  ]);
  const canManage = Boolean(role.data) && (aalRequired.data === false || aal.data?.currentLevel === "aal2");
  return <CommerceShell admin><main className="admin-page container"><div className="admin-heading"><div><span className="eyebrow">INVENTORY / NEW PRODUCT</span><h1>Add product</h1><p>Create product details, variants, pricing, and starting inventory.</p></div></div><AdminProductEditor canManage={canManage} /></main></CommerceShell>;
}
