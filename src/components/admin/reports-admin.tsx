"use client";

import { useCallback, useEffect, useState } from "react";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Skeleton, Spinner, Table, Td, Th } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { HBarList, RevenueChart, StatTile } from "./charts";
import type { ReportSummary } from "./dashboard";
import { check, rpc, sb } from "@/lib/api";
import { dateTime, money } from "@/lib/format";
import { PAYMENT_LABEL } from "@/lib/labels";

interface CashRow { id: string; operator_id: string; opened_at: string; closed_at: string | null; opening_amount: number; expected_cash: number | null; counted_cash: number | null; difference: number | null; status: string; is_demo: boolean }
interface CancelRow { id: string; number: number; cancelled_at: string; cancel_reason: string | null; subtotal: number; cancelled_by: string | null; cancelled_by_customer: boolean; cancel_authorized_by: string | null }
interface StockRow { ingredient_id: string; type: string; quantity: number }

const PRESETS = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  month: "Mês atual",
  prev: "Mês anterior",
  "30d": "Últimos 30 dias",
  custom: "Personalizado",
} as const;

function range(preset: keyof typeof PRESETS, from: string, to: string): [Date, Date] {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const tomorrow = new Date(d0); tomorrow.setDate(d0.getDate() + 1);
  switch (preset) {
    case "today": return [d0, tomorrow];
    case "7d": { const s = new Date(d0); s.setDate(s.getDate() - 6); return [s, tomorrow]; }
    case "30d": { const s = new Date(d0); s.setDate(s.getDate() - 29); return [s, tomorrow]; }
    case "month": return [new Date(d0.getFullYear(), d0.getMonth(), 1), tomorrow];
    case "prev": return [new Date(d0.getFullYear(), d0.getMonth() - 1, 1), new Date(d0.getFullYear(), d0.getMonth(), 1)];
    default: { const e = new Date(`${to}T00:00:00`); e.setDate(e.getDate() + 1); return [new Date(`${from}T00:00:00`), e]; }
  }
}

