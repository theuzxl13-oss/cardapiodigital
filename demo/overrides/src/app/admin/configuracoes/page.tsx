"use client";

import { PageHeader } from "@/components/admin/page-header";
import { SettingsAdmin } from "@/components/admin/settings-admin";
import { StaffGuard } from "@/components/demo/staff-guard";

export default function SettingsPage() {
  return (
    <StaffGuard roles={["admin"]}>
      {() => (
        <>
          <PageHeader title="Configurações" description="Dados do restaurante e regras operacionais" />
          <SettingsAdmin />
        </>
      )}
    </StaffGuard>
  );
}
