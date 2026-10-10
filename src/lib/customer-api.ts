"use client";

/**
 * Chamadas do cliente da mesa. O token da sessão fica em cookie httpOnly e as rotas
 * /api/mesa/* repassam as operações às funções do banco.
 */
async function call<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error ?? "Erro de comunicação") as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export const customerApi = {
  getState: <T>() => call<T>("/api/mesa/estado"),
  placeOrder: (body: { items: unknown[]; notes: string | null; idempotency_key: string }) => call<{ number: number }>("/api/mesa/pedido", body),
  cancelOrder: (orderId: string) => call("/api/mesa/cancelar", { order_id: orderId }),
  requestService: (type: "call_waiter" | "request_bill", note?: string) => call("/api/mesa/chamar", { type, note }),
};
