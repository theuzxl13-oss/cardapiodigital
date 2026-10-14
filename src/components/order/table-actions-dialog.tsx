"use client";

import { useCallback, useState } from "react";
import { ArrowRightLeft, Combine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton, Spinner } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLiveQuery } from "@/hooks/use-live-query";
import { check, rpc, sb } from "@/lib/api";
import { money, pad } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DiningTable, Tab, TabTotals } from "@/lib/types";

type Choice = { kind: "transfer"; table: DiningTable } | { kind: "merge"; table: DiningTable; tab: Tab; total: number };

async function loadOptions() {
  const [tables, tabs, summary] = await Promise.all([
    sb().from("dining_tables").select("*").eq("active", true).order("number"),
    sb().from("tabs").select("*").in("status", ["open", "closing"]),
    sb().rpc("staff_open_tabs_summary"),
  ]);
  return {
    tables: check(tables) as DiningTable[],
    tabs: check(tabs) as Tab[],
    totals: new Map((check(summary) as (TabTotals & { tab_id: string })[]).map((r) => [r.tab_id, Number(r.total)])),
  };
}

/**
 * Transferir a comanda para uma mesa livre, ou juntar a comanda de outra mesa a esta.
 * As operações são transacionais no banco e ficam registradas na auditoria.
 */
export function TableActionsDialog({ open, onOpenChange, tab, tableNumber, onTransferred, onMerged }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tab: Pick<Tab, "id" | "number" | "table_id">;
  tableNumber: number;
  onTransferred: (newTableId: string) => void;
  onMerged: () => void;
}) {
  const fetcher = useCallback(() => loadOptions(), []);
  const { data } = useLiveQuery(`table-actions:${tab.id}:${open}`, fetcher, open ? ["tabs", "dining_tables"] : [], { intervalMs: 30000 });
  const [choice, setChoice] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);

  const busyTables = new Set((data?.tabs ?? []).map((t) => t.table_id));
  const free = (data?.tables ?? []).filter((t) => !busyTables.has(t.id));
  const occupied = (data?.tabs ?? [])
    .filter((t) => t.id !== tab.id)
    .map((t) => ({ tab: t, table: data!.tables.find((x) => x.id === t.table_id) }))
    .filter((x): x is { tab: Tab; table: DiningTable } => !!x.table)
    .sort((a, b) => a.table.number - b.table.number);

  async function confirm() {
    if (!choice) return;
    setBusy(true);
    try {
      if (choice.kind === "transfer") {
        await rpc("transfer_tab", { p_tab_id: tab.id, p_target_table_id: choice.table.id });
        toast.success(`Comanda #${tab.number} transferida para a Mesa ${pad(choice.table.number)}`);
        onTransferred(choice.table.id);
      } else {
        await rpc("merge_tabs", { p_source_tab_id: choice.tab.id, p_target_tab_id: tab.id });
        toast.success(`Mesa ${pad(choice.table.number)} unida à Mesa ${pad(tableNumber)}`);
        onMerged();
      }
      setChoice(null);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open && !choice} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mesa {pad(tableNumber)} · Comanda #{tab.number}</DialogTitle>
            <DialogDescription>Mude o cliente de mesa ou some a conta de outra mesa a esta.</DialogDescription>
          </DialogHeader>
          {!data ? <Skeleton className="h-40" /> : (
            <Tabs defaultValue="transfer">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="transfer"><ArrowRightLeft className="size-4" /> Transferir</TabsTrigger>
                <TabsTrigger value="merge"><Combine className="size-4" /> Juntar mesas</TabsTrigger>
              </TabsList>
              <TabsContent value="transfer" className="space-y-3">
                <p className="text-sm text-muted-foreground">Escolha a mesa <b>livre</b> para onde a comanda inteira vai. A Mesa {pad(tableNumber)} ficará livre.</p>
                {free.length === 0 ? <p className="text-sm">Nenhuma mesa livre no momento.</p> : (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                    {free.map((t) => (
                      <button key={t.id} onClick={() => setChoice({ kind: "transfer", table: t })}
                        className="rounded-xl border-2 border-emerald-200 bg-card py-3 text-center transition hover:border-emerald-500 dark:border-emerald-900">
                        <span className="tabular block text-xl font-bold">{pad(t.number)}</span>
                        <span className="text-[11px] text-muted-foreground">{t.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="merge" className="space-y-3">
                <p className="text-sm text-muted-foreground">Escolha a mesa <b>ocupada</b> cuja conta será somada a esta. Pedidos e pagamentos dela passam para a Mesa {pad(tableNumber)}, e ela fica livre.</p>
                {occupied.length === 0 ? <p className="text-sm">Nenhuma outra mesa ocupada.</p> : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {occupied.map(({ tab: t, table }) => (
                      <button key={t.id} onClick={() => setChoice({ kind: "merge", table, tab: t, total: data.totals.get(t.id) ?? 0 })}
                        className="rounded-xl border-2 border-amber-300 bg-amber-50 py-3 text-center transition hover:border-amber-500 dark:border-amber-800 dark:bg-amber-950/30">
                        <span className="tabular block text-xl font-bold">{pad(table.number)}</span>
                        <span className="tabular text-xs text-muted-foreground">{money(data.totals.get(t.id) ?? 0)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!choice} onOpenChange={(o) => !o && setChoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{choice?.kind === "transfer" ? "Confirmar transferência" : "Confirmar junção de mesas"}</DialogTitle>
            <DialogDescription>
              {choice?.kind === "transfer"
                ? `A comanda #${tab.number} (pedidos, chamados e celulares conectados) vai da Mesa ${pad(tableNumber)} para a Mesa ${pad(choice.table.number)}. A Mesa ${pad(tableNumber)} ficará livre.`
                : choice && `A conta da Mesa ${pad(choice.table.number)} (${money(choice.total)}, comanda #${choice.tab.number}) será somada à Mesa ${pad(tableNumber)}. Pagamentos já feitos são mantidos e os clientes da Mesa ${pad(choice.table.number)} continuam pedindo na conta unida. A Mesa ${pad(choice.table.number)} ficará livre.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChoice(null)}>Voltar</Button>
            <Button onClick={confirm} disabled={busy} className={cn(choice?.kind === "merge" && "bg-amber-600 hover:bg-amber-600/90")}>
              {busy && <Spinner />} {choice?.kind === "transfer" ? "Transferir" : "Juntar mesas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
