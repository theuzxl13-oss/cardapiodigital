"use client";

import { anonRpc } from "./demo/mock-client";
import { getTableToken } from "./demo/session";

/** Demonstração: o token da mesa fica na sessão da aba e as funções do banco são chamadas diretamente. */
async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const token = getTableToken();
  if (!token) throw Object.assign(new Error("Sessão da mesa não encontrada. Escaneie o QR Code novamente."), { status: 401 });
  const { data, error } = await anonRpc<T>(fn, { p_session_token: token, ...args });
  if (error) throw Object.assign(new Error(error.message), { status: error.code === "42501" ? 401 : 400 });
  return data as T;
}

export const customerApi = {
  getState: <T>() => call<T>("customer_get_state"),
  placeOrder: (body: { items: unknown[]; notes: string | null; idempotency_key: string }) =>
    call<{ number: number }>("customer_place_order", { p_items: body.items, p_notes: body.notes, p_idempotency_key: body.idempotency_key }),
  cancelOrder: (orderId: string) => call("customer_cancel_order", { p_order_id: orderId }),
  requestService: (type: "call_waiter" | "request_bill", note?: string) => call("customer_request_service", { p_type: type, p_note: note ?? null }),
};
