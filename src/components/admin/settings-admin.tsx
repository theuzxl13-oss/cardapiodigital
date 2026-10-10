"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Skeleton, Spinner } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { sb } from "@/lib/api";
import { parseMoney } from "@/lib/format";
import type { Restaurant } from "@/lib/types";

export function SettingsAdmin() {
  const [r, setR] = useState<Restaurant | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { sb().from("restaurants").select("*").single().then(({ data }) => setR(data as Restaurant)); }, []);
  if (!r) return <div className="p-8"><Skeleton className="h-96" /></div>;
  const set = <K extends keyof Restaurant>(k: K, v: Restaurant[K]) => setR({ ...r, [k]: v });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await sb().from("restaurants").update({
      name: r!.name, tagline: r!.tagline, address: r!.address, phone: r!.phone, logo_url: r!.logo_url, cover_url: r!.cover_url,
      service_fee_pct: r!.service_fee_pct, max_discount_pct: r!.max_discount_pct, allow_customer_open_tab: r!.allow_customer_open_tab,
      customer_session_hours: r!.customer_session_hours, kitchen_sound_enabled: r!.kitchen_sound_enabled,
      kitchen_late_minutes: r!.kitchen_late_minutes, receipt_footer: r!.receipt_footer,
    }).eq("id", r!.id);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Configurações salvas");
  }

  return (
    <form onSubmit={save} className="grid max-w-4xl gap-5 p-5 md:p-8">
      <Card>
        <CardHeader><CardTitle className="text-base">Identidade</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome"><Input required value={r.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Slogan"><Input value={r.tagline ?? ""} onChange={(e) => set("tagline", e.target.value)} /></Field>
          <Field label="Endereço"><Input value={r.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label="Telefone"><Input value={r.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="URL da logo"><Input value={r.logo_url ?? ""} onChange={(e) => set("logo_url", e.target.value)} /></Field>
          <Field label="URL da capa do cardápio"><Input value={r.cover_url ?? ""} onChange={(e) => set("cover_url", e.target.value)} /></Field>
          <Field label="Rodapé do comprovante" className="sm:col-span-2"><Textarea value={r.receipt_footer ?? ""} onChange={(e) => set("receipt_footer", e.target.value)} /></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Financeiro</CardTitle><CardDescription>Alterações valem para novas comandas (taxa) e novos descontos.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Taxa de serviço (%)"><Input inputMode="decimal" value={String(r.service_fee_pct)} onChange={(e) => set("service_fee_pct", parseMoney(e.target.value) || 0)} /></Field>
          <Field label="Desconto máximo sem autorização (%)"><Input inputMode="decimal" value={String(r.max_discount_pct)} onChange={(e) => set("max_discount_pct", parseMoney(e.target.value) || 0)} /></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Operação</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-start gap-3 text-sm sm:col-span-2">
            <Switch checked={r.allow_customer_open_tab} onCheckedChange={(v) => set("allow_customer_open_tab", v)} />
            <span><b>Cliente pode abrir a mesa pelo QR Code.</b><br /><span className="text-muted-foreground">Desative para exigir que o garçom abra a mesa antes (reduz pedidos de quem fotografou o QR fora do restaurante).</span></span>
          </label>
          <Field label="Validade da sessão do cliente (horas)"><Input type="number" min={1} max={48} value={r.customer_session_hours} onChange={(e) => set("customer_session_hours", Number(e.target.value))} /></Field>
          <Field label="Pedido atrasado na cozinha após (min)"><Input type="number" min={1} value={r.kitchen_late_minutes} onChange={(e) => set("kitchen_late_minutes", Number(e.target.value))} /></Field>
          <label className="flex items-center gap-3 text-sm"><Switch checked={r.kitchen_sound_enabled} onCheckedChange={(v) => set("kitchen_sound_enabled", v)} /> Alerta sonoro padrão na cozinha</label>
        </CardContent>
      </Card>
      <div><Button type="submit" size="lg" disabled={saving}>{saving && <Spinner />} Salvar configurações</Button></div>
    </form>
  );
}
