import { requireRole } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export const metadata = { title: "Administração" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["admin", "manager"], "/admin");
  return (
    <div className="min-h-dvh bg-muted/40 lg:grid lg:grid-cols-[248px_1fr]">
      <AdminSidebar profile={profile} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
