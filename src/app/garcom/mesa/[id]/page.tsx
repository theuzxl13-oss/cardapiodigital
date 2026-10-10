import { WaiterTable } from "@/components/waiter/waiter-table";

export default async function WaiterTablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WaiterTable tableId={id} />;
}
