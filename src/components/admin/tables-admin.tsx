"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Download, FileDown, ListPlus, Pencil, Plus, Printer, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Skeleton, Spinner, Table, Td, Th } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { useLiveQuery } from "@/hooks/use-live-query";
import { check, rpc, sb } from "@/lib/api";
import { RESTAURANT_ID } from "@/lib/config";
import { dateTime, elapsedLabel, pad } from "@/lib/format";
import { TAB_STATUS_LABEL } from "@/lib/labels";
import { downloadCardsPdf, downloadDataUrl, printCards, publicSiteUrl, tableCard, tableMenuUrl } from "@/lib/qr";
import type { DiningTable, Tab } from "@/lib/types";
import { routes } from "@/lib/routes";

async function load() {
  const [tables, tabs, history, rest] = await Promise.all([
    sb().from("dining_tables").select("*").order("number"),
    sb().from("tabs").select("*").in("status", ["open", "closing"]),
    sb().from("tabs").select("*").in("status", ["closed", "cancelled"]).order("closed_at", { ascending: false }).limit(30),
    sb().from("restaurants").select("name").eq("id", RESTAURANT_ID).single(),
  ]);
  return {
    tables: check(tables) as DiningTable[],
    tabs: check(tabs) as Tab[],
    history: check(history) as Tab[],
    restaurantName: (check(rest) as { name: string }).name,
  };
}

