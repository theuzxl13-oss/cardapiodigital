import { TabCheckout } from "@/components/cashier/tab-checkout";

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TabCheckout tabId={id} />;
}