export function ReportsAdmin() {
  const [preset, setPreset] = useState<keyof typeof PRESETS>("month");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [includeDemo, setIncludeDemo] = useState(true);
  const [data, setData] = useState<{
    summary: ReportSummary; cash: CashRow[]; cancels: CancelRow[]; stock: StockRow[];
    names: Record<string, string>; ingredients: Record<string, { name: string; unit: string }>; period: [Date, Date];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b] = range(preset, from, to);
      const [summary, cash, cancels, stock, profiles, ingredients] = await Promise.all([
        rpc<ReportSummary>("report_summary", { p_from: a.toISOString(), p_to: b.toISOString(), p_include_demo: includeDemo }),
        sb().from("cash_sessions").select("*").gte("opened_at", a.toISOString()).lt("opened_at", b.toISOString()).order("opened_at", { ascending: false }),
        sb().from("orders").select("id, number, cancelled_at, cancel_reason, subtotal, cancelled_by, cancelled_by_customer, cancel_authorized_by").eq("status", "cancelled").gte("created_at", a.toISOString()).lt("created_at", b.toISOString()).order("cancelled_at", { ascending: false }),
        sb().from("stock_movements").select("ingredient_id, type, quantity").gte("created_at", a.toISOString()).lt("created_at", b.toISOString()).limit(5000),
        sb().from("profiles").select("id, full_name"),
        sb().from("ingredients").select("id, name, unit"),
      ]);
      setData({
        summary,
        cash: (check(cash) as CashRow[]).filter((c) => includeDemo || !c.is_demo),
        cancels: check(cancels) as CancelRow[],
        stock: check(stock) as StockRow[],
        names: Object.fromEntries((check(profiles) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name])),
        ingredients: Object.fromEntries((check(ingredients) as { id: string; name: string; unit: string }[]).map((i) => [i.id, { name: i.name, unit: i.unit }])),
        period: [a, b],
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [preset, from, to, includeDemo]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;
  const periodLabel = data ? `${data.period[0].toLocaleDateString("pt-BR")} a ${new Date(data.period[1].getTime() - 1).toLocaleDateString("pt-BR")}` : "";
  const stockByIngredient = Object.entries((data?.stock ?? []).reduce<Record<string, { sale: number; purchase: number; loss: number }>>((m, r) => {
    const e = (m[r.ingredient_id] ??= { sale: 0, purchase: 0, loss: 0 });
    if (r.type === "sale" || r.type === "cancel_return") e.sale += -Number(r.quantity);
    else if (r.type === "purchase") e.purchase += Number(r.quantity);
    else if (r.type === "loss") e.loss += -Number(r.quantity);
    return m;
  }, {}));

  function sections() {
    if (!s || !data) return [];
    return [
      { title: "Resumo", head: ["Indicador", "Valor"], rows: [
        ["Faturamento", money(s.revenue)], ["Pagamentos", String(s.payments_count)], ["Comandas encerradas", String(s.tabs_closed)],
        ["Ticket médio", money(s.avg_ticket)], ["Pedidos", String(s.orders_count)], ["Pedidos cancelados", `${s.orders_cancelled} (${money(s.cancelled_value)})`],
        ["Taxa de serviço", money(s.service_fee_total)], ["Descontos", money(s.discount_total)], ["Preparo médio (min)", String(s.avg_prep_minutes)],
        ["Inclui dados de demonstração", s.includes_demo_data ? "Sim" : "Não"],
      ] },
      { title: "Faturamento diário", head: ["Dia", "Faturamento", "Pagamentos"], rows: s.daily.map((d) => [d.day.split("-").reverse().join("/"), money(d.revenue), String(d.payments)]) },
      { title: "Formas de pagamento", head: ["Forma", "Quantidade", "Total"], rows: s.by_method.map((m) => [PAYMENT_LABEL[m.method], String(m.count), money(m.total)]) },
      { title: "Produtos mais vendidos", head: ["Produto", "Quantidade", "Receita"], rows: s.top_products.map((p) => [p.name, String(p.quantity), money(p.revenue)]) },
      { title: "Vendas por categoria", head: ["Categoria", "Quantidade", "Receita"], rows: s.by_category.map((c) => [c.category, String(c.quantity), money(c.revenue)]) },
      { title: "Recebimentos por operador", head: ["Operador", "Pagamentos", "Total"], rows: s.by_operator.map((o) => [o.operator, String(o.count), money(o.total)]) },
      { title: "Pedidos lançados por garçom", head: ["Garçom", "Pedidos", "Total"], rows: s.by_waiter.map((w) => [w.waiter, String(w.orders), money(w.total)]) },
      { title: "Sessões de caixa", head: ["Operador", "Abertura", "Fechamento", "Esperado", "Contado", "Divergência"], rows: data.cash.map((c) => [
        data.names[c.operator_id] ?? "-", dateTime(c.opened_at), c.closed_at ? dateTime(c.closed_at) : "aberto",
        c.expected_cash != null ? money(c.expected_cash) : "-", c.counted_cash != null ? money(c.counted_cash) : "-", c.difference != null ? money(c.difference) : "-"]) },
      { title: "Cancelamentos", head: ["Pedido", "Data", "Valor", "Responsável", "Autorizado por", "Motivo"], rows: data.cancels.map((c) => [
        `#${c.number}`, dateTime(c.cancelled_at), money(c.subtotal), c.cancelled_by_customer ? "Cliente" : data.names[c.cancelled_by ?? ""] ?? "-",
        data.names[c.cancel_authorized_by ?? ""] ?? "-", c.cancel_reason ?? ""]) },
      { title: "Consumo de estoque", head: ["Insumo", "Consumo (vendas)", "Entradas", "Perdas"], rows: stockByIngredient.map(([id, v]) => {
        const ing = data.ingredients[id];
        return [ing?.name ?? id, `${v.sale.toLocaleString("pt-BR")} ${ing?.unit ?? ""}`, `${v.purchase.toLocaleString("pt-BR")} ${ing?.unit ?? ""}`, `${v.loss.toLocaleString("pt-BR")} ${ing?.unit ?? ""}`];
      }) },
    ];
  }

  async function exportPdf() {
    setExporting("pdf");
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const doc = new jsPDF();
      doc.setFontSize(16); doc.text("Relatório gerencial — Sabor & Arte Bistrô", 14, 18);
      doc.setFontSize(10); doc.text(`Período: ${periodLabel} · Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 25);
      if (s?.includes_demo_data) { doc.setTextColor(180, 80, 0); doc.text("ATENÇÃO: inclui dados fictícios de demonstração.", 14, 31); doc.setTextColor(0); }
      let y = 36;
      for (const sec of sections()) {
        autoTable(doc, { startY: y, head: [[sec.title, ...Array(sec.head.length - 1).fill("")]], body: [], theme: "plain", styles: { fontStyle: "bold", fontSize: 11 } });
        autoTable(doc, { startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY, head: [sec.head], body: sec.rows.length ? sec.rows : [["Sem dados", ...Array(sec.head.length - 1).fill("")]], styles: { fontSize: 8 }, headStyles: { fillColor: [181, 83, 45] } });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      }
      doc.save(`relatorio-${data!.period[0].toISOString().slice(0, 10)}.pdf`);
    } catch (e) { toast.error((e as Error).message); } finally { setExporting(null); }
  }

  async function exportExcel() {
    setExporting("xlsx");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Sabor & Arte — Sistema"; wb.created = new Date();
      for (const sec of sections()) {
        const ws = wb.addWorksheet(sec.title.slice(0, 31));
        ws.addRow([`${sec.title} — ${periodLabel}${s?.includes_demo_data ? " (inclui dados de demonstração)" : ""}`]).font = { bold: true, size: 13 };
        const head = ws.addRow(sec.head);
        head.font = { bold: true, color: { argb: "FFFFFFFF" } };
        head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB5532D" } }; });
        sec.rows.forEach((r) => ws.addRow(r));
        ws.columns.forEach((col) => { col.width = 22; });
      }
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a"); a.href = url; a.download = `relatorio-${data!.period[0].toISOString().slice(0, 10)}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error((e as Error).message); } finally { setExporting(null); }
  }

  return (
    <main className="space-y-5 p-5 md:p-8">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <label className="grid gap-1 text-sm">Período
            <Select className="w-48" value={preset} onChange={(e) => setPreset(e.target.value as keyof typeof PRESETS)}>
              {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </label>
          {preset === "custom" && (
            <>
              <label className="grid gap-1 text-sm">De<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="grid gap-1 text-sm">Até<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            </>
          )}
          <label className="flex items-center gap-2 pb-2 text-sm"><Switch checked={includeDemo} onCheckedChange={setIncludeDemo} /> Incluir dados de demonstração</label>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" disabled={!s || !!exporting} onClick={exportExcel}>{exporting === "xlsx" ? <Spinner /> : <FileSpreadsheet />} Excel</Button>
            <Button disabled={!s || !!exporting} onClick={exportPdf}>{exporting === "pdf" ? <Spinner /> : <FileDown />} PDF</Button>
          </div>
        </CardContent>
      </Card>

      {!s || loading ? <Skeleton className="h-96" /> : (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Período: {periodLabel}
            {s.includes_demo_data && <Badge variant="warning">Inclui dados fictícios de demonstração</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Faturamento" value={money(s.revenue)} hint={`${s.payments_count} pagamentos`} />
            <StatTile label="Ticket médio" value={money(s.avg_ticket)} hint={`${s.tabs_closed} comandas`} />
            <StatTile label="Pedidos" value={String(s.orders_count)} hint={`${s.orders_cancelled} cancelados · ${money(s.cancelled_value)}`} />
            <StatTile label="Descontos / serviço" value={money(s.discount_total)} hint={`Taxa de serviço: ${money(s.service_fee_total)}`} />
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Faturamento diário</CardTitle></CardHeader>
            <CardContent><RevenueChart data={s.daily} /></CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle className="text-base">Produtos mais vendidos (quantidade)</CardTitle></CardHeader>
              <CardContent><HBarList rows={s.top_products.map((p) => ({ label: p.name, value: Number(p.quantity) }))} format={(v) => `${v} un.`} /></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Formas de pagamento</CardTitle></CardHeader>
              <CardContent><HBarList rows={s.by_method.map((m) => ({ label: `${PAYMENT_LABEL[m.method]} (${m.count})`, value: Number(m.total) }))} /></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Recebimentos por operador de caixa</CardTitle></CardHeader>
              <CardContent><HBarList rows={s.by_operator.map((o) => ({ label: `${o.operator} (${o.count})`, value: Number(o.total) }))} /></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Pedidos por hora</CardTitle></CardHeader>
              <CardContent><HBarList rows={s.hourly.map((h) => ({ label: `${String(h.hour).padStart(2, "0")}h`, value: Number(h.orders) }))} format={(v) => `${v} pedidos`} /></CardContent></Card>
          </div>
          {sections().slice(7).map((sec) => (
            <Card key={sec.title}>
              <CardHeader><CardTitle className="text-base">{sec.title}</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <thead><tr>{sec.head.map((h) => <Th key={h}>{h}</Th>)}</tr></thead>
                  <tbody>
                    {sec.rows.slice(0, 50).map((r, i) => (
                      <tr key={i}>{r.map((c, j) => <Td key={j} className={sec.title === "Sessões de caixa" && j === 5 && c !== "-" && c !== money(0) ? "font-semibold text-rose-600" : ""}>{c}</Td>)}</tr>
                    ))}
                    {sec.rows.length === 0 && <tr><Td colSpan={sec.head.length} className="text-muted-foreground">Sem registros no período.</Td></tr>}
                  </tbody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </main>
  );
}
