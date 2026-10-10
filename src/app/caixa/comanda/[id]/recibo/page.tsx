import { Receipt } from "@/components/cashier/receipt";

export const metadata = { title: "Comprovante" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Receipt tabId={id} />;
}
