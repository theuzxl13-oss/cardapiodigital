import { PageHeader } from "@/components/admin/page-header";
import { StockAdmin } from "@/components/admin/stock-admin";

export default function StockPage() {
  return (
    <>
      <PageHeader title="Estoque" description="Insumos, entradas e saídas, consumo por venda e alertas de estoque mínimo" />
      <StockAdmin />
    </>
  );
}
