"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Skeleton, Table, Td, Th } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { useLiveQuery } from "@/hooks/use-live-query";
import { check, sb } from "@/lib/api";
import { RESTAURANT_ID } from "@/lib/config";
import { dateTime, elapsedLabel, pad } from "@/lib/format";
import { TAB_STATUS_LABEL } from "@/lib/labels";
import type { DiningTable, Tab } from "@/lib/types";

async function load() {
  const [tables, tabs, history] = await Promise.all([
    sb().from("dining_tables").select("*").order("number"),
    sb().from("tabs").select("*").in("status", ["open", "closing"]),
    sb().from("tabs").select("*").in("status", ["closed", "cancelled"]).order("closed_at", { ascending: false }).limit(30),
  ]);
  return { tables: check(tables) as DiningTable[], tabs: check(tabs) as Tab[], history: check(history) as Tab[] };
}

export function TablesAdmin() {
  const { data, reload } = useLiveQuery("admin-tables", load, ["dining_tables", "tabs"]);
  const [editing, setEditing] = useState<DiningTable | "new" | null>(null);
  if (!data) return <div className="p-8"><Skeleton className="h-96" /></div>;
  const tabOf = (id: string) => data.tabs.find((t) => t.table_id === id);
  const numberOf = (id: string) => data.tables.find((t) => t.id === id)?.number ?? 0;

  return (
    <main className="space-y-6 p-5 md:p-8">
      <div className="flex items-center gap-2">
        <Badge variant="success">{data.tables.filter((t) => t.active).length - data.tabs.length} livres</Badge>
        <Badge variant="warning">{data.tabs.length} ocupadas</Badge>
        <Button className="ml-auto" onClick={() => setEditing("new")}><Plus /> Nova mesa</Button>
      </div>
      <Card>
        <Table>
          <thead><tr><Th>Mesa</Th><Th>Área</Th><Th>Lugares</Th><Th>Situação</Th><Th>Ativa</Th><Th /></tr></thead>
          <tbody>
            {data.tables.map((t) => {
              const tab = tabOf(t.id);
              return (
                <tr key={t.id}>
                  <Td className="text-lg font-bold">{pad(t.number)}</Td>
                  <Td>{t.label}</Td>
                  <Td>{t.seats}</Td>
                  <Td>{tab ? <Link className="text-primary hover:underline" href={`/caixa/comanda/${tab.id}`}>Comanda #{tab.number} · {TAB_STATUS_LABEL[tab.status]} · {elapsedLabel(tab.opened_at)}</Link> : <span className="text-emerald-700 dark:text-emerald-400">Livre</span>}</Td>
                  <Td><Switch checked={t.active} disabled={!!tab} onCheckedChange={async (v) => { const { error } = await sb().from("dining_tables").update({ active: v }).eq("id", t.id); if (error) toast.error(error.message); else reload(); }} /></Td>
                  <Td className="text-right"><Button size="icon-sm" variant="ghost" onClick={() => setEditing(t)}><Pencil /></Button></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <div>
        <h2 className="mb-2 font-semibold">Últimas comandas encerradas</h2>
        <Card>
          <Table>
            <thead><tr><Th>Comanda</Th><Th>Mesa</Th><Th>Abertura</Th><Th>Encerramento</Th><Th>Situação</Th><Th /></tr></thead>
            <tbody>
              {data.history.map((t) => (
                <tr key={t.id}>
                  <Td>#{t.number}{t.is_demo && <Badge variant="secondary" className="ml-2">demo</Badge>}</Td>
                  <Td>{pad(numberOf(t.table_id))}</Td>
                  <Td>{dateTime(t.opened_at)}</Td>
                  <Td>{dateTime(t.closed_at)}</Td>
                  <Td>{TAB_STATUS_LABEL[t.status]}{t.forced_close_reason ? ` · ${t.forced_close_reason}` : ""}</Td>
                  <Td className="text-right"><Button asChild size="sm" variant="ghost"><Link href={`/caixa/comanda/${t.id}`}>Detalhes</Link></Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      {editing && <TableDialog table={editing === "new" ? null : editing} nextNumber={Math.max(0, ...data.tables.map((t) => t.number)) + 1} onClose={() => setEditing(null)} onSaved={reload} />}
    </main>
  );
}

function TableDialog({ table, nextNumber, onClose, onSaved }: { table: DiningTable | null; nextNumber: number; onClose: () => void; onSaved: () => void }) {
  const [number, setNumber] = useState(String(table?.number ?? nextNumber));
  const [label, setLabel] = useState(table?.label ?? "Salão");
  const [seats, setSeats] = useState(String(table?.seats ?? 4));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const payload = { number: Number(number), label, seats: Number(seats) };
          const { error } = table ? await sb().from("dining_tables").update(payload).eq("id", table.id) : await sb().from("dining_tables").insert({ ...payload, restaurant_id: RESTAURANT_ID });
          if (error) return toast.error(error.message.includes("duplicate") ? "Já existe uma mesa com este número" : error.message);
          toast.success(table ? "Mesa atualizada" : "Mesa criada — gere o QR Code em QR Codes"); onSaved(); onClose();
        }}>
          <DialogHeader><DialogTitle>{table ? `Editar Mesa ${pad(table.number)}` : "Nova mesa"}</DialogTitle></DialogHeader>
          <Field label="Número"><Input type="number" min={1} required value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
          <Field label="Área / identificação"><Input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
          <Field label="Lugares"><Input type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
