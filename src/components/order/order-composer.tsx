"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Flame, Minus, Plus, Search, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { ProductOptions } from "./product-options";
import { addToCart, cartLineTotal, cartSubtotal, toOrderPayload } from "@/lib/cart";
import { money, pad } from "@/lib/format";
import { rpc } from "@/lib/api";
import { cn, newIdempotencyKey } from "@/lib/utils";
import type { CartItem, Category, Product } from "@/lib/types";

/** Lançamento manual de pedidos pelo garçom (clientes que não usam o QR Code). */
export function OrderComposer({ open, onOpenChange, tabId, tableNumber, categories, products, onSent }: {
  open: boolean; onOpenChange: (o: boolean) => void; tabId: string; tableNumber: number;
  categories: Category[]; products: Product[]; onSent: () => void;
}) {
  const [cat, setCat] = useState<string | "all">("all");
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState(false);
  const [sending, setSending] = useState(false);
  const keyRef = useRef<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => p.active && (cat === "all" || p.category_id === cat) && (!q || p.name.toLowerCase().includes(q)));
  }, [products, cat, query]);

  function update(next: CartItem[]) {
    keyRef.current = null; // carrinho mudou: nova chave de idempotência
    setCart(next);
  }

  async function send() {
    keyRef.current ??= newIdempotencyKey();
    setSending(true);
    try {
      const order = await rpc<{ number: number }>("staff_place_order", {
        p_tab_id: tabId, p_items: toOrderPayload(cart), p_notes: notes.trim() || null, p_priority: priority, p_idempotency_key: keyRef.current,
      });
      toast.success(`Pedido #${order.number} enviado à cozinha`);
      setCart([]); setNotes(""); setPriority(false); keyRef.current = null;
      onOpenChange(false);
      onSent();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side="right" className="max-w-2xl gap-3 p-0">
        <div className="border-b p-5 pb-3">
          <DialogHeader>
            <DialogTitle>Lançar pedido · Mesa {pad(tableNumber)}</DialogTitle>
            <DialogDescription>Os itens entram na mesma comanda dos pedidos feitos pelo QR Code.</DialogDescription>
          </DialogHeader>
        </div>

        {picking ? (
          <div className="flex-1 overflow-y-auto px-5">
            <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => setPicking(null)}><ArrowLeft /> Voltar</Button>
            <h3 className="text-lg font-semibold">{picking.name}</h3>
            <p className="mb-4 text-sm text-muted-foreground">{money(picking.price)} · {picking.description}</p>
            <ProductOptions compact product={picking} onAdd={(item) => { update(addToCart(cart, item)); setPicking(null); toast.success(`${item.quantity}× ${item.name} adicionado`); }} />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col px-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar produto" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="scrollbar-none -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
              {[{ id: "all", name: "Todos" }, ...categories].map((c) => (
                <button key={c.id} onClick={() => setCat(c.id)}
                  className={cn("shrink-0 rounded-full border px-3 py-1 text-sm", cat === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>{c.name}</button>
              ))}
            </div>
            <div className="mt-3 grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto pb-3 sm:grid-cols-3">
              {list.map((p) => (
                <button key={p.id} disabled={!p.available}
                  onClick={() => {
                    if ((p.modifier_groups ?? []).length === 0) {
                      update(addToCart(cart, { key: newIdempotencyKey(), product_id: p.id, name: p.name, unit_price: Number(p.price), quantity: 1, modifiers: [], notes: "" }));
                      toast.success(`${p.name} adicionado`, { duration: 1200 });
                    } else setPicking(p);
                  }}
                  className="rounded-xl border bg-card p-3 text-left text-sm transition hover:border-primary disabled:opacity-40">
                  <p className="line-clamp-2 font-medium leading-snug">{p.name}</p>
                  <p className="tabular mt-1 text-muted-foreground">{p.available ? money(p.price) : "Indisponível"}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="border-t bg-muted/40 p-5">
          {cart.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">Nenhum item adicionado.</p>
          ) : (
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {cart.map((i) => (
                <div key={i.key} className="flex items-center gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{[...i.modifiers.map((m) => m.name), i.notes].filter(Boolean).join(" · ")}</p>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => update(i.quantity === 1 ? cart.filter((x) => x.key !== i.key) : cart.map((x) => (x.key === i.key ? { ...x, quantity: x.quantity - 1 } : x)))}>
                    {i.quantity === 1 ? <Trash2 /> : <Minus />}
                  </Button>
                  <span className="tabular w-5 text-center">{i.quantity}</span>
                  <Button variant="ghost" size="icon-sm" onClick={() => update(cart.map((x) => (x.key === i.key ? { ...x, quantity: Math.min(50, x.quantity + 1) } : x)))}><Plus /></Button>
                  <span className="tabular w-20 text-right">{money(cartLineTotal(i))}</span>
                </div>
              ))}
            </div>
          )}
          <Textarea className="mt-3" rows={2} placeholder="Observação para a cozinha" value={notes} onChange={(e) => { keyRef.current = null; setNotes(e.target.value); }} maxLength={300} />
          <div className="mt-3 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm"><Switch checked={priority} onCheckedChange={setPriority} /> <Flame className="size-4 text-orange-500" /> Prioridade</label>
            <Button size="lg" className="ml-auto" disabled={cart.length === 0 || sending} onClick={send}>
              {sending ? <Spinner /> : <Send />} Enviar · <span className="tabular">{money(cartSubtotal(cart))}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
