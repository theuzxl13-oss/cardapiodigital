import { PageHeader } from "@/components/admin/page-header";
import { SettingsAdmin } from "@/components/admin/settings-admin";
import { requireRole } from "@/lib/auth";

export default async function SettingsPage() {
  await requireRole(["admin"], "/admin/configuracoes");
  return (
    <>
      <PageHeader title="Configurações" description="Dados do restaurante e regras operacionais" />
      <SettingsAdmin />
    </>
  );
}
