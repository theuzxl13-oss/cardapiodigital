import { requireRole } from "@/lib/auth";
import { StaffTopbar } from "@/components/staff/staff-topbar";
import { CashSessionBar } from "@/components/cashier/cash-session-bar";

export const metadata = { title: "Caixa" };

export default async function CashierLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["cashier", "manager", "admin"], "/caixa");
  return (
    <div className="min-h-dvh bg-muted/40">
      <StaffTopbar profile={profile} title="Caixa · PDV" />
      <CashSessionBar operatorId={profile.id} />
      {children}
    </div>
  );
}
