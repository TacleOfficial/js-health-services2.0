"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, FileText, LayoutDashboard, Package, Palette, Settings, ShoppingBag } from "lucide-react";
import { fixedDesignerPages } from "@/lib/designer";

export function AdminSidebar() {
  const pathname = usePathname();
  const designerOpen = pathname.startsWith("/admin/designer");
  return <aside className="admin-sidebar" aria-label="Admin navigation">
    <Link className="admin-sidebar-brand" href="/admin"><LayoutDashboard /><span>Operations</span></Link>
    <nav>
      <Link href="/admin" className={pathname === "/admin" ? "active" : ""}><FileText /> Review queue</Link>
      <Link href="/admin?view=orders"><ShoppingBag /> Orders</Link>
      <Link href="/admin?view=inventory"><Package /> Inventory</Link>
      <details open={designerOpen}>
        <summary><Palette /> Designer <ChevronDown /></summary>
        <div className="admin-sidebar-nested">
          <Link href="/admin/designer/globals" className={pathname === "/admin/designer/globals" ? "active" : ""}>Global elements</Link>
          {fixedDesignerPages.map(([key, label]) =>
            <Link href={`/admin/designer/${key}`} className={pathname === `/admin/designer/${key}` ? "active" : ""} key={key}>{label}</Link>)}
          <Link href="/admin/designer" className={pathname === "/admin/designer" ? "active" : ""}>Custom pages</Link>
        </div>
      </details>
      <Link href="/admin?view=settings"><Settings /> Settings</Link>
    </nav>
  </aside>;
}
