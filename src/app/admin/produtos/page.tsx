import { PageHeader } from "@/components/admin/page-header";
import { ProductsAdmin } from "@/components/admin/products-admin";

export default function ProductsPage() {
  return (
    <>
      <PageHeader title="Cardápio" description="Produtos, categorias, adicionais, fichas técnicas, imagens e modelos 3D" />
      <ProductsAdmin />
    </>
  );
}
