"use client";

import { useState } from "react";
import { Ban, CheckCheck, Flame } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SupervisorDialog } from "@/components/staff/supervisor-dialog";
import { rpc } from "@/lib/api";
import { money, time } from "@/lib/format";
import { ORDER_STATUS_COLOR, ORDER_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { AppRole, Order } from "@/lib/types";

/** Lista de pedidos da comanda com ações conforme o papel (entregar, cancelar). */
export function OrderList({ orders, role, onChanged, allowDeliver = false }: { orders: Order[]; role: AppRole; onChanged: () => void; allowDeliver?: boolean }) {
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const isSupervisor = role === "admin" || role === "manager";

  async function deliver(o: Order) {
    try {
      await rpc("update_order_status", { p_order_id: o.id, p_to: "delivered", p_expected_from: "ready" });
      toast.success(`Pedido #${o.number} entregue`);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="grid gap-3">
      {orders.map((o) => (
        <div key={o.id} className={cn("rounded-xl border bg-card p-4", o.status === "cancelled" && "opacity-60")}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">#{o.number}</p>
            <span className="text-xs text-muted-foreground">{time(o.created_at)} · {o.source === "customer" ? "QR Code" : "Garçom"}</span>
            {o.priority && <span className="flex items-center gap-1 text-xs font-semibold text-orange-600"><Flame className="size-3.5" /> Prioridade</span>}
            <span className={cn("ml-auto rounded-full border px-2 py-0.5 text-xs font-medium", ORDER_STATUS_COLOR[o.status])}>{ORDER_STATUS_LABEL[o.status]}</span>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {o.order_items?.map((i) => (
              <li key={i.id} className="flex justify-between gap-3">
                <span>
                  <b>{i.quantity}×</b> {i.product_name}
                  {i.modifiers.length > 0 && <span className="text-muted-foreground"> · {i.modifiers.map((m) => m.name).join(", ")}</span>}
                  {i.notes && <span className="block text-xs italic text-amber-700 dark:text-amber-400">“{i.notes}”</span>}
                </span>
                <span className={cn("tabular shrink-0", o.status === "cancelled" && "line-through")}>{money(i.line_total)}</span>
              </li>
            ))}
          </ul>
          {o.notes && <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">Obs.: {o.notes}</p>}
          {o.status === "cancelled" && o.cancel_reason && <p className="mt-2 text-xs text-destructive">Cancelado: {o.cancel_reason}</p>}
          {o.status !== "cancelled" && o.status !== "delivered" && (
            <div className="mt-3 flex flex-wrap gap-2">
              {allowDeliver && o.status === "ready" && <Button size="sm" variant="success" onClick={() => deliver(o)}><CheckCheck /> Marcar entregue</Button>}
              {role !== "kitchen" && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelling(o)}><Ban /> Cancelar</Button>
              )}
            </div>
          )}
        </div>
      ))}
      <SupervisorDialog
        open={!!cancelling}
        onOpenChange={(v) => !v && setCancelling(null)}
        title={`Cancelar pedido #${cancelling?.number ?? ""}`}
        description={cancelling && cancelling.status !== "received"
          ? "O pedido já começou a ser preparado. O cancelamento exige autorização de um gerente."
          : "Informe o motivo. O cancelamento fica registrado com seu nome."}
        askPin={!!cancelling && cancelling.status !== "received" && !isSupervisor}
        destructive
        confirmLabel="Cancelar pedido"
        onConfirm={async (reason, pin) => {
          try {
            await rpc("cancel_order", { p_order_id: cancelling!.id, p_reason: reason, p_supervisor_pin: pin });
            toast.success("Pedido cancelado");
            onChanged();
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
    </div>
  );
}
