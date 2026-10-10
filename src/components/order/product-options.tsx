"use client";

import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cartLineTotal, validateModifiers } from "@/lib/cart";
import { money } from "@/lib/format";
import { cn, newIdempotencyKey } from "@/lib/utils";
import type { CartItem, Product } from "@/lib/types";

/** Seleção de adicionais, observação e quantidade (usado pelo cliente e pelo garçom). */
export function ProductOptions({ product, onAdd, compact = false }: { product: Product; onAdd: (item: CartItem) => void; compact?: boolean }) {
  const groups = useMemo(
    () =>
      [...(product.modifier_groups ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((g) => ({ ...g, modifier_options: g.modifier_options.filter((o) => o.active).sort((a, b) => a.sort_order - b.sort_order) })),
    [product],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);

  const mods = groups.flatMap((g) =>
    g.modifier_options.filter((o) => selected.includes(o.id)).map((o) => ({ id: o.id, name: o.name, group: g.name, price_delta: Number(o.price_delta) })),
  );
  const error = validateModifiers(groups, selected);
  const total = cartLineTotal({ unit_price: Number(product.price), quantity: qty, modifiers: mods });

  function toggle(groupId: string, optionId: string) {
    const g = groups.find((x) => x.id === groupId)!;
    setSelected((prev) => {
      const inGroup = g.modifier_options.map((o) => o.id);
      if (g.max_select === 1) return [...prev.filter((id) => !inGroup.includes(id)), ...(prev.includes(optionId) && g.min_select === 0 ? [] : [optionId])];
      if (prev.includes(optionId)) return prev.filter((id) => id !== optionId);
      const count = prev.filter((id) => inGroup.includes(id)).length;
      return count >= g.max_select ? prev : [...prev, optionId];
    });
  }

  return (
    <div className="grid gap-5">
      {groups.map((g) => (
        <fieldset key={g.id} className="grid gap-2">
          <legend className="mb-1 flex w-full items-center justify-between text-sm font-semibold">
            {g.name}
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", g.min_select > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
              {g.min_select > 0 ? "Obrigatório" : g.max_select > 1 ? `Até ${g.max_select}` : "Opcional"}
            </span>
          </legend>
          {g.modifier_options.map((o) => {
            const active = selected.includes(o.id);
            return (
              <button
                type="button"
                key={o.id}
                onClick={() => toggle(g.id, o.id)}
                className={cn(
                  "flex items-center justify-between rounded-xl border px-3.5 py-3 text-left text-sm transition",
                  active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted",
                )}
              >
                <span className="flex items-center gap-2.5">
                  <span className={cn("grid size-5 place-items-center border-2", g.max_select === 1 ? "rounded-full" : "rounded-md", active ? "border-primary bg-primary" : "border-input")}>
                    {active && <span className={cn("bg-white", g.max_select === 1 ? "size-2 rounded-full" : "size-2 rounded-[2px]")} />}
                  </span>
                  {o.name}
                </span>
                {Number(o.price_delta) > 0 && <span className="tabular text-muted-foreground">+ {money(o.price_delta)}</span>}
              </button>
            );
          })}
        </fieldset>
      ))}

      <div className="grid gap-1.5">
        <label className="text-sm font-semibold" htmlFor={`notes-${product.id}`}>Observações</label>
        <Textarea id={`notes-${product.id}`} maxLength={200} rows={compact ? 2 : 3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: sem cebola, molho à parte…" />
      </div>

      {touched && error && <p className="text-sm font-medium text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-full border">
          <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Diminuir"><Minus /></Button>
          <span className="tabular w-8 text-center font-semibold">{qty}</span>
          <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={() => setQty((q) => Math.min(50, q + 1))} aria-label="Aumentar"><Plus /></Button>
        </div>
        <Button
          type="button"
          size="lg"
          className="flex-1 rounded-full"
          disabled={!product.available}
          onClick={() => {
            setTouched(true);
            if (error) return;
            onAdd({ key: newIdempotencyKey(), product_id: product.id, name: product.name, unit_price: Number(product.price), quantity: qty, modifiers: mods, notes });
            setSelected([]); setQty(1); setNotes(""); setTouched(false);
          }}
        >
          {product.available ? <>Adicionar · <span className="tabular">{money(total)}</span></> : "Indisponível no momento"}
        </Button>
      </div>
    </div>
  );
}
