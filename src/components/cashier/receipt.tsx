"use client";

import { useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { useLiveQuery } from "@/hooks/use-live-query";
import { check, loadTabDetail, sb } from "@/lib/api";
import { dateTime, money, pad } from "@/lib/format";
import { PAYMENT_LABEL } from "@/lib/labels";
import type { Restaurant } from "@/lib/types";

/**
 * Comprovante NÃO FISCAL em layout de bobina 80mm. Impressão via diálogo do navegador
 * (impressora térmica instalada no sistema operacional). Ver README: integração ESC/POS e fiscal.
 */
export function Receipt({ tabId }: { tabId: string }) {
  const fetcher = useCallback(async () => {
    const [detail, restaurant] = await Promise.all([loadTabDetail(tabId, true), sb().from("restaurants").select("*").single()]);
    return { ...detail, restaurant: check(restaurant) as Restaurant };
  }, [tabId]);
  const { data } = useLiveQuery(`receipt:${tabId}`, fetcher, [], { intervalMs: 60000 });

  if (!data) return <div className="mx-auto max-w-sm p-6"><Skeleton className="h-[480px]" /></div>;
  const { tab, table, orders, totals, payments, restaurant } = data;
  const items = orders.filter((o) => o.status !== "cancelled").flatMap((o) => o.order_items ?? []);
  const validPayments = payments.filter((p) => !p.voided_at);
  const isClosed = tab.status === "closed";

  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-4 p-6">
      <div className="no-print flex w-full gap-2">
        <Button asChild variant="outline"><Link href={`/caixa/comanda/${tab.id}`}><ArrowLeft /> Voltar</Link></Button>
        <Button asChild variant="ghost"><Link href="/caixa">Comandas</Link></Button>
        <Button className="ml-auto" onClick={() => window.print()}><Printer /> Imprimir</Button>
      </div>

      <div className="print-area w-[302px] bg-white p-4 font-mono text-[12px] leading-tight text-black shadow-lg">
        <div className="text-center">
          <p className="text-[14px] font-bold">{restaurant.name}</p>
          {restaurant.address && <p>{restaurant.address}</p>}
          {restaurant.phone && <p>Tel: {restaurant.phone}</p>}
          <p className="my-2 border-y border-dashed border-black py-1 font-bold">
            {isClosed ? "COMPROVANTE NÃO FISCAL" : "PRÉ-CONTA — CONFERÊNCIA"}
          </p>
        </div>
        <p>Mesa: {pad(table.number)}   Comanda: #{tab.number}</p>
        <p>Abertura: {dateTime(tab.opened_at)}</p>
        {tab.closed_at && <p>Encerramento: {dateTime(tab.closed_at)}</p>}
        <div className="my-2 border-t border-dashed border-black" />
        {items.map((i) => (
          <div key={i.id} className="mb-1">
            <div className="flex justify-between gap-2"><span>{i.quantity}x {i.product_name}</span><span>{money(i.line_total)}</span></div>
            {i.modifiers.length > 0 && <p className="pl-3">+ {i.modifiers.map((m) => m.name).join(", ")}</p>}
          </div>
        ))}
        <div className="my-2 border-t border-dashed border-black" />
        <Row l="Subtotal" v={money(totals.subtotal)} />
        {Number(totals.service_fee) > 0 && <Row l={`Serviço (${Number(tab.service_fee_pct)}%)`} v={money(totals.service_fee)} />}
        {Number(totals.discount) > 0 && <Row l="Desconto" v={`-${money(totals.discount)}`} />}
        <Row l="TOTAL" v={money(totals.total)} bold />
        {validPayments.length > 0 && (
          <>
            <div className="my-2 border-t border-dashed border-black" />
            {validPayments.map((p) => (
              <div key={p.id}>
                <Row l={`${PAYMENT_LABEL[p.method]}${p.payer_label ? ` (${p.payer_label})` : ""}`} v={money(p.amount)} />
                {Number(p.change_amount) > 0 && <Row l="  Recebido / Troco" v={`${money(p.received_amount)} / ${money(p.change_amount)}`} />}
              </div>
            ))}
            <Row l="Total pago" v={money(totals.paid)} bold />
            {Number(totals.balance) > 0 && <Row l="Saldo pendente" v={money(totals.balance)} bold />}
          </>
        )}
        <div className="my-2 border-t border-dashed border-black" />
        <p className="text-center">{restaurant.receipt_footer}</p>
        <p className="mt-2 text-center text-[10px]">Este documento não possui valor fiscal.</p>
        {tab.is_demo && <p className="text-center text-[10px]">[DADOS DE DEMONSTRAÇÃO]</p>}
      </div>
    </main>
  );
}

function Row({ l, v, bold }: { l: string; v: string; bold?: boolean }) {
  return <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`}><span>{l}</span><span>{v}</span></div>;
}
