"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  BellRing, Clock, Cuboid, Flame, Leaf, Minus, Plus, Receipt, ShoppingBag, Sparkles, Trash2, UtensilsCrossed, Wheat,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Separator, Spinner } from "@/components/ui/misc";
import { ProductOptions } from "@/components/order/product-options";
import { ArViewer } from "./ar-viewer";
import { useCart } from "./use-cart";
import { cartCount, cartLineTotal, cartSubtotal, toOrderPayload } from "@/lib/cart";
import { money, pad, time } from "@/lib/format";
import { ORDER_STATUS_COLOR, ORDER_STATUS_LABEL } from "@/lib/labels";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { customerApi } from "@/lib/customer-api";
import { asset } from "@/lib/asset";
import { cn, newIdempotencyKey } from "@/lib/utils";
import type { Category, OrderStatus, Product, Restaurant, TabTotals } from "@/lib/types";

export interface CustomerState {
  table: { id: string; number: number; label: string | null };
  tab: {
    id: string; number: number; status: "open" | "closing" | "closed" | "cancelled"; opened_at: string;
    closing_requested_at: string | null; service_fee_enabled: boolean; service_fee_pct: number;
  };
  totals: TabTotals;
  orders: {
    id: string; number: number; status: OrderStatus; source: "customer" | "waiter"; created_at: string; subtotal: number;
    notes: string | null; mine: boolean;
    items: { product_name: string; quantity: number; unit_price: number; modifiers: { name: string }[]; notes: string | null; line_total: number }[];
  }[];
  open_requests: { id: string; type: "call_waiter" | "request_bill"; status: string; created_at: string }[];
}

const STATUS_STEPS: OrderStatus[] = ["received", "preparing", "ready", "delivered"];

