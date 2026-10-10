"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowLeft, DoorOpen, Plus, Receipt, Undo2, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { EmptyState, Separator, Skeleton } from "@/components/ui/misc";
import { OrderComposer } from "@/components/order/order-composer";
import { OrderList } from "@/components/order/order-list";
import { SupervisorDialog } from "@/components/staff/supervisor-dialog";
import { useLiveQuery } from "@/hooks/use-live-query";
import { check, loadMenuForStaff, loadTabDetail, rpc, sb } from "@/lib/api";
import { elapsedLabel, money, pad } from "@/lib/format";
import { TAB_STATUS_LABEL } from "@/lib/labels";
import type { DiningTable, Profile, Tab } from "@/lib/types";

async function loadTableView(tableId: string) {
  const { data: auth } = await sb().auth.getUser();
  const [table, tab, menu, me] = await Promise.all([
    sb().from("dining_tables").select("*").eq("id", tableId).single(),
    sb().from("tabs").select("*").eq("table_id", tableId).in("status", ["open", "closing"]).maybeSingle(),
    loadMenuForStaff(),
    sb().from("profiles").select("id, restaurant_id, full_name, role, active, email").eq("id", auth.user?.id ?? "").single(),
  ]);
  const t = check(tab) as Tab | null;
  return {
    table: check(table) as DiningTable,
    detail: t ? await loadTabDetail(t.id) : null,
    menu,
    me: check(me) as Profile,
  };
}

export function WaiterTable({ tableId }: { tableId: string }) {
  const fetcher = useCallback(() => loadTableView(tableId), [tableId]);
  const { data, loading, reload } = useLiveQuery(`waiter-table:${tableId}`, fetcher, ["orders", "tabs", "service_requests", "products"]);
  const [composer, setComposer] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [people, setPeople] = useState("2");
  const [releasing, setReleasing] = useState(false);

  if (loading || !data) return <div className="mx-auto max-w-3xl space-y-3 p-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  const { table, detail, menu, me } = data;

  async function openTab() {
    try {
      await rpc("staff_open_tab", { p_table_id: table.id, p_customer_count: Number(people) || null });
      toast.success(`Mesa ${pad(table.number)} aberta`);
      setOpenDialog(false);
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function act(fn: string, args: Record<string, unknown>, msg: string) {
    try {
      await rpc(fn, args);
      toast.success(msg);
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon"><Link href="/garcom" aria-label="Voltar"><ArrowLeft /></Link></Button>
        <div>
          <h1 className="text-2xl font-bold">Mesa {pad(table.number)}</h1>
          <p className="text-sm text-muted-foreground">{table.label} · {table.seats} lugares</p>
        </div>
        {detail && <Badge className="ml-auto" variant={detail.tab.status === "closing" ? "info" : "warning"}>{TAB_STATUS_LABEL[detail.tab.status]}</Badge>}
      </div>

      {!detail ? (
        <EmptyState icon={<DoorOpen />} title="Mesa livre" description="Abra a mesa para lançar pedidos. Clientes também podem abrir escaneando o QR Code."
          action={<Button size="lg" className="mt-2" onClick={() => setOpenDialog(true)}><DoorOpen /> Abrir mesa</Button>} />
      ) : (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className="text-base">Comanda #{detail.tab.number}</CardTitle>
              <span className="text-sm text-muted-foreground"><Users className="inline size-4" /> {detail.tab.customer_count ?? "-"} · aberta há {elapsedLabel(detail.tab.opened_at)}</span>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular">{money(detail.totals.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Taxa de serviço</span><span className="tabular">{money(detail.totals.service_fee)}</span></div>
              {Number(detail.totals.discount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="tabular">-{money(detail.totals.discount)}</span></div>}
              <Separator className="my-2" />
              <div className="flex justify-between text-lg font-bold"><span>Total</span><span className="tabular">{money(detail.totals.total)}</span></div>
              {detail.requests.length > 0 && (
                <div className="mt-2 space-y-1">
                  {detail.requests.map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-md bg-amber-50 px-3 py-2 dark:bg-amber-950/40">
                      <span>{r.type === "request_bill" ? "Cliente solicitou a conta" : "Cliente chamou o garçom"}</span>
                      <Button size="sm" variant="outline" onClick={() => act("update_service_request", { p_request_id: r.id, p_status: "done" }, "Chamado atendido")}>Atendido</Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            {detail.tab.status === "open" ? (
              <Button variant="outline" onClick={() => act("request_tab_close", { p_tab_id: detail.tab.id }, "Fechamento solicitado ao caixa")}><Receipt /> Solicitar fechamento</Button>
            ) : (
              <Button variant="outline" onClick={() => act("reopen_tab", { p_tab_id: detail.tab.id }, "Comanda reaberta")}><Undo2 /> Reabrir comanda</Button>
            )}
            <Button variant="outline" disabled={detail.orders.some((o) => o.status !== "cancelled")} onClick={() => setReleasing(true)}>
              <DoorOpen /> Liberar sem consumo
            </Button>
          </div>

          <h2 className="pt-2 font-semibold">Pedidos</h2>
          {detail.orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pedido nesta comanda.</p>
          ) : (
            <OrderList orders={[...detail.orders].reverse()} role={me.role} onChanged={reload} allowDeliver />
          )}

          <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-4 backdrop-blur">
            <div className="mx-auto max-w-3xl">
              <Button size="xl" className="w-full" onClick={() => setComposer(true)}><Plus /> Lançar pedido</Button>
            </div>
          </div>

          <OrderComposer open={composer} onOpenChange={setComposer} tabId={detail.tab.id} tableNumber={table.number}
            categories={menu.categories.filter((c) => c.active)} products={menu.products} onSent={reload} />
          <SupervisorDialog open={releasing} onOpenChange={setReleasing} title="Liberar mesa sem consumo" askPin={false}
            description="Use quando a mesa foi aberta por engano ou o cliente saiu sem pedir."
            confirmLabel="Liberar mesa"
            onConfirm={async (reason) => {
              try {
                await rpc("cancel_empty_tab", { p_tab_id: detail.tab.id, p_reason: reason });
                toast.success("Mesa liberada");
                reload();
              } catch (e) { toast.error((e as Error).message); throw e; }
            }} />
        </>
      )}

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Abrir Mesa {pad(table.number)}</DialogTitle></DialogHeader>
          <Field label="Número de pessoas">
            <Input type="number" min={1} max={50} value={people} onChange={(e) => setPeople(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
            <Button onClick={openTab}>Abrir mesa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
