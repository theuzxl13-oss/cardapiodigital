"use client";

import Link from "next/link";
import { AlertTriangle, BellRing, ChefHat, CircleDollarSign, Clock, Receipt, ShoppingBag, Table2, TrendingUp, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { HBarList, RevenueChart, StatTile } from "./charts";
import { useLiveQuery } from "@/hooks/use-live-query";
import { check, rpc, sb } from "@/lib/api";
import { money } from "@/lib/format";
import { PAYMENT_LABEL } from "@/lib/labels";
import type { Ingredient, PaymentMethod } from "@/lib/types";

export interface ReportSummary {
  revenue: number; payments_count: number; orders_count: number; orders_cancelled: number; cancelled_value: number;
  tabs_closed: number; avg_ticket: number; service_fee_total: number; discount_total: number; includes_demo_data: boolean;
  by_method: { method: PaymentMethod; total: number; count: number }[];
  daily: { day: string; revenue: number; payments: number }[];
  hourly: { hour: number; orders: number }[];
  top_products: { product_id: string; name: string; quantity: number; revenue: number }[];
  by_category: { category: string; quantity: number; revenue: number }[];
  by_operator: { operator: string; total: number; count: number }[];
  by_waiter: { waiter: string; orders: number; total: number }[];
  by_source: { source: "customer" | "waiter"; orders: number; total: number }[];
  avg_prep_minutes: number; avg_wait_minutes: number;
}

interface Live {
  tables_total: number; tables_occupied: number; tabs_closing: number; orders_received: number; orders_preparing: number;
  orders_ready: number; orders_delivered_today: number; revenue_today: number; open_balance: number; low_stock: number; open_requests: number;
}

async function loadDashboard() {
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const last30 = new Date(dayStart); last30.setDate(last30.getDate() - 29);
  const tomorrow = new Date(dayStart); tomorrow.setDate(tomorrow.getDate() + 1);
  const [live, today, month, trend, low] = await Promise.all([
    rpc<Live>("dashboard_live"),
    rpc<ReportSummary>("report_summary", { p_from: dayStart.toISOString(), p_to: tomorrow.toISOString(), p_include_demo: true }),
    rpc<ReportSummary>("report_summary", { p_from: monthStart.toISOString(), p_to: tomorrow.toISOString(), p_include_demo: true }),
    rpc<ReportSummary>("report_summary", { p_from: last30.toISOString(), p_to: tomorrow.toISOString(), p_include_demo: true }),
    sb().from("ingredients").select("*").eq("active", true).order("name"),
  ]);
  const ingredients = (check(low) as Ingredient[]).filter((i) => Number(i.current_qty) <= Number(i.min_qty));
  return { live, today, month, trend, lowStock: ingredients };
}

export function AdminDashboard() {
  const { data, connected } = useLiveQuery("admin-dashboard", loadDashboard, ["orders", "payments", "tabs", "ingredients"], { intervalMs: 30000 });
  if (!data) return <div className="grid gap-4 p-5 md:grid-cols-4 md:p-8">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  const { live, today, month, trend, lowStock } = data;
  const demo = month.includes_demo_data;

  return (
    <main className="space-y-6 p-5 md:p-8">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`size-2 rounded-full ${connected ? "bg-emerald-500" : "bg-rose-500"}`} />
        <span className="text-muted-foreground">{connected ? "Atualização em tempo real" : "Reconectando…"}</span>
        {demo && <Badge variant="warning" className="ml-auto">Inclui dados fictícios de demonstração</Badge>}
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Faturamento hoje" value={money(live.revenue_today)} hint={`${today.payments_count} pagamentos`} icon={<CircleDollarSign />} />
        <StatTile label="Faturamento do mês" value={money(month.revenue)} hint={`${month.tabs_closed} comandas encerradas`} icon={<TrendingUp />} />
        <StatTile label="Ticket médio (mês)" value={money(month.avg_ticket)} hint={`Hoje: ${money(today.avg_ticket)}`} icon={<Receipt />} />
        <StatTile label="Pedidos hoje" value={String(today.orders_count)} hint={`${today.orders_cancelled} cancelados`} icon={<ShoppingBag />} />
        <StatTile label="Mesas ocupadas" value={`${live.tables_occupied}/${live.tables_total}`} hint={`${live.tabs_closing} aguardando fechamento`} icon={<Table2 />} />
        <StatTile label="Em preparação" value={String(live.orders_preparing)} hint={`${live.orders_received} na fila · ${live.orders_ready} prontos`} icon={<ChefHat />} />
        <StatTile label="Concluídos hoje" value={String(live.orders_delivered_today)} hint={`Preparo médio: ${today.avg_prep_minutes || month.avg_prep_minutes} min`} icon={<Utensils />} />
        <StatTile label="Em aberto nas mesas" value={money(live.open_balance)} hint={`${live.open_requests} chamados abertos`} icon={<BellRing />} />
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Faturamento diário — últimos 30 dias</CardTitle>
            <CardDescription>Total {money(trend.revenue)} · {trend.tabs_closed} comandas · ticket médio {money(trend.avg_ticket)}</CardDescription>
          </CardHeader>
          <CardContent><RevenueChart data={trend.daily} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Formas de pagamento (mês)</CardTitle></CardHeader>
          <CardContent><HBarList rows={month.by_method.map((m) => ({ label: `${PAYMENT_LABEL[m.method]} (${m.count})`, value: Number(m.total) }))} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle className="text-base">Produtos mais vendidos (mês)</CardTitle></CardHeader>
          <CardContent><HBarList rows={month.top_products.slice(0, 10).map((p) => ({ label: p.name, value: Number(p.quantity) }))} format={(v) => `${v} un.`} /></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="size-4 text-amber-600" /> Estoque mínimo</CardTitle>
            <Link href="/admin/estoque" className="text-sm text-primary hover:underline">Ver estoque</Link>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {lowStock.length === 0 && <p className="text-muted-foreground">Nenhum insumo abaixo do mínimo.</p>}
            {lowStock.slice(0, 8).map((i) => (
              <div key={i.id} className="flex justify-between rounded-md bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
                <span>{i.name}</span><span className="tabular font-medium">{Number(i.current_qty)} {i.unit} <span className="text-muted-foreground">/ mín. {Number(i.min_qty)}</span></span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Vendas por categoria (mês)</CardTitle></CardHeader>
          <CardContent><HBarList rows={month.by_category.map((c) => ({ label: c.category, value: Number(c.revenue) }))} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Origem dos pedidos (mês)</CardTitle></CardHeader>
          <CardContent><HBarList rows={month.by_source.map((s) => ({ label: s.source === "customer" ? `QR Code (${s.orders})` : `Garçom (${s.orders})`, value: Number(s.total) }))} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock className="size-4" /> Tempos médios (mês)</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Preparo (início → pronto)</span><span className="tabular font-semibold">{month.avg_prep_minutes} min</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Espera total (pedido → pronto)</span><span className="tabular font-semibold">{month.avg_wait_minutes} min</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Descontos concedidos</span><span className="tabular font-semibold">{money(month.discount_total)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Taxa de serviço</span><span className="tabular font-semibold">{money(month.service_fee_total)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cancelamentos</span><span className="tabular font-semibold">{month.orders_cancelled} ({money(month.cancelled_value)})</span></div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
