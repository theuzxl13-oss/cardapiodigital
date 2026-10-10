"use client";

import { StaffGuard } from "@/components/demo/staff-guard";
import { StaffTopbar } from "@/components/staff/staff-topbar";
import type { AppRole } from "@/lib/types";

const ROLES: AppRole[] = ["kitchen", "manager", "admin"];

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-dvh bg-[#0d0b0a] text-white">
      <StaffGuard roles={ROLES}>
        {(profile) => (
          <>
            <StaffTopbar profile={profile} title="Cozinha · KDS" dark />
            {children}
          </>
        )}
      </StaffGuard>
    </div>
  );
}
