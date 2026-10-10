import { PageHeader } from "@/components/admin/page-header";
import { AuditAdmin } from "@/components/admin/audit-admin";

export default function AuditPage() {
  return (
    <>
      <PageHeader title="Auditoria" description="Rastreabilidade das alterações e operações relevantes" />
      <AuditAdmin />
    </>
  );
}
