import type { CartItem, ModifierGroup } from "./types";

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function cartLineTotal(item: Pick<CartItem, "unit_price" | "quantity" | "modifiers">) {
  const mods = item.modifiers.reduce((s, m) => s + Number(m.price_delta), 0);
  return round2((Number(item.unit_price) + mods) * item.quantity);
}

export function cartSubtotal(items: CartItem[]) {
  return round2(items.reduce((s, i) => s + cartLineTotal(i), 0));
}

export function cartCount(items: CartItem[]) {
  return items.reduce((s, i) => s + i.quantity, 0);
}

/** Valida seleção de adicionais no cliente (o servidor repete a validação). */
export function validateModifiers(groups: ModifierGroup[], selected: string[]): string | null {
  for (const g of groups) {
    const chosen = g.modifier_options.filter((o) => selected.includes(o.id)).length;
    if (chosen < g.min_select) return `Escolha ${g.min_select === 1 ? "uma opção" : `${g.min_select} opções`} em "${g.name}"`;
    if (chosen > g.max_select) return `Máximo de ${g.max_select} em "${g.name}"`;
  }
  return null;
}

/** Mescla itens idênticos (mesmo produto, adicionais e observação). */
export function addToCart(items: CartItem[], item: CartItem): CartItem[] {
  const sig = signature(item);
  const existing = items.find((i) => signature(i) === sig);
  if (existing) {
    return items.map((i) => (i === existing ? { ...i, quantity: Math.min(50, i.quantity + item.quantity) } : i));
  }
  return [...items, item];
}

function signature(i: CartItem) {
  return [i.product_id, [...i.modifiers.map((m) => m.id)].sort().join(","), i.notes.trim().toLowerCase()].join("|");
}

/** Payload enviado ao servidor: apenas ids, quantidades e observações (sem preços). */
export function toOrderPayload(items: CartItem[]) {
  return items.map((i) => ({
    product_id: i.product_id,
    quantity: i.quantity,
    modifiers: i.modifiers.map((m) => m.id),
    notes: i.notes.trim() || null,
  }));
}
