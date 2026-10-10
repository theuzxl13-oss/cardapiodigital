"use client";

import { StaffGuard } from "@/components/demo/staff-guard";
import { StaffTopbar } from "@/components/staff/staff-topbar";
import { CashSessionBar } from "@/components/cashier/cash-session-bar";
import type { AppRole } from "@/lib/types";

const ROLES: AppRole[] = ["cashier", "manager", "admin"];

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffGuard roles={ROLES}>
      {(profile) => (
        <div className="min-h-dvh bg-muted/40">
          <StaffTopbar profile={profile} title="Caixa · PDV" />
          <CashSessionBar operatorId={profile.id} />
          {children}
        </div>
      )}
    </StaffGuard>
  );
}
