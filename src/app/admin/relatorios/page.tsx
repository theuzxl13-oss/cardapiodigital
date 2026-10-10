import { PageHeader } from "@/components/admin/page-header";
import { ReportsAdmin } from "@/components/admin/reports-admin";

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Relatórios" description="Financeiro, vendas, caixa, cancelamentos e estoque — exportação em PDF e Excel" />
      <ReportsAdmin />
    </>
  );
}
