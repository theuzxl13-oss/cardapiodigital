"use client";

import { useCallback, useEffect, useState } from "react";
import { addToCart } from "@/lib/cart";
import type { CartItem } from "@/lib/types";

/**
 * Carrinho antes da confirmação. Fica apenas na sessão do navegador (conveniência);
 * pedidos confirmados são persistidos exclusivamente no banco de dados.
 */
export function useCart(storageKey: string) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* armazenamento indisponível */
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items, storageKey]);

  const add = useCallback((item: CartItem) => setItems((prev) => addToCart(prev, item)), []);
  const setQty = useCallback((key: string, qty: number) => setItems((prev) => (qty <= 0 ? prev.filter((i) => i.key !== key) : prev.map((i) => (i.key === key ? { ...i, quantity: Math.min(50, qty) } : i)))), []);
  const clear = useCallback(() => setItems([]), []);
  return { items, add, setQty, clear };
}
