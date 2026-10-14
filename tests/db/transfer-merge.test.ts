/**
 * Transferir e juntar mesas: integridade dos pedidos, pagamentos e sessões dos clientes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, createUser, hasDb, key, optionByName, pool, productByName, resetTable, rpc, tableByNumber } from "./helpers";
import type { CustomerState, OpenSession, OrderRow, TabRow, TotalsRow } from "./types";

const d = hasDb ? describe : describe.skip;

let waiter: { id: string };
let cashier: { id: string };
let mgr: { id: string };

beforeAll(async () => {
  if (!hasDb) return;
  waiter = await createUser("waiter", "Garçom Mesas");
  cashier = await createUser("cashier", "Caixa Mesas");
  mgr = await createUser("manager", "Gerente Mesas");
  await rpc(cashier, "open_cash_session", { p_opening_amount: 50 });
});

afterAll(async () => {
  if (hasDb) await pool.end();
});

async function burger() {
  const p = await productByName("Hambúrguer Artesanal Clássico");
  return { product_id: p.id, quantity: 1, modifiers: [await optionByName("Hambúrguer Artesanal Clássico", "Ao ponto")] };
}

/** Abre a mesa pelo QR (cliente) e faz um pedido; retorna token da sessão e comanda. */
async function customerTable(n: number) {
  await resetTable(n);
  const t = await tableByNumber(n);
  const s = await rpc<OpenSession>("anon", "customer_open_session", { p_qr_token: t.qr_token, p_user_agent: "vitest" });
  const order = await rpc<OrderRow>("anon", "customer_place_order", { p_session_token: s.session_token, p_items: [await burger()], p_notes: null, p_idempotency_key: key() });
  const st = await rpc<CustomerState>("anon", "customer_get_state", { p_session_token: s.session_token });
  return { token: s.session_token, tabId: st.tab.id, orderId: order.id, table: t };
}

const totals = async (tabId: string) => (await admin<TotalsRow>(`select * from tab_totals($1)`, [tabId]))[0];

d("Transferir mesa", () => {
  it("move comanda, pedidos e celulares conectados para a mesa livre; a origem fica livre", async () => {
    const { token, tabId, orderId } = await customerTable(2);
    await resetTable(14);
    const dest = await tableByNumber(14);
    const tab = await rpc<TabRow>(waiter, "transfer_tab", { p_tab_id: tabId, p_target_table_id: dest.id });
    expect(tab.id).toBe(tabId);

    const order = (await admin<{ table_id: string }>(`select table_id from orders where id = $1`, [orderId]))[0];
    expect(order.table_id).toBe(dest.id);
    // O cliente continua na mesma comanda e passa a ver a nova mesa
    const st = await rpc<CustomerState & { table: { number: number } }>("anon", "customer_get_state", { p_session_token: token });
    expect(st.table.number).toBe(14);
    // Mesa de origem livre: um novo escaneamento abre outra comanda
    const origin = await admin<{ c: number }>(`select count(*)::int c from tabs t join dining_tables d on d.id = t.table_id where d.number = 2 and t.status in ('open','closing')`);
    expect(origin[0].c).toBe(0);
    const audit = await admin<{ c: number }>(`select count(*)::int c from audit_log where action = 'tab.transfer' and entity_id = $1`, [tabId]);
    expect(audit[0].c).toBe(1);
  });

  it("não transfere para mesa ocupada, desativada ou para a própria mesa", async () => {
    const a = await customerTable(3);
    const b = await customerTable(4);
    await expect(rpc(waiter, "transfer_tab", { p_tab_id: a.tabId, p_target_table_id: b.table.id })).rejects.toThrow(/ocupada/);
    await expect(rpc(waiter, "transfer_tab", { p_tab_id: a.tabId, p_target_table_id: a.table.id })).rejects.toThrow(/já está nesta mesa/);
    await resetTable(15);
    const t15 = await tableByNumber(15);
    await admin(`update dining_tables set active = false where id = $1`, [t15.id]);
    await expect(rpc(waiter, "transfer_tab", { p_tab_id: a.tabId, p_target_table_id: t15.id })).rejects.toThrow(/desativada/);
    await admin(`update dining_tables set active = true where id = $1`, [t15.id]);
  });
});

