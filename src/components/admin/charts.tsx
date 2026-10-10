"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/format";

/** Paleta de dados (instância de referência validada; ver skill de visualização). Série única = uma cor. */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];

const axis = { stroke: "var(--muted-foreground)", fontSize: 12, tickLine: false, axisLine: false };

function TooltipBox({ active, payload, label, format }: { active?: boolean; payload?: { value: number; name?: string }[]; label?: string; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-md">
      <p className="text-muted-foreground">{label}</p>
      <p className="tabular font-semibold text-foreground">{format(Number(payload[0].value))}</p>
    </div>
  );
}

/** Série temporal de faturamento (colunas, um único eixo). */
export function RevenueChart({ data }: { data: { day: string; revenue: number }[] }) {
  const rows = data.map((d) => ({ label: d.day.slice(8, 10) + "/" + d.day.slice(5, 7), revenue: Number(d.revenue) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={16} />
        <YAxis {...axis} width={64} tickFormatter={(v) => `R$ ${Math.round(v / 100) / 10}k`} />
        <Tooltip cursor={{ fill: "var(--muted)" }} content={<TooltipBox format={money} />} />
        <Bar dataKey="revenue" name="Faturamento" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Ranking/composição por categoria: barras horizontais com rótulo direto. */
export function HBarList({ rows, format = money }: { rows: { label: string; value: number }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm" title={`${r.label}: ${format(r.value)}`}>
          <span className="truncate">{r.label}</span>
          <span className="tabular text-muted-foreground">{format(r.value)}</span>
          <div className="col-span-2 h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full transition-[width] group-hover:opacity-80" style={{ width: `${(r.value / max) * 100}%`, background: SERIES[0] }} />
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Sem dados no período.</p>}
    </div>
  );
}

export function StatTile({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm text-muted-foreground">{label}<span className="[&_svg]:size-4">{icon}</span></div>
      <p className="tabular mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