export function TablesAdmin() {
  const { data, reload } = useLiveQuery("admin-tables", load, ["dining_tables", "tabs"]);
  const [editing, setEditing] = useState<DiningTable | "new" | null>(null);
  const [batch, setBatch] = useState(false);
  /** Mesas cujo QR Code está aberto no diálogo (uma ou várias, ex.: recém-criadas). */
  const [qrFor, setQrFor] = useState<number[] | null>(null);
  if (!data) return <div className="p-8"><Skeleton className="h-96" /></div>;
  const tabOf = (id: string) => data.tabs.find((t) => t.table_id === id);
  const numberOf = (id: string) => data.tables.find((t) => t.id === id)?.number ?? 0;
  const nextNumber = Math.max(0, ...data.tables.map((t) => t.number)) + 1;

  return (
    <main className="space-y-6 p-5 md:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">{data.tables.filter((t) => t.active).length - data.tabs.length} livres</Badge>
        <Badge variant="warning">{data.tabs.length} ocupadas</Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setQrFor(data.tables.filter((t) => t.active).map((t) => t.number))}><QrCode /> QR Codes de todas</Button>
          <Button variant="outline" onClick={() => setBatch(true)}><ListPlus /> Adicionar várias</Button>
          <Button onClick={() => setEditing("new")}><Plus /> Nova mesa</Button>
        </div>
      </div>
      <Card>
        <Table>
          <thead><tr><Th>Mesa</Th><Th>Área</Th><Th>Lugares</Th><Th>Situação</Th><Th>QR Code</Th><Th>Ativa</Th><Th /></tr></thead>
          <tbody>
            {data.tables.map((t) => {
              const tab = tabOf(t.id);
              return (
                <tr key={t.id}>
                  <Td className="text-lg font-bold">{pad(t.number)}</Td>
                  <Td>{t.label}</Td>
                  <Td>{t.seats}</Td>
                  <Td>{tab ? <Link className="text-primary hover:underline" href={routes.checkout(tab.id)}>Comanda #{tab.number} · {TAB_STATUS_LABEL[tab.status]} · {elapsedLabel(tab.opened_at)}</Link> : <span className="text-emerald-700 dark:text-emerald-400">Livre</span>}</Td>
                  <Td><Button size="sm" variant="outline" disabled={!t.active} onClick={() => setQrFor([t.number])}><QrCode /> Ver QR Code</Button></Td>
                  <Td><Switch checked={t.active} disabled={!!tab} onCheckedChange={async (v) => { const { error } = await sb().from("dining_tables").update({ active: v }).eq("id", t.id); if (error) toast.error(error.message); else reload(); }} /></Td>
                  <Td className="text-right"><Button size="icon-sm" variant="ghost" onClick={() => setEditing(t)} aria-label="Editar"><Pencil /></Button></Td>
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
                  <Td className="text-right"><Button asChild size="sm" variant="ghost"><Link href={routes.checkout(t.id)}>Detalhes</Link></Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      {editing && (
        <TableDialog table={editing === "new" ? null : editing} nextNumber={nextNumber} onClose={() => setEditing(null)}
          onSaved={(created) => { reload(); if (created) setQrFor([created]); }} />
      )}
      {batch && <BatchDialog nextNumber={nextNumber} existing={data.tables.map((t) => t.number)} onClose={() => setBatch(false)}
        onSaved={(numbers) => { reload(); setQrFor(numbers); }} />}
      {qrFor && (
        <QrDialog
          tables={data.tables.filter((t) => qrFor.includes(t.number))}
          restaurantName={data.restaurantName}
          onClose={() => setQrFor(null)}
          onRegenerated={reload}
        />
      )}
    </main>
  );
}

/** Cartões de QR Code das mesas informadas: visualizar, baixar PNG/PDF, imprimir e gerar novo código. */
function QrDialog({ tables, restaurantName, onClose, onRegenerated }: {
  tables: DiningTable[]; restaurantName: string; onClose: () => void; onRegenerated: () => void;
}) {
  const [cards, setCards] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const tokens = tables.map((t) => t.qr_token).join(",");

  useEffect(() => {
    let cancelled = false;
    const site = publicSiteUrl();
    (async () => {
      const out: Record<string, string> = {};
      for (const t of tables) out[t.id] = await tableCard(tableMenuUrl(site, t.number, t.qr_token), t.number, restaurantName);
      if (!cancelled) setCards(out);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, restaurantName]);

  const ready = tables.length > 0 && tables.every((t) => cards[t.id]);
  const list = () => tables.map((t) => ({ number: t.number, dataUrl: cards[t.id] }));
  const single = tables.length === 1;

  async function regenerate(t: DiningTable) {
    if (!confirm(`Gerar um novo QR Code para a Mesa ${pad(t.number)}?\n\nO código impresso atual deixará de funcionar e precisará ser substituído na mesa. Clientes conectados pelo código antigo precisarão escanear o novo.`)) return;
    setBusy(t.id);
    try {
      await rpc("regenerate_table_qr", { p_table_id: t.id });
      toast.success(`Novo QR Code gerado para a Mesa ${pad(t.number)}. Imprima e substitua o anterior.`);
      onRegenerated();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={single ? "max-w-md" : "max-w-4xl"}>
        <DialogHeader>
          <DialogTitle>{single ? `QR Code · Mesa ${pad(tables[0].number)}` : `QR Codes · ${tables.length} mesas`}</DialogTitle>
          <DialogDescription>
            Cada código contém um token secreto da mesa e continua válido entre as comandas. Imprima e coloque na mesa correspondente.
          </DialogDescription>
        </DialogHeader>

        <div className={single ? "" : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"}>
          {tables.map((t) => (
            <div key={t.id} className="space-y-2">
              {cards[t.id] ? <Image src={cards[t.id]} alt={`QR Code da Mesa ${pad(t.number)}`} width={800} height={1100} unoptimized className="h-auto w-full rounded-lg border" /> : <Skeleton className="aspect-[8/11] w-full" />}
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="flex-1" disabled={!cards[t.id]} onClick={() => downloadDataUrl(cards[t.id], `mesa-${pad(t.number)}.png`)}>
                  <Download /> PNG
                </Button>
                <Button size="sm" variant="ghost" title="Gerar novo QR Code" disabled={busy === t.id} onClick={() => regenerate(t)}>
                  {busy === t.id ? <Spinner /> : <RefreshCw />} {single && "Gerar novo"}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button variant="outline" disabled={!ready} onClick={() => !printCards(list()) && toast.error("Permita janelas pop-up para imprimir.")}>
            <Printer /> Imprimir
          </Button>
          <Button disabled={!ready} onClick={() => downloadCardsPdf(list(), single ? `mesa-${pad(tables[0].number)}.pdf` : `qrcodes-mesas.pdf`)}>
            <FileDown /> Baixar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TableDialog({ table, nextNumber, onClose, onSaved }: {
  table: DiningTable | null; nextNumber: number; onClose: () => void; onSaved: (createdNumber: number | null) => void;
}) {
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
          toast.success(table ? "Mesa atualizada" : `Mesa ${pad(payload.number)} criada com QR Code próprio`);
          onSaved(table ? null : payload.number);
          onClose();
        }}>
          <DialogHeader>
            <DialogTitle>{table ? `Editar Mesa ${pad(table.number)}` : "Nova mesa"}</DialogTitle>
            {!table && <DialogDescription>O QR Code da mesa é gerado automaticamente ao salvar.</DialogDescription>}
          </DialogHeader>
          <Field label="Número"><Input type="number" min={1} required value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
          <Field label="Área / identificação"><Input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
          <Field label="Lugares"><Input type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit">{table ? "Salvar" : "Criar mesa e gerar QR Code"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Cria várias mesas em sequência (cada uma com seu QR Code). */
function BatchDialog({ nextNumber, existing, onClose, onSaved }: {
  nextNumber: number; existing: number[]; onClose: () => void; onSaved: (numbers: number[]) => void;
}) {
  const [start, setStart] = useState(String(nextNumber));
  const [count, setCount] = useState("5");
  const [label, setLabel] = useState("Salão");
  const [seats, setSeats] = useState("4");
  const [busy, setBusy] = useState(false);
  const first = Number(start) || 0;
  const qty = Math.min(50, Math.max(0, Number(count) || 0));
  const numbers = Array.from({ length: qty }, (_, i) => first + i);
  const clash = numbers.filter((n) => existing.includes(n));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          if (clash.length) return toast.error(`Já existem as mesas ${clash.map(pad).join(", ")}`);
          if (!qty || first < 1) return toast.error("Informe número inicial e quantidade");
          setBusy(true);
          const { error } = await sb().from("dining_tables").insert(numbers.map((n) => ({ restaurant_id: RESTAURANT_ID, number: n, label, seats: Number(seats) || 4 })));
          setBusy(false);
          if (error) return toast.error(error.message);
          toast.success(`${qty} mesas criadas (${pad(numbers[0])} a ${pad(numbers[numbers.length - 1])}), cada uma com seu QR Code`);
          onSaved(numbers);
          onClose();
        }}>
          <DialogHeader>
            <DialogTitle>Adicionar várias mesas</DialogTitle>
            <DialogDescription>Cada mesa recebe um QR Code exclusivo. Ao final, você pode imprimir ou baixar todos em PDF.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Começar no número"><Input type="number" min={1} required value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Quantidade (até 50)"><Input type="number" min={1} max={50} required value={count} onChange={(e) => setCount(e.target.value)} /></Field>
            <Field label="Área / identificação"><Input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
            <Field label="Lugares por mesa"><Input type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} /></Field>
          </div>
          {qty > 0 && (
            <p className={clash.length ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {clash.length ? `Conflito: já existem as mesas ${clash.map(pad).join(", ")}.` : `Serão criadas as mesas ${pad(numbers[0])} a ${pad(numbers[numbers.length - 1])}.`}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={busy || clash.length > 0}>{busy && <Spinner />} Criar mesas e QR Codes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
