"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDownUp, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Skeleton, Spinner, Table, Td, Th } from "@/components/ui/misc";
import { useLiveQuery } from "@/hooks/use-live-query";
import { check, rpc, sb } from "@/lib/api";
import { RESTAURANT_ID } from "@/lib/config";
import { dateTime, money, parseMoney } from "@/lib/format";
import type { Ingredient } from "@/lib/types";

interface Movement { id: string; ingredient_id: string; type: string; quantity: number; reason: string | null; created_at: string; order_id: string | null }
const TYPE_LABEL: Record<string, string> = { purchase: "Entrada", sale: "Venda", cancel_return: "Devolução (cancelamento)", adjustment: "Ajuste", loss: "Perda" };

async function load() {
  const [ingredients, movements] = await Promise.all([
    sb().from("ingredients").select("*").order("name"),
    sb().from("stock_movements").select("*").order("created_at", { ascending: false }).limit(150),
  ]);
  return { ingredients: check(ingredients) as Ingredient[], movements: check(movements) as Movement[] };
}

export function StockAdmin() {
  const { data, reload } = useLiveQuery("admin-stock", load, ["ingredients"]);
  const [q, setQ] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [moving, setMoving] = useState<Ingredient | null>(null);
  const [editing, setEditing] = useState<Ingredient | "new" | null>(null);

  const list = useMemo(() => (data?.ingredients ?? []).filter((i) =>
    i.name.toLowerCase().includes(q.toLowerCase()) && (!onlyLow || Number(i.current_qty) <= Number(i.min_qty))), [data, q, onlyLow]);
  if (!data) return <div className="p-8"><Skeleton className="h-96" /></div>;
  const low = data.ingredients.filter((i) => i.active && Number(i.current_qty) <= Number(i.min_qty));
  const value = data.ingredients.reduce((s, i) => s + Math.max(0, Number(i.current_qty)) * Number(i.cost_per_unit), 0);
  const nameOf = (id: string) => data.ingredients.find((i) => i.id === id);

  return (
    <main className="space-y-5 p-5 md:p-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Insumos cadastrados</p><p className="text-2xl font-semibold">{data.ingredients.length}</p></CardContent></Card>
        <Card className={low.length ? "border-amber-400" : ""}><CardContent className="p-4"><p className="flex items-center gap-1.5 text-sm text-muted-foreground"><AlertTriangle className="size-4 text-amber-600" /> Abaixo do mínimo</p><p className="text-2xl font-semibold">{low.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Valor estimado em estoque</p><p className="tabular text-2xl font-semibold">{money(value)}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar insumo" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant={onlyLow ? "default" : "outline"} onClick={() => setOnlyLow(!onlyLow)}><AlertTriangle /> Somente em alerta</Button>
        <Button onClick={() => setEditing("new")}><Plus /> Novo insumo</Button>
      </div>

      <Card>
        <Table>
          <thead><tr><Th>Insumo</Th><Th className="text-right">Atual</Th><Th className="text-right">Mínimo</Th><Th className="text-right">Custo unit.</Th><Th>Situação</Th><Th /></tr></thead>
          <tbody>
            {list.map((i) => {
              const isLow = Number(i.current_qty) <= Number(i.min_qty);
              return (
                <tr key={i.id} className={isLow ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}>
                  <Td className="font-medium">{i.name}{!i.active && <Badge variant="secondary" className="ml-2">inativo</Badge>}</Td>
                  <Td className="tabular text-right">{Number(i.current_qty).toLocaleString("pt-BR")} {i.unit}</Td>
                  <Td className="tabular text-right">{Number(i.min_qty).toLocaleString("pt-BR")} {i.unit}</Td>
                  <Td className="tabular text-right">{money(i.cost_per_unit)}</Td>
                  <Td>{isLow ? <Badge variant="warning"><AlertTriangle className="size-3" /> Repor</Badge> : <Badge variant="success">OK</Badge>}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="outline" onClick={() => setMoving(i)}><ArrowDownUp /> Movimentar</Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => setEditing(i)}><Pencil /></Button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Últimas movimentações</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <thead><tr><Th>Data</Th><Th>Insumo</Th><Th>Tipo</Th><Th className="text-right">Quantidade</Th><Th>Motivo</Th></tr></thead>
            <tbody>
              {data.movements.map((m) => (
                <tr key={m.id}>
                  <Td className="whitespace-nowrap">{dateTime(m.created_at)}</Td>
                  <Td>{nameOf(m.ingredient_id)?.name}</Td>
                  <Td>{TYPE_LABEL[m.type] ?? m.type}</Td>
                  <Td className={`tabular text-right ${Number(m.quantity) < 0 ? "text-rose-600" : "text-emerald-700"}`}>{Number(m.quantity) > 0 ? "+" : ""}{Number(m.quantity).toLocaleString("pt-BR")} {nameOf(m.ingredient_id)?.unit}</Td>
                  <Td className="text-muted-foreground">{m.reason}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      {moving && <MoveDialog ingredient={moving} onClose={() => setMoving(null)} onSaved={reload} />}
      {editing && <IngredientDialog ingredient={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </main>
  );
}

function MoveDialog({ ingredient, onClose, onSaved }: { ingredient: Ingredient; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<"purchase" | "adjustment" | "loss">("purchase");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault();
          const q = parseMoney(qty);
          if (Number.isNaN(q) || q === 0) return toast.error("Quantidade inválida");
          setBusy(true);
          try {
            await rpc("adjust_stock", { p_ingredient_id: ingredient.id, p_type: type, p_quantity: q, p_reason: reason || null, p_unit_cost: cost ? parseMoney(cost) : null });
            toast.success("Movimentação registrada"); onSaved(); onClose();
          } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
        }}>
          <DialogHeader><DialogTitle>Movimentar: {ingredient.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Saldo atual: {Number(ingredient.current_qty)} {ingredient.unit}</p>
          <Field label="Tipo">
            <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="purchase">Entrada (compra)</option>
              <option value="loss">Perda / desperdício</option>
              <option value="adjustment">Ajuste de inventário (+/-)</option>
            </Select>
          </Field>
          <Field label={`Quantidade (${ingredient.unit})`} hint={type === "adjustment" ? "Use valor negativo para reduzir." : undefined}>
            <Input required inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          {type === "purchase" && <Field label={`Custo por ${ingredient.unit} (opcional)`}><Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>}
          <Field label="Motivo / nota fiscal"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy && <Spinner />} Registrar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IngredientDialog({ ingredient, onClose, onSaved }: { ingredient: Ingredient | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: ingredient?.name ?? "", unit: ingredient?.unit ?? "g", min_qty: String(ingredient?.min_qty ?? 0), cost_per_unit: String(ingredient?.cost_per_unit ?? 0), active: ingredient?.active ?? true });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault();
          const payload = { name: form.name, unit: form.unit, min_qty: parseMoney(form.min_qty) || 0, cost_per_unit: parseMoney(form.cost_per_unit) || 0, active: form.active };
          const { error } = ingredient ? await sb().from("ingredients").update(payload).eq("id", ingredient.id) : await sb().from("ingredients").insert({ ...payload, restaurant_id: RESTAURANT_ID, current_qty: 0 });
          if (error) return toast.error(error.message);
          toast.success("Insumo salvo"); onSaved(); onClose();
        }}>
          <DialogHeader><DialogTitle>{ingredient ? "Editar insumo" : "Novo insumo"}</DialogTitle></DialogHeader>
          <Field label="Nome"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Unidade">
            <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as Ingredient["unit"] })}>
              {["g", "kg", "ml", "l", "un"].map((u) => <option key={u}>{u}</option>)}
            </Select>
          </Field>
          <Field label="Estoque mínimo"><Input inputMode="decimal" value={form.min_qty} onChange={(e) => setForm({ ...form, min_qty: e.target.value })} /></Field>
          <Field label="Custo por unidade (R$)"><Input inputMode="decimal" value={form.cost_per_unit} onChange={(e) => setForm({ ...form, cost_per_unit: e.target.value })} /></Field>
          {!ingredient && <p className="text-xs text-muted-foreground">O saldo inicial é lançado como “Entrada” após o cadastro.</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
