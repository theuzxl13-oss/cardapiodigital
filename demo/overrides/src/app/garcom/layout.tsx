"use client";

import { StaffGuard } from "@/components/demo/staff-guard";
import { StaffTopbar } from "@/components/staff/staff-topbar";
import type { AppRole } from "@/lib/types";

const ROLES: AppRole[] = ["waiter", "manager", "admin"];

export default function WaiterLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffGuard roles={ROLES}>
      {(profile) => (
        <div className="min-h-dvh bg-muted/40">
          <StaffTopbar profile={profile} title="Painel do Garçom" />
          {children}
        </div>
      )}
    </StaffGuard>
  );
}
