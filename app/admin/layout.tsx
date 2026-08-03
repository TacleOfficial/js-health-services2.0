import "./admin.css";
import { AdminSidebar } from "@/components/admin-sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-app-shell"><AdminSidebar /><div className="admin-app-content">{children}</div></div>;
}
