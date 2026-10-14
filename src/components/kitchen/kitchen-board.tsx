"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Flame, History, PackageX, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useAlerts } from "@/hooks/use-alerts";
import { useNow } from "@/hooks/use-now";
import { check, rpc, sb } from "@/lib/api";
import { elapsedLabel, minutesSince, pad, time } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { DiningTable, Order, OrderStatus, Product } from "@/lib/types";

async function loadKitchen() {
  const since = new Date(Date.now() - 3 * 3600_000).toISOString();
  const [orders, tables, history] = await Promise.all([
    sb().from("orders").select("*, order_items(*)").in("status", ["received", "preparing", "ready"]).order("created_at"),
    sb().from("dining_tables").select("id, number"),
    sb().from("orders").select("*, order_items(*)").in("status", ["delivered", "cancelled"]).gte("created_at", since).order("created_at", { ascending: false }).limit(60),
  ]);
  return {
    orders: check(orders) as Order[],
    tables: check(tables) as Pick<DiningTable, "id" | "number">[],
    history: check(history) as Order[],
  };
}

const COLUMNS: { status: OrderStatus; title: string; accent: string }[] = [
  { status: "received", title: "Novos", accent: "border-sky-500" },
  { status: "preparing", title: "Em preparo", accent: "border-amber-500" },
  { status: "ready", title: "Prontos", accent: "border-emerald-500" },
];