export function MenuApp({ restaurant, categories, initialProducts, initialState }: {
  restaurant: Restaurant; categories: Category[]; initialProducts: Product[]; initialState: CustomerState;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [state, setState] = useState<CustomerState>(initialState);
  const [sessionLost, setSessionLost] = useState<string | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [view3d, setView3d] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [activeCat, setActiveCat] = useState(categories[0]?.id);
  const cart = useCart(`cart:${state.tab.id}`);
  const prevStatuses = useRef(new Map(initialState.orders.map((o) => [o.id, o.status])));

  // --- Estado da comanda (atualização contínua) -----------------------------------
  const refresh = useCallback(async () => {
    try {
      const s = await customerApi.getState<CustomerState>();
      for (const o of s.orders) {
        const before = prevStatuses.current.get(o.id);
        if (before && before !== o.status) {
          if (o.status === "ready") toast.success(`Pedido #${o.number} está pronto! Já vai chegar à sua mesa.`, { duration: 8000 });
          else if (o.status === "preparing") toast.info(`Pedido #${o.number} entrou em preparação.`);
          else if (o.status === "cancelled") toast.warning(`Pedido #${o.number} foi cancelado.`);
        }
        prevStatuses.current.set(o.id, o.status);
      }
      setState(s);
    } catch (e) {
      if ((e as { status?: number }).status === 401) setSessionLost((e as Error).message);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, 5000);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [refresh]);

  // --- Disponibilidade e preços em tempo real (Supabase Realtime) -------------------
  useEffect(() => {
    const supabase = getBrowserSupabase();
    const channel = supabase
      .channel("menu-products")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "products", filter: `restaurant_id=eq.${restaurant.id}` }, (payload) => {
        const p = payload?.new as Product | undefined;
        if (!p?.id) {
          // Evento sem a linha alterada: recarrega o cardápio completo
          supabase.from("products").select("*, modifier_groups(*, modifier_options(*))").eq("restaurant_id", restaurant.id)
            .eq("active", true).is("deleted_at", null).order("sort_order")
            .then(({ data }) => data && setProducts(data as Product[]));
          return;
        }
        setProducts((prev) => {
          const visible = p.active && !p.deleted_at;
          const exists = prev.some((x) => x.id === p.id);
          if (!visible) return prev.filter((x) => x.id !== p.id);
          return exists ? prev.map((x) => (x.id === p.id ? { ...x, ...p, modifier_groups: x.modifier_groups } : x)) : prev;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurant.id]);

  const byCategory = useMemo(
    () => categories.map((c) => ({ ...c, products: products.filter((p) => p.category_id === c.id) })).filter((c) => c.products.length > 0),
    [categories, products],
  );
  const featured = products.filter((p) => p.featured && p.available);
  const activeOrders = state.orders.filter((o) => !["delivered", "cancelled"].includes(o.status)).length;
  const hasRequest = (t: "call_waiter" | "request_bill") => state.open_requests.some((r) => r.type === t);

  // Sincroniza carrinho com disponibilidade atual
  const unavailableInCart = cart.items.filter((i) => {
    const p = products.find((x) => x.id === i.product_id);
    return !p || !p.available;
  });

  function openProduct(p: Product, as3d = false) {
    setSelected(p);
    setView3d(as3d && Boolean(p.model_glb_url));
  }

  async function callWaiter() {
    try {
      await customerApi.requestService("call_waiter");
      toast.success("Garçom chamado! Em instantes alguém virá até sua mesa.");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (sessionLost) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#1b110d] p-8 text-center text-[#fbeee0]">
        <Receipt className="size-12" />
        <h1 className="font-display text-2xl">Atendimento encerrado</h1>
        <p className="max-w-sm opacity-80">{sessionLost}</p>
        <p className="text-sm opacity-60">Obrigado pela visita!</p>
      </main>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-2xl bg-background pb-32">
      {/* Cabeçalho */}
      <header className="relative h-52 overflow-hidden text-[#fbeee0]">
        <Image src={asset(restaurant.cover_url ?? "/brand/cover.svg")} alt="" fill priority className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-5">
          <Image src={asset(restaurant.logo_url ?? "/brand/logo.svg")} alt="Logo" width={56} height={56} className="rounded-2xl shadow-lg" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-semibold leading-tight">{restaurant.name}</h1>
            {restaurant.tagline && <p className="truncate text-sm opacity-80">{restaurant.tagline}</p>}
          </div>
          <div className="rounded-2xl bg-white/15 px-3 py-2 text-center backdrop-blur">
            <p className="text-[10px] uppercase tracking-wider opacity-80">Mesa</p>
            <p className="tabular text-2xl font-bold leading-none">{pad(state.table.number)}</p>
          </div>
        </div>
      </header>

      {state.tab.status === "closing" && (
        <div className="flex items-center gap-2 bg-amber-100 px-5 py-2.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <Receipt className="size-4" /> Fechamento solicitado. Dirija-se ao caixa para pagar.
        </div>
      )}

      {/* Categorias */}
      <nav className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 py-3">
          {byCategory.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setActiveCat(c.id);
                document.getElementById(`cat-${c.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={cn("shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition",
                activeCat === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
            >
              {c.name}
            </button>
          ))}
        </div>
      </nav>

      {/* Destaques */}
      {featured.length > 0 && (
        <section className="pt-5">
          <h2 className="flex items-center gap-2 px-5 font-display text-xl font-semibold"><Sparkles className="size-5 text-primary" /> Destaques da casa</h2>
          <div className="scrollbar-none mt-3 flex snap-x gap-3 overflow-x-auto px-5 pb-1">
            {featured.map((p) => (
              <button key={p.id} onClick={() => openProduct(p)} className="relative w-60 shrink-0 snap-start overflow-hidden rounded-2xl border bg-card text-left shadow-sm">
                <div className="relative aspect-[4/3]">
                  {p.image_url && <Image src={asset(p.image_url)} alt={p.name} fill sizes="240px" className="object-cover" />}
                  {p.model_glb_url && <ArBadge className="absolute right-2 top-2" />}
                </div>
                <div className="p-3">
                  <p className="line-clamp-1 font-semibold">{p.name}</p>
                  <p className="tabular text-sm font-medium text-primary">{money(p.price)}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Produtos por categoria */}
      {byCategory.map((c) => (
        <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-16 px-5 pt-7">
          <h2 className="font-display text-xl font-semibold">{c.name}</h2>
          <div className="mt-3 divide-y">
            {c.products.map((p) => (
              <div key={p.id} className={cn("flex gap-3 py-4", !p.available && "opacity-55")}>
                <button className="min-w-0 flex-1 text-left" onClick={() => openProduct(p)}>
                  <p className="font-semibold leading-snug">{p.name}</p>
                  {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="tabular font-semibold text-primary">{money(p.price)}</span>
                    {!p.available && <Badge variant="destructive">Indisponível</Badge>}
                    {p.tags.includes("vegetariano") && <Leaf className="size-4 text-emerald-600" aria-label="Vegetariano" />}
                    {p.tags.includes("vegano") && <Leaf className="size-4 text-emerald-700" aria-label="Vegano" />}
                    {p.tags.includes("mais pedido") && <Badge variant="warning"><Flame className="size-3" /> Mais pedido</Badge>}
                  </div>
                </button>
                <div className="relative size-28 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {p.image_url && (
                    <button onClick={() => openProduct(p)} className="absolute inset-0" aria-label={`Ver ${p.name}`}>
                      <Image src={asset(p.image_url)} alt={p.name} fill sizes="112px" className="object-cover" />
                    </button>
                  )}
                  {p.model_glb_url && p.available && (
                    <button onClick={() => openProduct(p, true)} className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-center gap-1 rounded-lg bg-black/70 py-1 text-[11px] font-semibold text-white backdrop-blur">
                      <Cuboid className="size-3.5" /> Ver na mesa
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <p className="px-5 pt-8 text-center text-xs text-muted-foreground">
        Imagens e modelos 3D ilustrativos. Informe ao garçom sobre alergias e restrições alimentares.
      </p>

      {/* Barra inferior */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl border-t bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="flex gap-2">
          <Button variant="outline" size="lg" className="shrink-0 rounded-full px-3.5" onClick={callWaiter} disabled={hasRequest("call_waiter")} aria-label="Chamar garçom">
            <BellRing /> <span className="hidden min-[400px]:inline">{hasRequest("call_waiter") ? "Chamado" : "Garçom"}</span>
          </Button>
          <Button variant="outline" size="lg" className="relative shrink-0 rounded-full px-3.5" onClick={() => setOrdersOpen(true)}>
            <Receipt /> Conta
            {activeOrders > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-amber-500 text-[11px] font-bold text-white">{activeOrders}</span>}
          </Button>
          <Button size="lg" className="min-w-0 flex-1 rounded-full" onClick={() => setCartOpen(true)} disabled={cart.items.length === 0}>
            <ShoppingBag />
            {cart.items.length === 0 ? "Carrinho" : <><span>{cartCount(cart.items)} · </span><span className="tabular">{money(cartSubtotal(cart.items))}</span></>}
          </Button>
        </div>
      </div>

      {/* Detalhe do produto */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent side="bottom" className="gap-5">
          {selected && (
            <>
              {view3d && selected.model_glb_url ? (
                <ArViewer glb={selected.model_glb_url} usdz={selected.model_usdz_url} alt={`Modelo 3D: ${selected.name}`}
                  poster={selected.image_url} illustrative={selected.model_is_illustrative} />
              ) : (
                <div className="relative -mx-5 -mt-5 aspect-[4/3] overflow-hidden sm:mx-0 sm:mt-0 sm:rounded-2xl">
                  {selected.image_url && <Image src={asset(selected.image_url)} alt={selected.name} fill sizes="(max-width: 640px) 100vw, 512px" className="object-cover" />}
                </div>
              )}
              {selected.model_glb_url && (
                <div className="grid grid-cols-2 gap-2 rounded-full bg-muted p-1">
                  <button onClick={() => setView3d(false)} className={cn("rounded-full py-2 text-sm font-medium", !view3d && "bg-card shadow-sm")}>Foto</button>
                  <button onClick={() => setView3d(true)} className={cn("flex items-center justify-center gap-1.5 rounded-full py-2 text-sm font-medium", view3d && "bg-card shadow-sm")}>
                    <Cuboid className="size-4" /> 3D · Ver na mesa
                  </button>
                </div>
              )}
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">{selected.name}</DialogTitle>
                <DialogDescription className="text-base">{selected.description}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="tabular text-xl font-bold text-primary">{money(selected.price)}</span>
                {selected.prep_minutes ? <Badge variant="secondary"><Clock className="size-3" /> ~{selected.prep_minutes} min</Badge> : null}
                {selected.tags.filter((t) => t !== "mais pedido").map((t) => <Badge key={t} variant="outline" className="capitalize">{t}</Badge>)}
              </div>
              {selected.ingredients && (
                <div className="text-sm">
                  <p className="font-semibold">Ingredientes</p>
                  <p className="text-muted-foreground">{selected.ingredients}</p>
                </div>
              )}
              {selected.allergens.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <Wheat className="size-4 text-amber-600" />
                  <span className="font-semibold">Alergênicos:</span>
                  {selected.allergens.map((a) => <Badge key={a} variant="warning" className="capitalize">{a}</Badge>)}
                </div>
              )}
              <Separator />
              <ProductOptions
                key={selected.id}
                product={selected}
                onAdd={(item) => {
                  cart.add(item);
                  toast.success(`${item.quantity}× ${item.name} adicionado ao carrinho`);
                  setSelected(null);
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      <CartSheet open={cartOpen} onOpenChange={setCartOpen} cart={cart} unavailable={unavailableInCart.map((i) => i.key)}
        onPlaced={(n) => { setCartOpen(false); setOrdersOpen(true); toast.success(`Pedido #${n} enviado para a cozinha!`); refresh(); }} />

      <OrdersSheet open={ordersOpen} onOpenChange={setOrdersOpen} state={state} onChanged={refresh} hasBillRequest={hasRequest("request_bill") || state.tab.status === "closing"} />
    </div>
  );
}

function ArBadge({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur", className)}>
      <Cuboid className="size-3" /> AR
    </span>
  );
}

function CartSheet({ open, onOpenChange, cart, unavailable, onPlaced }: {
  open: boolean; onOpenChange: (o: boolean) => void; cart: ReturnType<typeof useCart>; unavailable: string[]; onPlaced: (number: number) => void;
}) {
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  // A mesma chave é reutilizada em novas tentativas do mesmo carrinho: o servidor não duplica o pedido.
  // A chave só muda quando o conteúdo do carrinho muda; reenviar o mesmo carrinho reutiliza a chave.
  const keyRef = useRef<{ signature: string; key: string } | null>(null);
  const signature = JSON.stringify(cart.items.map((i) => [i.key, i.quantity])) + notes;

  async function submit() {
    if (unavailable.length) return toast.error("Remova os itens indisponíveis antes de confirmar.");
    if (keyRef.current?.signature !== signature) keyRef.current = { signature, key: newIdempotencyKey() };
    setSending(true);
    try {
      const order = await customerApi.placeOrder({ items: toOrderPayload(cart.items), notes: notes.trim() || null, idempotency_key: keyRef.current.key });
      cart.clear(); setNotes(""); keyRef.current = null;
      onPlaced(order.number);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side="bottom">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Seu pedido</DialogTitle>
          <DialogDescription>Revise os itens antes de enviar para a cozinha.</DialogDescription>
        </DialogHeader>
        <div className="divide-y">
          {cart.items.map((i) => (
            <div key={i.key} className={cn("flex gap-3 py-3", unavailable.includes(i.key) && "text-destructive")}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{i.name}</p>
                {i.modifiers.length > 0 && <p className="text-xs text-muted-foreground">{i.modifiers.map((m) => m.name).join(" · ")}</p>}
                {i.notes && <p className="text-xs italic text-muted-foreground">“{i.notes}”</p>}
                {unavailable.includes(i.key) && <p className="text-xs font-semibold">Indisponível no momento</p>}
                <p className="tabular mt-1 text-sm font-semibold">{money(cartLineTotal(i))}</p>
              </div>
              <div className="flex items-center gap-1 self-center rounded-full border">
                <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={() => cart.setQty(i.key, i.quantity - 1)} aria-label="Diminuir">
                  {i.quantity === 1 ? <Trash2 /> : <Minus />}
                </Button>
                <span className="tabular w-6 text-center text-sm font-semibold">{i.quantity}</span>
                <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={() => cart.setQty(i.key, i.quantity + 1)} aria-label="Aumentar"><Plus /></Button>
              </div>
            </div>
          ))}
        </div>
        <Textarea placeholder="Observação geral do pedido (opcional)" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex items-center justify-between text-lg font-semibold">
          <span>Subtotal</span><span className="tabular">{money(cartSubtotal(cart.items))}</span>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">Valores confirmados pelo restaurante no envio. O pagamento é feito no caixa.</p>
        <Button size="xl" className="rounded-full" disabled={sending || cart.items.length === 0} onClick={submit}>
          {sending ? <Spinner /> : <UtensilsCrossed />} Confirmar pedido
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function OrdersSheet({ open, onOpenChange, state, onChanged, hasBillRequest }: {
  open: boolean; onOpenChange: (o: boolean) => void; state: CustomerState; onChanged: () => void; hasBillRequest: boolean;
}) {
  const [confirmBill, setConfirmBill] = useState(false);
  const [busy, setBusy] = useState(false);
  const t = state.totals;

  async function cancel(orderId: string, number: number) {
    if (!confirm(`Cancelar o pedido #${number}?`)) return;
    try {
      await customerApi.cancelOrder(orderId);
      toast.success("Pedido cancelado");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function requestBill() {
    setBusy(true);
    try {
      await customerApi.requestService("request_bill");
      toast.success("Fechamento solicitado! Dirija-se ao caixa para efetuar o pagamento.");
      setConfirmBill(false);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side="bottom">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Mesa {pad(state.table.number)} · Comanda #{state.tab.number}</DialogTitle>
          <DialogDescription>Acompanhe seus pedidos em tempo real.</DialogDescription>
        </DialogHeader>

        {state.orders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum pedido ainda. Escolha algo delicioso no cardápio!</p>
        ) : (
          <div className="grid gap-3">
            {state.orders.map((o) => (
              <div key={o.id} className="rounded-xl border p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">Pedido #{o.number} <span className="text-xs font-normal text-muted-foreground">· {time(o.created_at)} · {o.source === "waiter" ? "pelo garçom" : o.mine ? "deste aparelho" : "pela mesa"}</span></p>
                  <span className={cn("shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", ORDER_STATUS_COLOR[o.status])}>{ORDER_STATUS_LABEL[o.status]}</span>
                </div>
                {o.status !== "cancelled" && (
                  <div className="mt-3 flex gap-1">
                    {STATUS_STEPS.map((s, i) => (
                      <div key={s} className={cn("h-1.5 flex-1 rounded-full", STATUS_STEPS.indexOf(o.status) >= i ? "bg-primary" : "bg-muted")} />
                    ))}
                  </div>
                )}
                <ul className="mt-3 space-y-1 text-sm">
                  {o.items.map((i, idx) => (
                    <li key={idx} className="flex justify-between gap-2">
                      <span>{i.quantity}× {i.product_name}{i.modifiers?.length ? <span className="text-muted-foreground"> ({i.modifiers.map((m) => m.name).join(", ")})</span> : null}</span>
                      <span className="tabular text-muted-foreground">{money(i.line_total)}</span>
                    </li>
                  ))}
                </ul>
                {o.status === "received" && o.mine && (
                  <Button variant="ghost" size="sm" className="mt-2 text-destructive" onClick={() => cancel(o.id, o.number)}>Cancelar pedido</Button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1.5 rounded-xl bg-muted p-4 text-sm">
          <Row label="Subtotal" value={t.subtotal} />
          {state.tab.service_fee_enabled && <Row label={`Taxa de serviço (${Number(state.tab.service_fee_pct)}%)`} value={t.service_fee} />}
          {Number(t.discount) > 0 && <Row label="Desconto" value={-t.discount} />}
          {Number(t.paid) > 0 && <Row label="Já pago" value={-t.paid} />}
          <Separator className="my-2" />
          <div className="flex justify-between text-lg font-bold"><span>Total</span><span className="tabular">{money(Number(t.paid) > 0 ? t.balance : t.total)}</span></div>
        </div>

        {hasBillRequest ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <p className="font-semibold">Fechamento solicitado</p>
            <p>Dirija-se ao caixa para pagamento (dinheiro, PIX, débito ou crédito).</p>
          </div>
        ) : (
          <Button size="lg" variant="secondary" className="rounded-full" disabled={state.orders.length === 0} onClick={() => setConfirmBill(true)}>
            <Receipt /> Solicitar fechamento da conta
          </Button>
        )}

        <Dialog open={confirmBill} onOpenChange={setConfirmBill}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Fechar a conta?</DialogTitle>
              <DialogDescription>Avisaremos o caixa. O pagamento é feito presencialmente no caixa do restaurante.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmBill(false)}>Voltar</Button>
              <Button onClick={requestBill} disabled={busy}>{busy && <Spinner />} Solicitar fechamento</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="tabular">{money(value)}</span></div>;
}
