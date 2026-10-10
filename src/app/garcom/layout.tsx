import { requireRole } from "@/lib/auth";
import { StaffTopbar } from "@/components/staff/staff-topbar";

export const metadata = { title: "Garçom" };

export default async function WaiterLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["waiter", "manager", "admin"], "/garcom");
  return (
    <div className="min-h-dvh bg-muted/40">
      <StaffTopbar profile={profile} title="Painel do Garçom" />
      {children}
    </div>
  );
}
