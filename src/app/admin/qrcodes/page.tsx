import { PageHeader } from "@/components/admin/page-header";
import { QrCodesAdmin } from "@/components/admin/qrcodes-admin";

export default function QrPage() {
  return (
    <>
      <PageHeader title="QR Codes" description="Geração, impressão e download dos QR Codes das mesas" />
      <QrCodesAdmin />
    </>
  );
}