export function KitchenBoard({ soundDefault, lateMinutes }: { soundDefault: boolean; lateMinutes: number }) {
  const { data, connected, reload } = useLiveQuery("kitchen", loadKitchen, ["orders"], { intervalMs: 15000 });
  const alerts = useAlerts("alerts:kitchen", soundDefault);
  const { beep, notify } = alerts;
  const now = useNow(10000);
  const seen = useRef<Set<string> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showStock, setShowStock] = useState(false);

  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.orders.filter((o) => o.status === "received").map((o) => o.id));
    if (seen.current) {
      const fresh = [...ids].filter((id) => !seen.current!.has(id));
      if (fresh.length) {
        beep("new");
        notify("Novo pedido na cozinha", `${fresh.length} pedido(s) recebido(s)`);
      }
    }
    seen.current = new Set([...(seen.current ?? []), ...ids]);
  }, [data, beep, notify]);

  const tableNumber = useCallback((id: string) => pad(data?.tables.find((t) => t.id === id)?.number ?? 0), [data]);

  async function move(o: Order, to: OrderStatus) {
    setBusy(o.id);
    try {
      await rpc("update_order_status", { p_order_id: o.id, p_to: to, p_expected_from: o.status });
      reload();
    } catch (e) {
      toast.error((e as Error).message);
      reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="p-3 md:p-4" onPointerDown={alerts.unlock}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={cn("flex items-center gap-2 rounded-full px-3 py-1 text-sm", connected ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300")}>
          <span className={cn("size-2 rounded-full", connected ? "bg-emerald-400" : "bg-rose-400")} /> {connected ? "Tempo real" : "Reconectando…"}
        </span>
        <span className="tabular text-lg font-semibold">{new Date(now).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" className="border-white/20 bg-white/5" onClick={() => setShowStock(true)}><PackageX /> Disponibilidade</Button>
          <Button variant="outline" className="border-white/20 bg-white/5" onClick={() => setShowHistory(true)}><History /> Histórico</Button>
          <Button variant="outline" className="border-white/20 bg-white/5" onClick={() => { alerts.unlock(); alerts.save({ enabled: !alerts.enabled, volume: alerts.volume }); }}>
            {alerts.enabled ? <Volume2 /> : <VolumeX />}
          </Button>
          {alerts.enabled && (
            <input aria-label="Volume" type="range" min={0.1} max={1} step={0.1} value={alerts.volume}
              onChange={(e) => alerts.save({ enabled: true, volume: Number(e.target.value) })} className="w-24 accent-amber-500" />
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = (data?.orders ?? []).filter((o) => o.status === col.status)
            .sort((a, b) => Number(b.priority) - Number(a.priority) || a.created_at.localeCompare(b.created_at));
          return (
            <section key={col.status} className="flex min-h-[60vh] flex-col rounded-2xl bg-white/[0.04] p-2.5">
              <h2 className={cn("mb-2.5 flex items-center justify-between border-l-4 px-3 py-1 text-lg font-bold uppercase tracking-wide", col.accent)}>
                {col.title} <span className="tabular rounded-full bg-white/10 px-3 text-base">{list.length}</span>
              </h2>
              <div className="grid content-start gap-2.5 md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                {list.map((o) => {
                  const mins = minutesSince(o.created_at, now);
                  const late = col.status !== "ready" && mins >= lateMinutes;
                  const warn = col.status !== "ready" && mins >= lateMinutes * 0.6;
                  return (
                    <article key={o.id} className={cn("flex flex-col rounded-xl border-2 bg-[#1a1714] p-3",
                      late ? "border-rose-500" : warn ? "border-amber-500/70" : "border-white/10", o.priority && "ring-2 ring-orange-500")}>
                      <header className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-2xl font-black leading-none">Mesa {tableNumber(o.table_id)}</p>
                          <p className="mt-1 text-sm text-white/60">#{o.number} · {time(o.created_at)} · {o.source === "customer" ? "QR" : "Garçom"}</p>
                        </div>
                        <div className="text-right">
                          <p className={cn("tabular flex items-center gap-1 text-xl font-bold", late ? "text-rose-400" : warn ? "text-amber-400" : "text-white/80")}>
                            <Clock className="size-5" /> {elapsedLabel(o.created_at, now)}
                          </p>
                          {o.priority && <p className="mt-1 flex items-center justify-end gap-1 text-sm font-bold text-orange-400"><Flame className="size-4" /> PRIORIDADE</p>}
                        </div>
                      </header>
                      <ul className="my-3 space-y-1.5">
                        {o.order_items?.map((i) => (
                          <li key={i.id} className="text-lg leading-snug">
                            <span className="mr-2 inline-grid min-w-8 place-items-center rounded-md bg-white text-base font-black text-black">{i.quantity}</span>
                            <span className="font-semibold">{i.product_name}</span>
                            {i.modifiers.length > 0 && <span className="block pl-10 text-base text-sky-300">{i.modifiers.map((m) => m.name).join(" · ")}</span>}
                            {i.notes && <span className="block pl-10 text-base font-semibold text-amber-300">⚠ {i.notes}</span>}
                          </li>
                        ))}
                      </ul>
                      {o.notes && <p className="mb-3 rounded-lg bg-amber-400/15 px-3 py-2 text-base font-medium text-amber-200">Obs.: {o.notes}</p>}
                      <div className="mt-auto flex gap-2">
                        {col.status === "received" && (
                          <Button size="xl" className="flex-1 bg-amber-500 text-black hover:bg-amber-400" disabled={busy === o.id} onClick={() => move(o, "preparing")}>Iniciar preparo</Button>
                        )}
                        {col.status === "preparing" && (
                          <>
                            <Button size="xl" variant="outline" className="border-white/20 bg-transparent px-4" disabled={busy === o.id} onClick={() => move(o, "received")} aria-label="Voltar"><RotateCcw /></Button>
                            <Button size="xl" className="flex-1 bg-emerald-500 text-black hover:bg-emerald-400" disabled={busy === o.id} onClick={() => move(o, "ready")}>Pronto</Button>
                          </>
                        )}
                        {col.status === "ready" && (
                          <>
                            <Button size="lg" variant="outline" className="border-white/20 bg-transparent" disabled={busy === o.id} onClick={() => move(o, "preparing")}><RotateCcw /> Voltar</Button>
                            <p className="flex flex-1 items-center justify-end text-sm text-emerald-300">Aguardando garçom · {elapsedLabel(o.ready_at ?? o.created_at, now)}</p>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
                {list.length === 0 && <p className="col-span-full py-10 text-center text-white/40">Nenhum pedido</p>}
              </div>
            </section>
          );
        })}
      </div>

      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent side="right" className="dark bg-[#141110] text-white">
          <DialogHeader><DialogTitle>Histórico (últimas 3 horas)</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {(data?.history ?? []).map((o) => (
              <div key={o.id} className="rounded-lg border border-white/10 p-3 text-sm">
                <div className="flex justify-between font-semibold">
                  <span>Mesa {tableNumber(o.table_id)} · #{o.number}</span>
                  <span className={o.status === "cancelled" ? "text-rose-400" : "text-white/60"}>{ORDER_STATUS_LABEL[o.status]}</span>
                </div>
                <p className="text-white/60">{time(o.created_at)}{o.ready_at ? ` → pronto ${time(o.ready_at)}` : ""}{o.delivered_at ? ` → entregue ${time(o.delivered_at)}` : ""}</p>
                <p className="mt-1">{o.order_items?.map((i) => `${i.quantity}× ${i.product_name}`).join(", ")}</p>
                {o.cancel_reason && <p className="text-rose-300">Motivo: {o.cancel_reason}</p>}
              </div>
            ))}
            {data?.history.length === 0 && <p className="text-white/50">Sem pedidos finalizados no período.</p>}
          </div>
        </DialogContent>
      </Dialog>

      <AvailabilityDialog open={showStock} onOpenChange={setShowStock} />
    </main>
  );
}

/** Cozinha pode marcar produtos como indisponíveis (reflete no cardápio do cliente em tempo real). */
function AvailabilityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) return;
    sb().from("products").select("*").is("deleted_at", null).eq("active", true).order("name").then(({ data }) => setProducts((data ?? []) as Product[]));
  }, [open]);

  async function toggle(p: Product, available: boolean) {
    const { error } = await sb().from("products").update({ available }).eq("id", p.id);
    if (error) return toast.error(error.message);
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, available } : x)));
    toast.success(`${p.name}: ${available ? "disponível" : "indisponível"}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side="right" className="dark bg-[#141110] text-white">
        <DialogHeader>
          <DialogTitle>Disponibilidade dos produtos</DialogTitle>
          <DialogDescription>Itens indisponíveis não podem ser pedidos e aparecem marcados no cardápio.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} className="bg-white/5" />
        <div className="divide-y divide-white/10">
          {products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).map((p) => (
            <label key={p.id} className="flex items-center justify-between gap-3 py-3">
              <span className={cn(!p.available && "text-white/40 line-through")}>{p.name}</span>
              <Switch checked={p.available} onCheckedChange={(v) => toggle(p, v)} />
            </label>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
