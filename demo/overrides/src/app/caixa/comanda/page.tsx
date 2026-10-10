"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TabCheckout } from "@/components/cashier/tab-checkout";

function Inner() {
  const id = useSearchParams().get("id");
  return id ? <TabCheckout key={id} tabId={id} /> : null;
}

export default function CheckoutPage() {
  return <Suspense><Inner /></Suspense>;
}
