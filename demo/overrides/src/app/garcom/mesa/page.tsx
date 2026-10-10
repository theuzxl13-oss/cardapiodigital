"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { WaiterTable } from "@/components/waiter/waiter-table";

function Inner() {
  const id = useSearchParams().get("id");
  return id ? <WaiterTable key={id} tableId={id} /> : null;
}

export default function WaiterTablePage() {
  return <Suspense><Inner /></Suspense>;
}
