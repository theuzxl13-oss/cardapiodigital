import { PageHeader } from "@/components/admin/page-header";
import { TablesAdmin } from "@/components/admin/tables-admin";

export default function TablesPage() {
  return (
    <>
      <PageHeader title="Mesas" description="Cadastro, ocupação e comandas" />
      <TablesAdmin />
    </>
  );
}