d("Juntar mesas", () => {
  it("soma pedidos e pagamentos na comanda de destino e libera a mesa de origem", async () => {
    const src = await customerTable(6);
    const dst = await customerTable(7);
    // Pagamento parcial já feito na origem precisa acompanhar
    await rpc(cashier, "register_payment", { p_tab_id: src.tabId, p_method: "pix", p_amount: 10, p_received_amount: null, p_payer_label: null, p_idempotency_key: key() });
    const before = Number((await totals(src.tabId)).total) + Number((await totals(dst.tabId)).total);

    await rpc(waiter, "merge_tabs", { p_source_tab_id: src.tabId, p_target_tab_id: dst.tabId });

    const t = await totals(dst.tabId);
    expect(Number(t.total)).toBeCloseTo(before, 2);
    expect(Number(t.paid)).toBe(10);
    const srcTab = (await admin<{ status: string; merged_into_tab_id: string }>(`select status, merged_into_tab_id from tabs where id = $1`, [src.tabId]))[0];
    expect(srcTab).toEqual({ status: "cancelled", merged_into_tab_id: dst.tabId });
    // Clientes da mesa de origem continuam pedindo na comanda unida
    const st = await rpc<CustomerState>("anon", "customer_get_state", { p_session_token: src.token });
    expect(st.tab.id).toBe(dst.tabId);
    await rpc("anon", "customer_place_order", { p_session_token: src.token, p_items: [await burger()], p_notes: null, p_idempotency_key: key() });
    const orders = await admin<{ c: number }>(`select count(*)::int c from orders where tab_id = $1`, [dst.tabId]);
    expect(orders[0].c).toBe(3);
  });

  it("recusa juntar com a própria comanda, com comanda encerrada ou com desconto na origem", async () => {
    const a = await customerTable(8);
    const b = await customerTable(9);
    await expect(rpc(waiter, "merge_tabs", { p_source_tab_id: a.tabId, p_target_tab_id: a.tabId })).rejects.toThrow(/outra mesa/);
    await rpc(mgr, "set_tab_adjustments", { p_tab_id: a.tabId, p_service_fee_enabled: true, p_discount_amount: 2, p_discount_reason: "Cortesia", p_supervisor_pin: null });
    await expect(rpc(waiter, "merge_tabs", { p_source_tab_id: a.tabId, p_target_tab_id: b.tabId })).rejects.toThrow(/desconto/);
    await admin(`update tabs set status = 'closed' where id = $1`, [b.tabId]);
    await rpc(mgr, "set_tab_adjustments", { p_tab_id: a.tabId, p_service_fee_enabled: true, p_discount_amount: 0, p_discount_reason: null, p_supervisor_pin: null });
    await expect(rpc(waiter, "merge_tabs", { p_source_tab_id: a.tabId, p_target_tab_id: b.tabId })).rejects.toThrow(/abertas/);
  });

  it("comanda unida não conta como comanda encerrada nos relatórios", async () => {
    const src = await customerTable(10);
    const dst = await customerTable(11);
    await rpc(waiter, "merge_tabs", { p_source_tab_id: src.tabId, p_target_tab_id: dst.tabId });
    const closed = await admin<{ c: number }>(`select count(*)::int c from tabs where id = $1 and status = 'closed'`, [src.tabId]);
    expect(closed[0].c).toBe(0);
  });

  it("cozinha não pode transferir nem juntar", async () => {
    const cook = await createUser("kitchen", "Cozinha Mesas");
    const a = await customerTable(12);
    const b = await customerTable(13);
    await expect(rpc(cook, "merge_tabs", { p_source_tab_id: a.tabId, p_target_tab_id: b.tabId })).rejects.toThrow(/Acesso negado/);
    await expect(rpc(cook, "transfer_tab", { p_tab_id: a.tabId, p_target_table_id: b.table.id })).rejects.toThrow(/Acesso negado/);
  });
});
