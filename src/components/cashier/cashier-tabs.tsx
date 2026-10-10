"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Printer, Receipt, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, Skeleton, Table, Td, Th } from "@/components/ui/misc";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useNow } from "@/hooks/use-now";
import { check, sb } from "@/lib/api";
import { elapsedLabel, money, pad, time } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DiningTable, Tab, TabTotals } from "@/lib/types";

async function loadTabs() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [tabs, tables, closed] = await Promise.all([
    sb().from("tabs").select("*").in("status", ["open", "closing"]).order("opened_at"),
    sb().from("dining_tables").select("id, number, label"),
    sb().from("tabs").select("*").eq("status", "closed").gte("closed_at", today.toISOString()).order("closed_at", { ascending: false }).limit(50),
  ]);
  const active = check(tabs) as Tab[];
  const totals = await Promise.all(active.map((t) => sb().rpc("staff_tab_totals", { p_tab_id: t.id }).single()));
  return {
    tabs: active.map((t, i) => ({ ...t, totals: (totals[i].data ?? null) as TabTotals | null })),
    tables: check(tables) as Pick<DiningTable, "id" | "number" | "label">[],
    closed: check(closed) as Tab[],
  };
}

export function CashierTabs() {
  const { data, loading } = useLiveQuery("cashier-tabs", loadTabs, ["tabs", "orders", "payments"]);
  const [q, setQ] = useState("");
  const now = useNow();

  const tableNo = (id: string) => data?.tables.find((t) => t.id === id)?.number ?? 0;
  const list = useMemo(() => {
    const term = q.trim().replace(/^0+/, "");
    return (data?.tabs ?? [])
      .filter((t) => !term || String(tableNo(t.table_id)) === term || String(t.number).includes(term))
      .sort((a, b) => (a.status === b.status ? a.opened_at.localeCompare(b.opened_at) : a.status === "closing" ? -1 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, q]);

  if (loading || !data) return <div className="mx-auto grid max-w-7xl gap-3 p-4 sm:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Comandas abertas</h1>
        <Badge variant="info">{data.tabs.filter((t) => t.status === "closing").length} aguardando fechamento</Badge>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus className="pl-9" placeholder="Nº da mesa ou comanda" value={q} onChange={(e) => setQ(e.target.value)} inputMode="numeric" />
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<Receipt />} title="Nenhuma comanda aberta" description="As comandas aparecem aqui assim que uma mesa é aberta." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((t) => (
            <Link key={t.id} href={`/caixa/comanda/${t.id}`}>
              <Card className={cn("h-full transition hover:-translate-y-0.5 hover:shadow-md", t.status === "closing" && "border-2 border-violet-400")}>
                <CardHeader className="flex-row items-start justify-between pb-2">
                  <div>
                    <CardTitle className="text-2xl">Mesa {pad(tableNo(t.table_id))}</CardTitle>
                    <p className="text-xs text-muted-foreground">Comanda #{t.number} · {elapsedLabel(t.opened_at, now)}</p>
                  </div>
                  {t.status === "closing" && <Badge variant="info">Fechar conta</Badge>}
                </CardHeader>
                <CardContent className="space-y-0.5 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="tabular font-semibold">{money(t.totals?.total)}</span></div>
                  {Number(t.totals?.paid) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Pago</span><span className="tabular">{money(t.totals?.paid)}</span></div>}
                  <div className="flex justify-between text-base"><span>Saldo</span><span className="tabular font-bold text-primary">{money(t.totals?.balance)}</span></div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Encerradas hoje</CardTitle></CardHeader>
        <CardContent>
          {data.closed.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma comanda encerrada hoje.</p> : (
            <Table>
              <thead><tr><Th>Comanda</Th><Th>Mesa</Th><Th>Abertura</Th><Th>Encerramento</Th><Th /></tr></thead>
              <tbody>
                {data.closed.map((t) => (
                  <tr key={t.id}>
                    <Td>#{t.number}{t.is_demo && <Badge variant="secondary" className="ml-2">demo</Badge>}</Td>
                    <Td>{pad(tableNo(t.table_id))}</Td>
                    <Td>{time(t.opened_at)}</Td>
                    <Td>{time(t.closed_at)}</Td>
                    <Td className="text-right"><Button asChild size="sm" variant="ghost"><Link href={`/caixa/comanda/${t.id}/recibo`}><Printer /> Comprovante</Link></Button></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
