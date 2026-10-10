import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Chave de idempotência para impedir pedidos/pagamentos duplicados. */
export function newIdempotencyKey() {
  return crypto.randomUUID();
}
