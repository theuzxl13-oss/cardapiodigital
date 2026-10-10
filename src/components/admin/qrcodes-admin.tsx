"use client";

import { useEffect, useState } from "react";
import { Download, FileDown, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton, Spinner } from "@/components/ui/misc";
import { useLiveQuery } from "@/hooks/use-live-query";
import { check, rpc, sb } from "@/lib/api";
import { downloadDataUrl, tableCard } from "@/lib/qr";
import { pad } from "@/lib/format";
import type { DiningTable } from "@/lib/types";

async function loadTables() {
  const [tables, rest] = await Promise.all([
    sb().from("dining_tables").select("*").order("number"),
    sb().from("restaurants").select("name").single(),
  ]);
  return { tables: check(tables) as DiningTable[], name: (check(rest) as { name: string }).name };
}

export function QrCodesAdmin({ siteUrl }: { siteUrl: string }) {
  const { data, reload } = useLiveQuery("admin-qr", loadTables, ["dining_tables"]);
  const [cards, setCards] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const urlFor = (t: DiningTable) => `${siteUrl}/menu?mesa=${pad(t.number)}&k=${t.qr_token}`;

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      const out: Record<string, string> = {};
      for (const t of data.tables.filter((x) => x.active)) out[t.id] = await tableCard(urlFor(t), t.number, data.name);
      if (!cancelled) setCards(out);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!data) return <div className="p-8"><Skeleton className="h-96" /></div>;
  const active = data.tables.filter((t) => t.active);
  const chosen = active.filter((t) => selected.size === 0 || selected.has(t.id));

  async function pdf() {
    setBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      // 4 cartões por página (A4 retrato, 2x2), 85 x 117 mm cada
      chosen.forEach((t, i) => {
        if (i > 0 && i % 4 === 0) doc.addPage();
        const slot = i % 4;
        const x = 15 + (slot % 2) * 95, y = 20 + Math.floor(slot / 2) * 135;
        doc.addImage(cards[t.id], "PNG", x, y, 85, 117);
        doc.setDrawColor(200); doc.setLineDashPattern([1, 1], 0); doc.rect(x - 2, y - 2, 89, 121);
      });
      doc.save(`qrcodes-mesas-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(t: DiningTable) {
    if (!confirm(`Gerar novo QR Code para a Mesa ${pad(t.number)}? O código impresso atual deixará de funcionar.`)) return;
    try { await rpc("regenerate_table_qr", { p_table_id: t.id }); toast.success("Novo QR Code gerado"); reload(); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <main className="space-y-5 p-5 md:p-8">
      <div className="no-print flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {selected.size === 0 ? "Todas as mesas ativas" : `${selected.size} selecionada(s)`} · Endereço base: <code className="rounded bg-muted px-1">{siteUrl}</code>
        </p>
        <div className="ml-auto flex gap-2">
          {selected.size > 0 && <Button variant="ghost" onClick={() => setSelected(new Set())}>Limpar seleção</Button>}
          <Button variant="outline" onClick={() => window.print()}><Printer /> Imprimir</Button>
          <Button onClick={pdf} disabled={busy || Object.keys(cards).length === 0}>{busy ? <Spinner /> : <FileDown />} Baixar PDF</Button>
        </div>
      </div>
      <p className="no-print rounded-lg border bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        Cada QR Code contém um token secreto e permanece vinculado à mesa entre comandas. Defina NEXT_PUBLIC_SITE_URL com o domínio público antes de imprimir.
      </p>
      <div className="print-area grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5 print:grid-cols-2">
        {chosen.map((t) => (
          <Card key={t.id} className={selected.has(t.id) ? "ring-2 ring-primary" : ""}>
            <CardContent className="space-y-2 p-3">
              <label className="no-print flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={selected.has(t.id)} onChange={(e) => setSelected((p) => { const n = new Set(p); if (e.target.checked) n.add(t.id); else n.delete(t.id); return n; })} />
                Mesa {pad(t.number)}
              </label>
              {cards[t.id] ? <img src={cards[t.id]} alt={`QR Code da Mesa ${pad(t.number)}`} className="w-full rounded-md border" /> : <Skeleton className="aspect-[8/11]" />}
              <div className="no-print flex gap-1">
                <Button size="sm" variant="outline" className="flex-1" disabled={!cards[t.id]} onClick={() => downloadDataUrl(cards[t.id], `mesa-${pad(t.number)}.png`)}><Download /> PNG</Button>
                <Button size="icon-sm" variant="ghost" title="Gerar novo código" onClick={() => regenerate(t)}><RefreshCw /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
