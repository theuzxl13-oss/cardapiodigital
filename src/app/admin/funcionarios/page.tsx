import { PageHeader } from "@/components/admin/page-header";
import { StaffAdmin } from "@/components/admin/staff-admin";
import { requireRole } from "@/lib/auth";

export default async function StaffPage() {
  const me = await requireRole(["admin"], "/admin/funcionarios");
  return (
    <>
      <PageHeader title="Funcionários" description="Usuários, permissões, PIN de supervisor e bloqueio de acesso" />
      <StaffAdmin meId={me.id} serviceKeyConfigured={Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)} />
    </>
  );
}
