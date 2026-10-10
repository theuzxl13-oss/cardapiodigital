"use client";

import { PageHeader } from "@/components/admin/page-header";
import { StaffAdmin } from "@/components/admin/staff-admin";
import { StaffGuard } from "@/components/demo/staff-guard";

export default function StaffPage() {
  return (
    <StaffGuard roles={["admin"]}>
      {(me) => (
        <>
          <PageHeader title="Funcionários" description="Usuários, permissões, PIN de supervisor e bloqueio de acesso" />
          <StaffAdmin meId={me.id} serviceKeyConfigured />
        </>
      )}
    </StaffGuard>
  );
}
