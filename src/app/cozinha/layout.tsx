import { requireRole } from "@/lib/auth";
import { StaffTopbar } from "@/components/staff/staff-topbar";

export const metadata = { title: "Cozinha (KDS)" };

export default async function KitchenLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["kitchen", "manager", "admin"], "/cozinha");
  return (
    <div className="dark min-h-dvh bg-[#0d0b0a] text-white">
      <StaffTopbar profile={profile} title="Cozinha · KDS" dark />
      {children}
    </div>
  );
}
