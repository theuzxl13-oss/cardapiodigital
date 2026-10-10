import { round2 } from "./cart";

/**
 * Divide um valor em N partes iguais em centavos; a diferença de arredondamento
 * fica nas primeiras parcelas (a soma sempre bate com o total).
 */
export function splitEqually(total: number, parts: number): number[] {
  if (parts < 1 || !Number.isFinite(total)) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / parts);
  const remainder = cents - base * parts;
  return Array.from({ length: parts }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100);
}

/**
 * Valor proporcional de itens selecionados, incluindo taxa de serviço e desconto
 * distribuídos proporcionalmente ao subtotal.
 */
export function proportionalShare(
  itemsSubtotal: number,
  totals: { subtotal: number; service_fee: number; discount: number },
): number {
  if (totals.subtotal <= 0) return 0;
  const ratio = itemsSubtotal / totals.subtotal;
  return round2(itemsSubtotal + totals.service_fee * ratio - totals.discount * ratio);
}

export function changeFor(amountDue: number, received: number): number {
  return round2(Math.max(0, received - amountDue));
}

/** Sugestões de cédulas para pagamento em dinheiro. */
export function cashSuggestions(amount: number): number[] {
  if (amount <= 0) return [];
  const notes = [5, 10, 20, 50, 100, 200];
  const out = new Set<number>([round2(amount)]);
  for (const n of notes) {
    const v = Math.ceil(amount / n) * n;
    if (v > amount) out.add(v);
    if (out.size >= 4) break;
  }
  return [...out].sort((a, b) => a - b);
}
