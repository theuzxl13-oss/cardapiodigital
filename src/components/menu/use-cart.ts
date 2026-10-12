"use client";

import { useCallback } from "react";
import { useStoredState } from "@/hooks/use-stored-state";
import { addToCart } from "@/lib/cart";
import type { CartItem } from "@/lib/types";

const EMPTY: CartItem[] = [];

/**
 * Carrinho antes da confirmação. Fica apenas na sessão do navegador (conveniência);
 * pedidos confirmados são persistidos exclusivamente no banco de dados.
 */
export function useCart(storageKey: string) {
  const [items, setItems] = useStoredState<CartItem[]>("session", storageKey, EMPTY);
  const add = useCallback((item: CartItem) => setItems((prev) => addToCart(prev, item)), [setItems]);
  const setQty = useCallback((key: string, qty: number) =>
    setItems((prev) => (qty <= 0 ? prev.filter((i) => i.key !== key) : prev.map((i) => (i.key === key ? { ...i, quantity: Math.min(50, qty) } : i)))), [setItems]);
  const clear = useCallback(() => setItems(EMPTY), [setItems]);
  return { items, add, setQty, clear };
}
