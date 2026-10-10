"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Receipt } from "@/components/cashier/receipt";

function Inner() {
  const id = useSearchParams().get("id");
  return id ? <Receipt key={id} tabId={id} /> : null;
}

export default function ReceiptPage() {
  return <Suspense><Inner /></Suspense>;
}
