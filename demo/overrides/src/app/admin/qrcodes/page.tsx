"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { QrCodesAdmin } from "@/components/admin/qrcodes-admin";
import { BASE } from "@/lib/demo/config";

export default function QrPage() {
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  useEffect(() => setSiteUrl(window.location.origin + BASE), []);
  return (
    <>
      <PageHeader title="QR Codes" description="Geração, impressão e download dos QR Codes das mesas" />
      {siteUrl && <QrCodesAdmin siteUrl={siteUrl} />}
    </>
  );
}
