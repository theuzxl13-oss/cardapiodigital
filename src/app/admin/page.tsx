import { PageHeader } from "@/components/admin/page-header";
import { AdminDashboard } from "@/components/admin/dashboard";

export default function AdminHome() {
  return (
    <>
      <PageHeader title="Dashboard" description="Indicadores em tempo real do restaurante" />
      <AdminDashboard />
    </>
  );
}
