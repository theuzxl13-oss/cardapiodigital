import { describe, expect, it } from "vitest";
import { addToCart, cartLineTotal, cartSubtotal, toOrderPayload, validateModifiers } from "@/lib/cart";
import { cashSuggestions, changeFor, proportionalShare, splitEqually } from "@/lib/billing";
import { parseMoney } from "@/lib/format";
import type { CartItem, ModifierGroup } from "@/lib/types";

const item = (over: Partial<CartItem> = {}): CartItem => ({
  key: "k", product_id: "p1", name: "Hambúrguer", unit_price: 39.9, quantity: 2,
  modifiers: [{ id: "m1", name: "Bacon", group: "Adicionais", price_delta: 6 }], notes: "", ...over,
});

describe("carrinho", () => {
  it("calcula linha e subtotal com adicionais", () => {
    expect(cartLineTotal(item())).toBe(91.8);
    expect(cartSubtotal([item(), item({ product_id: "p2", unit_price: 7, modifiers: [], quantity: 3 })])).toBe(112.8);
  });

  it("mescla itens idênticos e mantém separados os diferentes", () => {
    let cart = addToCart([], item({ quantity: 1 }));
    cart = addToCart(cart, item({ key: "x", quantity: 2 }));
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(3);
    cart = addToCart(cart, item({ key: "y", notes: "sem cebola" }));
    expect(cart).toHaveLength(2);
  });

  it("não envia preços ao servidor", () => {
    const payload = toOrderPayload([item({ notes: "  bem passado " })]);
    expect(payload[0]).toEqual({ product_id: "p1", quantity: 2, modifiers: ["m1"], notes: "bem passado" });
    expect(JSON.stringify(payload)).not.toContain("39.9");
  });

  it("valida grupos obrigatórios e máximos", () => {
    const groups: ModifierGroup[] = [
      { id: "g1", product_id: "p1", name: "Ponto", min_select: 1, max_select: 1, sort_order: 1,
        modifier_options: [{ id: "a", group_id: "g1", name: "Ao ponto", price_delta: 0, active: true, sort_order: 1 },
                           { id: "b", group_id: "g1", name: "Bem", price_delta: 0, active: true, sort_order: 2 }] },
    ];
    expect(validateModifiers(groups, [])).toMatch(/Ponto/);
    expect(validateModifiers(groups, ["a", "b"])).toMatch(/Máximo/);
    expect(validateModifiers(groups, ["a"])).toBeNull();
  });
});

describe("divisão de conta e troco", () => {
  it("divide em partes iguais sem perder centavos", () => {
    const parts = splitEqually(100, 3);
    expect(parts).toEqual([33.34, 33.33, 33.33]);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
    expect(splitEqually(103.18, 4).reduce((a, b) => a + b, 0)).toBeCloseTo(103.18, 2);
  });

  it("calcula parte proporcional com taxa e desconto", () => {
    expect(proportionalShare(50, { subtotal: 100, service_fee: 10, discount: 0 })).toBe(55);
    expect(proportionalShare(50, { subtotal: 100, service_fee: 10, discount: 20 })).toBe(45);
  });

  it("calcula troco e sugestões de cédulas", () => {
    expect(changeFor(43.5, 50)).toBe(6.5);
    expect(changeFor(43.5, 40)).toBe(0);
    expect(cashSuggestions(43.5)).toEqual([43.5, 45, 50, 60]);
  });

  it("interpreta valores digitados", () => {
    expect(parseMoney("1.234,56")).toBe(1234.56);
    expect(parseMoney("12.5")).toBe(12.5);
    expect(parseMoney("R$ 7,00")).toBe(7);
    expect(Number.isNaN(parseMoney("abc"))).toBe(true);
  });
});
