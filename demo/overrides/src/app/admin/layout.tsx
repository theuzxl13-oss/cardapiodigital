"use client";

import { StaffGuard } from "@/components/demo/staff-guard";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import type { AppRole } from "@/lib/types";

const ROLES: AppRole[] = ["admin", "manager"];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffGuard roles={ROLES}>
      {(profile) => (
        <div className="min-h-dvh bg-muted/40 lg:grid lg:grid-cols-[248px_1fr]">
          <AdminSidebar profile={profile} />
          <div className="min-w-0">{children}</div>
        </div>
      )}
    </StaffGuard>
  );
}
