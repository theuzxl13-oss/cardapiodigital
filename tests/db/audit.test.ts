/**
 * Testes da auditoria técnica: concorrência, integridade financeira e isolamento.
 * Requer DATABASE_URL (ver tests/db/helpers.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, as, createUser, hasDb, key, optionByName, pool, productByName, resetTable, rpc, tableByNumber } from "./helpers";

interface Order { id: string; status: string; subtotal: string }
interface Totals { subtotal: string; total: string; paid: string; balance: string }
interface Tab { id: string; status: string }

const d = hasDb ? describe : describe.skip;

let mgr: { id: string };
let waiter: { id: string };
let cook: { id: string };
let cashierA: { id: string };
let cashierB: { id: string };

beforeAll(async () => {
  if (!hasDb) return;
  mgr = await createUser("manager", "Gerente Auditoria");
  waiter = await createUser("waiter", "Garçom Auditoria");
  cook = await createUser("kitchen", "Cozinha Auditoria");
  cashierA = await createUser("cashier", "Caixa A");
  cashierB = await createUser("cashier", "Caixa B");
  await rpc(cashierA, "open_cash_session", { p_opening_amount: 100 });
  await rpc(cashierB, "open_cash_session", { p_opening_amount: 100 });
});

afterAll(async () => {
  if (hasDb) await pool.end();
});

async function burger() {
  const p = await productByName("Hambúrguer Artesanal Clássico");
  return { product_id: p.id, quantity: 1, modifiers: [await optionByName("Hambúrguer Artesanal Clássico", "Ao ponto")] };
}

async function servedTab(tableNumber: number) {
  await resetTable(tableNumber);
  const t = await tableByNumber(tableNumber);
  const tab = await rpc<Tab>(waiter, "staff_open_tab", { p_table_id: t.id, p_customer_count: 2 });
  const order = await rpc<Order>(waiter, "staff_place_order", { p_tab_id: tab.id, p_items: [await burger()], p_notes: null, p_priority: false, p_idempotency_key: key() });
  await rpc(cook, "update_order_status", { p_order_id: order.id, p_to: "preparing", p_expected_from: null });
  await rpc(cook, "update_order_status", { p_order_id: order.id, p_to: "ready", p_expected_from: null });
  await rpc(waiter, "update_order_status", { p_order_id: order.id, p_to: "delivered", p_expected_from: null });
  return { tab, order };
}

d("Integridade financeira", () => {
  it("cancelar pedido já pago não pode deixar a comanda com pagamento maior que o total", async () => {
    const { tab, order } = await servedTab(13);
    // 39,90 + 10% = 43,89 pago integralmente
    await rpc(cashierA, "register_payment", { p_tab_id: tab.id, p_method: "pix", p_amount: 43.89, p_received_amount: null, p_payer_label: null, p_idempotency_key: key() });
    await expect(rpc(mgr, "cancel_order", { p_order_id: order.id, p_reason: "Erro de lançamento", p_supervisor_pin: null }))
      .rejects.toThrow(/estorne/i);
    const t = (await admin<Totals>(`select * from tab_totals($1)`, [tab.id]))[0];
    expect(Number(t.balance)).toBe(0);
  });

  it("pagamentos simultâneos de dois caixas não ultrapassam o saldo", async () => {
    const { tab } = await servedTab(14);
    const pay = (who: { id: string }) => rpc(who, "register_payment", {
      p_tab_id: tab.id, p_method: "credit", p_amount: 43.89, p_received_amount: null, p_payer_label: null, p_idempotency_key: key(),
    }).then(() => "ok", (e: Error) => e.message);
    const results = await Promise.all([pay(cashierA), pay(cashierB)]);
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    const t = (await admin<Totals>(`select * from tab_totals($1)`, [tab.id]))[0];
    expect(Number(t.paid)).toBe(43.89);
  });

  it("encerramento simultâneo da mesma comanda só acontece uma vez", async () => {
    const { tab } = await servedTab(15);
    await rpc(cashierA, "register_payment", { p_tab_id: tab.id, p_method: "pix", p_amount: 43.89, p_received_amount: null, p_payer_label: null, p_idempotency_key: key() });
    const close = (who: { id: string }) => rpc(who, "close_tab", { p_tab_id: tab.id, p_force_reason: null, p_supervisor_pin: null })
      .then(() => "ok", (e: Error) => e.message);
    const results = await Promise.all([close(cashierA), close(cashierB)]);
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    const audits = await admin<{ c: number }>(`select count(*)::int c from audit_log where action = 'tab.close' and entity_id = $1`, [tab.id]);
    expect(audits[0].c).toBe(1);
  });
});

d("Comandas encerradas", () => {
  it("não permite alterar o status de pedidos de comanda encerrada", async () => {
    const { tab, order } = await servedTab(13);
    await rpc(cashierA, "register_payment", { p_tab_id: tab.id, p_method: "pix", p_amount: 43.89, p_received_amount: null, p_payer_label: null, p_idempotency_key: key() });
    await rpc(cashierA, "close_tab", { p_tab_id: tab.id, p_force_reason: null, p_supervisor_pin: null });
    await expect(rpc(waiter, "update_order_status", { p_order_id: order.id, p_to: "ready", p_expected_from: "delivered" }))
      .rejects.toThrow(/encerrada/);
  });
});

d("Concorrência no QR Code", () => {
  it("vários celulares escaneando a mesa livre ao mesmo tempo abrem uma única comanda", async () => {
    await resetTable(12);
    const t = await tableByNumber(12);
    const sessions = await Promise.all(Array.from({ length: 6 }, () =>
      rpc<{ session_token: string }>("anon", "customer_open_session", { p_qr_token: t.qr_token, p_user_agent: "vitest" })));
    expect(sessions).toHaveLength(6);
    const active = await admin<{ c: number }>(`select count(*)::int c from tabs where table_id = $1 and status in ('open','closing')`, [t.id]);
    expect(active[0].c).toBe(1);
  });
});

d("Regeneração do QR Code", () => {
  it("gerar novo QR invalida o código antigo e as sessões abertas com ele", async () => {
    await resetTable(11);
    const t = await tableByNumber(11);
    const s = await rpc<{ session_token: string }>("anon", "customer_open_session", { p_qr_token: t.qr_token, p_user_agent: "vitest" });
    await rpc(mgr, "regenerate_table_qr", { p_table_id: t.id });
    await expect(rpc("anon", "customer_open_session", { p_qr_token: t.qr_token, p_user_agent: "vitest" })).rejects.toThrow(/QR Code inválido/);
    await expect(rpc("anon", "customer_get_state", { p_session_token: s.session_token })).rejects.toThrow(/expirada|encerrada/);
  });
});

d("Isolamento e permissões", () => {
  it("anônimo não executa funções de funcionário nem lê dados internos", async () => {
    const t = await tableByNumber(10);
    for (const [fn, args] of [
      ["staff_open_tab", { p_table_id: t.id, p_customer_count: 1 }],
      ["open_cash_session", { p_opening_amount: 1 }],
      ["report_summary", { p_from: "2020-01-01", p_to: "2030-01-01", p_include_demo: true }],
      ["regenerate_table_qr", { p_table_id: t.id }],
    ] as const) {
      await expect(rpc("anon", fn, args)).rejects.toThrow(/permission denied|Acesso negado/);
    }
    for (const table of ["profiles", "audit_log", "cash_sessions", "ingredients", "service_requests"]) {
      await expect(as("anon", (q) => q(`select * from ${table} limit 1`))).rejects.toThrow(/permission denied/);
    }
  });

  it("caixa não vê sessões de caixa de outro operador", async () => {
    const rows = await as(cashierA, (q) => q<{ operator_id: string }>(`select operator_id from cash_sessions`));
    expect(rows.every((r) => r.operator_id === cashierA.id)).toBe(true);
  });
});
