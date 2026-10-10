"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { BellRing, CheckCheck, ChefHat, Receipt, Users, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useAlerts } from "@/hooks/use-alerts";
import { useNow } from "@/hooks/use-now";
import { loadFloor, rpc } from "@/lib/api";
import { elapsedLabel, money, pad } from "@/lib/format";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";

export function WaiterFloor() {
  const { data, loading, connected } = useLiveQuery("waiter-floor", loadFloor, ["orders", "tabs", "service_requests", "dining_tables"]);
  const alerts = useAlerts("alerts:waiter");
  const now = useNow();
  const seenReady = useRef<Set<string> | null>(null);
  const seenRequests = useRef<Set<string> | null>(null);

  const ready = useMemo(() => (data?.orders ?? []).filter((o) => o.status === "ready"), [data]);
  const requests = data?.requests ?? [];

  // Notificação de pratos prontos e chamados de clientes
  useEffect(() => {
    if (!data) return;
    const readyIds = new Set(ready.map((o) => o.id));
    const reqIds = new Set(requests.map((r) => r.id));
    if (seenReady.current) {
      for (const o of ready) if (!seenReady.current.has(o.id)) {
        const t = data.tables.find((x) => x.id === o.table_id);
        toast.success(`Pedido #${o.number} pronto — Mesa ${pad(t?.number ?? 0)}`, { duration: 10000 });
        alerts.beep("ready");
        alerts.notify("Pedido pronto", `Pedido #${o.number} · Mesa ${pad(t?.number ?? 0)}`);
      }
    }
    if (seenRequests.current) {
      for (const r of requests) if (!seenRequests.current.has(r.id)) {
        const t = data.tables.find((x) => x.id === r.table_id);
        toast.info(`${r.type === "request_bill" ? "Conta solicitada" : "Chamado"} — Mesa ${pad(t?.number ?? 0)}`, { duration: 10000 });
        alerts.beep("call");
        alerts.notify(r.type === "request_bill" ? "Conta solicitada" : "Cliente chamando", `Mesa ${pad(t?.number ?? 0)}`);
      }
    }
    seenReady.current = readyIds;
    seenRequests.current = reqIds;
  }, [data, ready, requests, alerts]);

  async function deliver(orderId: string) {
    try {
      await rpc("update_order_status", { p_order_id: orderId, p_to: "delivered", p_expected_from: "ready" });
      toast.success("Pedido marcado como entregue");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function resolveRequest(id: string) {
    try {
      await rpc("update_service_request", { p_request_id: id, p_status: "done" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (loading || !data) {
    return <div className="grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 15 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>;
  }

  const tabByTable = new Map(data.tabs.map((t) => [t.table_id, t]));
  const occupied = data.tabs.length;

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4" onPointerDown={alerts.unlock}>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">Mesas</h1>
        <Badge variant="success">{data.tables.length - occupied} livres</Badge>
        <Badge variant="warning">{occupied} ocupadas</Badge>
        <span className={cn("ml-1 size-2 rounded-full", connected ? "bg-emerald-500" : "bg-rose-500")} title={connected ? "Tempo real conectado" : "Reconectando…"} />
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => { alerts.unlock(); alerts.save({ enabled: !alerts.enabled, volume: alerts.volume }); }}>
          {alerts.enabled ? <Volume2 /> : <VolumeX />} Som {alerts.enabled ? "ligado" : "desligado"}
        </Button>
      </div>

      {(ready.length > 0 || requests.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className={cn(ready.length > 0 && "border-emerald-400")}>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ChefHat className="size-5 text-emerald-600" /> Prontos para servir ({ready.length})</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {ready.length === 0 && <p className="text-sm text-muted-foreground">Nenhum prato aguardando.</p>}
              {ready.map((o) => {
                const t = data.tables.find((x) => x.id === o.table_id);
                return (
                  <div key={o.id} className="flex items-center gap-3 rounded-lg border bg-emerald-50 p-3 dark:bg-emerald-950/30">
                    <div className="grid size-12 place-items-center rounded-lg bg-emerald-600 text-lg font-bold text-white">{pad(t?.number ?? 0)}</div>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold">Pedido #{o.number} <span className="font-normal text-muted-foreground">· pronto há {elapsedLabel(o.ready_at ?? o.created_at, now)}</span></p>
                      <p className="truncate text-muted-foreground">{o.order_items?.map((i) => `${i.quantity}× ${i.product_name}`).join(", ")}</p>
                    </div>
                    <Button variant="success" onClick={() => deliver(o.id)}><CheckCheck /> Entregue</Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card className={cn(requests.length > 0 && "border-amber-400")}>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><BellRing className="size-5 text-amber-600" /> Chamados ({requests.length})</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {requests.length === 0 && <p className="text-sm text-muted-foreground">Nenhum chamado aberto.</p>}
              {requests.map((r) => {
                const t = data.tables.find((x) => x.id === r.table_id);
                return (
                  <div key={r.id} className="flex items-center gap-3 rounded-lg border bg-amber-50 p-3 dark:bg-amber-950/30">
                    <div className="grid size-12 place-items-center rounded-lg bg-amber-500 text-lg font-bold text-white">{pad(t?.number ?? 0)}</div>
                    <div className="flex-1 text-sm">
                      <p className="font-semibold">{r.type === "request_bill" ? "Solicitou a conta" : "Chamou o garçom"}</p>
                      <p className="text-muted-foreground">há {elapsedLabel(r.created_at, now)}{r.note ? ` · ${r.note}` : ""}</p>
                    </div>
                    <Button variant="outline" onClick={() => resolveRequest(r.id)}>Atendido</Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {data.tables.map((t) => {
          const tab = tabByTable.get(t.id);
          const orders = data.orders.filter((o) => o.table_id === t.id);
          const hasReady = orders.some((o) => o.status === "ready");
          const req = requests.filter((r) => r.table_id === t.id);
          const total = orders.reduce((s, o) => s + Number(o.subtotal), 0);
          return (
            <Link key={t.id} href={routes.waiterTable(t.id)}
              className={cn(
                "relative flex min-h-32 flex-col rounded-2xl border-2 p-3 transition active:scale-[0.98]",
                !tab && "border-emerald-200 bg-card hover:border-emerald-400 dark:border-emerald-900",
                tab?.status === "open" && "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
                tab?.status === "closing" && "border-violet-400 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30",
                hasReady && "animate-pulse-ring",
              )}>
              <div className="flex items-start justify-between">
                <span className="tabular text-3xl font-bold">{pad(t.number)}</span>
                <div className="flex gap-1">
                  {req.length > 0 && <BellRing className="size-5 text-amber-600" />}
                  {hasReady && <ChefHat className="size-5 text-emerald-600" />}
                  {tab?.status === "closing" && <Receipt className="size-5 text-violet-600" />}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t.label} · <Users className="inline size-3" /> {t.seats}</p>
              <div className="mt-auto pt-2 text-sm">
                {!tab ? (
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">Livre</span>
                ) : (
                  <>
                    <p className="font-medium">{tab.status === "closing" ? "Conta solicitada" : "Ocupada"} · {elapsedLabel(tab.opened_at, now)}</p>
                    <p className="text-xs text-muted-foreground">{orders.length} em andamento{total > 0 ? ` · ${money(total)}` : ""}</p>
                  </>
                )}
              </div>
            </Link>
          );
        })}
      </div>
      {data.tables.length === 0 && <EmptyState title="Nenhuma mesa cadastrada" description="Cadastre mesas no painel administrativo." />}
    </main>
  );
}
