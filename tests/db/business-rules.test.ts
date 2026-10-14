/**
 * Testes das regras de negócio executados contra o PostgreSQL com as migrações reais.
 * Requer DATABASE_URL apontando para um banco preparado por `npm run db:local:setup`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PinResult, CashSessionRow, CloseResult, CustomerState, IdRow, LiveRow, OpenSession, OrderRow, PaymentResult, ReportRow, TabRow, TotalsRow } from "./types";
import {
  admin, as, createUser, hasDb, key, optionByName, pool, productByName, resetTable, rpc, tableByNumber,
} from "./helpers";

const d = hasDb ? describe : describe.skip;

let adminUser: { id: string };
let waiter: { id: string };
let waiter2: { id: string };
let cook: { id: string };
let cashier: { id: string };

beforeAll(async () => {
  if (!hasDb) return;
  adminUser = await createUser("admin", "Admin Teste");
  waiter = await createUser("waiter", "Garçom Teste");
  waiter2 = await createUser("waiter", "Garçom Teste 2");
  cook = await createUser("kitchen", "Cozinha Teste");
  cashier = await createUser("cashier", "Caixa Teste");
  await rpc(adminUser, "set_staff_pin", { p_user_id: adminUser.id, p_pin: "4321" });
});

afterAll(async () => {
  if (hasDb) await pool.end();
});

/** Leva um pedido até "entregue" (cozinha + garçom). */
async function serve(orderId: string) {
  await rpc(cook, "update_order_status", { p_order_id: orderId, p_to: "preparing", p_expected_from: null });
  await rpc(cook, "update_order_status", { p_order_id: orderId, p_to: "ready", p_expected_from: null });
  await rpc(waiter, "update_order_status", { p_order_id: orderId, p_to: "delivered", p_expected_from: null });
}

async function openCustomer(n: number) {
  const t = await tableByNumber(n);
  const s = await rpc<OpenSession>("anon", "customer_open_session", { p_qr_token: t.qr_token, p_user_agent: "vitest" });
  return s.session_token;
}

async function burgerItem(qty = 1, extra: string[] = []) {
  const p = await productByName("Hambúrguer Artesanal Clássico");
  const ponto = await optionByName("Hambúrguer Artesanal Clássico", "Ao ponto");
  const mods = [ponto];
  for (const e of extra) mods.push(await optionByName("Hambúrguer Artesanal Clássico", e));
  return { product_id: p.id, quantity: qty, modifiers: mods, notes: "sem cebola" };
}

d("Sessão de mesa e QR Code", () => {
  it("rejeita QR Code inválido", async () => {
    await expect(rpc("anon", "customer_open_session", { p_qr_token: "invalido", p_user_agent: null }))
      .rejects.toThrow(/QR Code inválido/);
  });

  it("abre comanda única por mesa mesmo com vários dispositivos", async () => {
    await resetTable(1);
    const a = await openCustomer(1);
    const b = await openCustomer(1);
    const sa = await rpc<CustomerState>("anon", "customer_get_state", { p_session_token: a });
    const sb = await rpc<CustomerState>("anon", "customer_get_state", { p_session_token: b });
    expect(sa.tab.id).toBe(sb.tab.id);
    const active = await admin(`select count(*)::int c from tabs t join dining_tables d on d.id = t.table_id
                                where d.number = 1 and t.status in ('open','closing')`);
    expect(active[0].c).toBe(1);
  });

  it("índice único impede duas comandas ativas na mesma mesa", async () => {
    await resetTable(1);
    await openCustomer(1);
    const t = await tableByNumber(1);
    await expect(admin(`insert into tabs (restaurant_id, table_id, number) values ('00000000-0000-4000-a000-000000000001', $1, 999999)`, [t.id]))
      .rejects.toThrow(/tabs_one_active_per_table/);
  });

  it("anônimo lê o cardápio mas não lê comandas, pedidos, mesas ou pagamentos", async () => {
    const products = await as("anon", (q) => q(`select id from products`));
    expect(products.length).toBe(30);
    for (const table of ["tabs", "orders", "dining_tables", "payments", "table_sessions"]) {
      await expect(as("anon", (q) => q(`select * from ${table}`))).rejects.toThrow(/permission denied/);
    }
  });

  it("token de sessão inválido é recusado", async () => {
    await expect(rpc("anon", "customer_get_state", { p_session_token: "x".repeat(64) })).rejects.toThrow(/expirada/);
  });
});

d("Pedidos do cliente", () => {
  it("calcula preços no servidor, ignorando valores enviados pelo cliente", async () => {
    await resetTable(5);
    const token = await openCustomer(5);
    const item = { ...(await burgerItem(2, ["Bacon extra"])), unit_price: 0.01, price: 0.01 };
    const order = await rpc<OrderRow>("anon", "customer_place_order", {
      p_session_token: token, p_items: [item], p_notes: null, p_idempotency_key: key(),
    });
    // (39,90 + 6,00) * 2
    expect(Number(order.subtotal)).toBeCloseTo(91.8, 2);
    const items = await admin(`select unit_price, modifiers_total, line_total, notes from order_items where order_id = $1`, [order.id]);
    expect(Number(items[0].unit_price)).toBe(39.9);
    expect(Number(items[0].modifiers_total)).toBe(6);
    expect(items[0].notes).toBe("sem cebola");
  });

  it("exige escolhas obrigatórias e rejeita adicionais de outro produto", async () => {
    const token = await openCustomer(5);
    const p = await productByName("Hambúrguer Artesanal Clássico");
    await expect(rpc("anon", "customer_place_order", {
      p_session_token: token, p_items: [{ product_id: p.id, quantity: 1, modifiers: [] }], p_notes: null, p_idempotency_key: key(),
    })).rejects.toThrow(/Ponto da carne/);
    const sabor = await optionByName("Refrigerante Lata 350ml", "Cola");
    const ponto = await optionByName("Hambúrguer Artesanal Clássico", "Ao ponto");
    await expect(rpc("anon", "customer_place_order", {
      p_session_token: token, p_items: [{ product_id: p.id, quantity: 1, modifiers: [ponto, sabor] }], p_notes: null, p_idempotency_key: key(),
    })).rejects.toThrow(/Adicional inválido/);
  });

  it("rejeita quantidade inválida e produto indisponível", async () => {
    const token = await openCustomer(5);
    const item = await burgerItem(0);
    await expect(rpc("anon", "customer_place_order", {
      p_session_token: token, p_items: [item], p_notes: null, p_idempotency_key: key(),
    })).rejects.toThrow(/Quantidade inválida/);
    const agua = await productByName("Água Mineral 500ml");
    await admin(`update products set available = false where id = $1`, [agua.id]);
    const semGas = await optionByName("Água Mineral 500ml", "Sem gás");
    await expect(rpc("anon", "customer_place_order", {
      p_session_token: token, p_items: [{ product_id: agua.id, quantity: 1, modifiers: [semGas] }], p_notes: null, p_idempotency_key: key(),
    })).rejects.toThrow(/indisponível/);
    await admin(`update products set available = true where id = $1`, [agua.id]);
  });

  it("reenvio com a mesma chave não duplica o pedido", async () => {
    const token = await openCustomer(5);
    const k = key();
    const args = { p_session_token: token, p_items: [await burgerItem()], p_notes: null, p_idempotency_key: k };
    const [a, b] = await Promise.all([
      rpc<OrderRow>("anon", "customer_place_order", args),
      rpc<OrderRow>("anon", "customer_place_order", args).catch(() => null),
    ]);
    const again = await rpc<OrderRow>("anon", "customer_place_order", args);
    expect(again.id).toBe(a.id);
    if (b) expect(b.id).toBe(a.id);
    const c = await admin(`select count(*)::int c from orders where idempotency_key = $1`, [k]);
    expect(c[0].c).toBe(1);
  });

  it("preço registrado no pedido não muda quando o cardápio é alterado", async () => {
    const token = await openCustomer(5);
    const order = await rpc<OrderRow>("anon", "customer_place_order", {
      p_session_token: token, p_items: [await burgerItem()], p_notes: null, p_idempotency_key: key(),
    });
    const p = await productByName("Hambúrguer Artesanal Clássico");
    await admin(`update products set price = 99.99, name = 'Outro nome' where id = $1`, [p.id]);
    const items = await admin(`select unit_price, product_name from order_items where order_id = $1`, [order.id]);
    expect(Number(items[0].unit_price)).toBe(39.9);
    expect(items[0].product_name).toBe("Hambúrguer Artesanal Clássico");
    await admin(`update products set price = 39.90, name = 'Hambúrguer Artesanal Clássico' where id = $1`, [p.id]);
  });

  it("cliente não consegue cancelar pedido de outra mesa", async () => {
    await resetTable(2);
    const t5 = await openCustomer(5);
    const t2 = await openCustomer(2);
    const order = await rpc<OrderRow>("anon", "customer_place_order", {
      p_session_token: t2, p_items: [await burgerItem()], p_notes: null, p_idempotency_key: key(),
    });
    await expect(rpc("anon", "customer_cancel_order", { p_session_token: t5, p_order_id: order.id }))
      .rejects.toThrow(/não encontrado nesta mesa/);
    const ok = await rpc<OrderRow>("anon", "customer_cancel_order", { p_session_token: t2, p_order_id: order.id });
    expect(ok.status).toBe("cancelled");
  });

  it("baixa o estoque pela ficha técnica e devolve no cancelamento", async () => {
    const token = await openCustomer(5);
    const qty = async () => Number((await admin(`select current_qty from ingredients where name = 'Blend bovino 180g'`))[0].current_qty);
    const before = await qty();
    const order = await rpc<OrderRow>("anon", "customer_place_order", {
      p_session_token: token, p_items: [await burgerItem(3)], p_notes: null, p_idempotency_key: key(),
    });
    expect(await qty()).toBe(before - 3);
    await rpc("anon", "customer_cancel_order", { p_session_token: token, p_order_id: order.id });
    expect(await qty()).toBe(before);
  });

  it("chamado de garçom não é duplicado enquanto estiver aberto", async () => {
    const token = await openCustomer(5);
    const a = await rpc<IdRow>("anon", "customer_request_service", { p_session_token: token, p_type: "call_waiter", p_note: null });
    const b = await rpc<IdRow>("anon", "customer_request_service", { p_session_token: token, p_type: "call_waiter", p_note: null });
    expect(a.id).toBe(b.id);
  });
});

d("Cozinha, garçom e permissões", () => {
  it("segue o fluxo recebido → preparo → pronto → entregue com papéis corretos", async () => {
    await resetTable(6);
    const tab = await rpc<TabRow>(waiter, "staff_open_tab", { p_table_id: (await tableByNumber(6)).id, p_customer_count: 2 });
    const order = await rpc<OrderRow>(waiter, "staff_place_order", {
      p_tab_id: tab.id, p_items: [await burgerItem()], p_notes: "mesa com criança", p_priority: true, p_idempotency_key: key(),
    });
    expect(order.source).toBe("waiter");

    await expect(rpc(waiter, "update_order_status", { p_order_id: order.id, p_to: "preparing", p_expected_from: null }))
      .rejects.toThrow(/não pode alterar/);
    await rpc(cook, "update_order_status", { p_order_id: order.id, p_to: "preparing", p_expected_from: "received" });
    // Segundo tablet da cozinha com tela desatualizada: conflito detectado
    await expect(rpc(cook, "update_order_status", { p_order_id: order.id, p_to: "preparing", p_expected_from: "received" }))
      .rejects.toThrow(/já foi atualizado/);
    await rpc(cook, "update_order_status", { p_order_id: order.id, p_to: "ready", p_expected_from: "preparing" });
    await expect(rpc(cook, "update_order_status", { p_order_id: order.id, p_to: "delivered", p_expected_from: "ready" }))
      .rejects.toThrow(/não pode alterar/);
    const done = await rpc<OrderRow>(waiter, "update_order_status", { p_order_id: order.id, p_to: "delivered", p_expected_from: "ready" });
    expect(done.status).toBe("delivered");
    expect(done.delivered_by).toBe(waiter.id);
    const hist = await admin(`select to_status from order_status_history where order_id = $1 order by id`, [order.id]);
    expect(hist.map((h) => h.to_status)).toEqual(["received", "preparing", "ready", "delivered"]);
  });

  it("pedidos de garçom e cliente caem na mesma comanda", async () => {
    const t = await tableByNumber(6);
    const token = await openCustomer(6);
    await rpc("anon", "customer_place_order", { p_session_token: token, p_items: [await burgerItem()], p_notes: null, p_idempotency_key: key() });
    const tabs = await admin(`select distinct tab_id from orders o join tabs t on t.id = o.tab_id where o.table_id = $1 and t.status = 'open'`, [t.id]);
    expect(tabs.length).toBe(1);
  });

  it("cancelamento após início do preparo exige PIN de gerente e registra responsável", async () => {
    const t = await tableByNumber(6);
    const tab = await rpc<TabRow>(waiter, "staff_open_tab", { p_table_id: t.id, p_customer_count: null });
    const order = await rpc<OrderRow>(waiter, "staff_place_order", {
      p_tab_id: tab.id, p_items: [await burgerItem()], p_notes: null, p_priority: false, p_idempotency_key: key(),
    });
    await rpc(cook, "update_order_status", { p_order_id: order.id, p_to: "preparing", p_expected_from: null });
    await expect(rpc(waiter, "cancel_order", { p_order_id: order.id, p_reason: "x", p_supervisor_pin: null }))
      .rejects.toThrow(/justificativa/);
    await expect(rpc(waiter, "cancel_order", { p_order_id: order.id, p_reason: "Cliente desistiu", p_supervisor_pin: null }))
      .rejects.toThrow(/PIN/);
    await expect(rpc(waiter, "cancel_order", { p_order_id: order.id, p_reason: "Cliente desistiu", p_supervisor_pin: "0000" }))
      .rejects.toThrow(/PIN/);
    const wrong = await rpc<PinResult>(waiter, "authorize_supervisor_pin", { p_pin: "0000" });
    expect(wrong.ok).toBe(false);
    expect((await rpc<PinResult>(waiter, "authorize_supervisor_pin", { p_pin: "4321" })).ok).toBe(true);
    const c = await rpc<OrderRow>(waiter, "cancel_order", { p_order_id: order.id, p_reason: "Cliente desistiu", p_supervisor_pin: "4321" });
    expect(c.status).toBe("cancelled");
    expect(c.cancelled_by).toBe(waiter.id);
    expect(c.cancel_authorized_by).toBe(adminUser.id);
    expect(c.cancel_reason).toBe("Cliente desistiu");
    const audit = await admin(`select count(*)::int c from audit_log where action = 'order.cancel' and entity_id = $1`, [order.id]);
    expect(audit[0].c).toBe(1);
  });

  it("cliente não cancela pedido já em preparo", async () => {
    const token = await openCustomer(6);
    const order = await rpc<OrderRow>("anon", "customer_place_order", { p_session_token: token, p_items: [await burgerItem()], p_notes: null, p_idempotency_key: key() });
    await rpc(cook, "update_order_status", { p_order_id: order.id, p_to: "preparing", p_expected_from: null });
    await expect(rpc("anon", "customer_cancel_order", { p_session_token: token, p_order_id: order.id })).rejects.toThrow(/em preparação/);
  });

  it("cozinha não altera valores, não registra pagamento nem cancela pedidos", async () => {
    const p = await productByName("Batata Frita");
    await expect(as(cook, (q) => q(`update products set price = 1 where id = $1`, [p.id]))).rejects.toThrow(/disponibilidade/);
    await as(cook, (q) => q(`update products set available = false where id = $1`, [p.id]));
    expect((await admin(`select available from products where id = $1`, [p.id]))[0].available).toBe(false);
    await admin(`update products set available = true where id = $1`, [p.id]);
    await expect(rpc(cook, "open_cash_session", { p_opening_amount: 100 })).rejects.toThrow(/Acesso negado/);
    const anyOrder = (await admin(`select id from orders where status = 'received' limit 1`))[0];
    await expect(rpc(cook, "cancel_order", { p_order_id: anyOrder.id, p_reason: "teste", p_supervisor_pin: null })).rejects.toThrow(/Acesso negado/);
    await expect(as(cook, (q) => q(`select * from payments`))).resolves.toEqual([]);
  });

  it("garçom não acessa configurações administrativas nem se autopromove", async () => {
    await expect(as(waiter, (q) => q(`update profiles set role = 'admin' where id = $1 returning id`, [waiter.id])))
      .resolves.toEqual([]);
    expect((await admin(`select role from profiles where id = $1`, [waiter.id]))[0].role).toBe("waiter");
    const updated = await as(waiter, (q) => q(`update restaurants set service_fee_pct = 0 returning id`));
    expect(updated).toEqual([]);
    await expect(as(waiter, (q) => q(`insert into categories (restaurant_id, name, slug) values ('00000000-0000-4000-a000-000000000001','X','x')`)))
      .rejects.toThrow(/row-level security/);
    await expect(rpc(waiter, "report_summary", { p_from: "2020-01-01", p_to: "2030-01-01", p_include_demo: true })).rejects.toThrow(/Acesso negado/);
    await expect(as(waiter, (q) => q(`select pin_hash from profiles`))).rejects.toThrow(/permission denied/);
  });
});

d("Caixa e fechamento de conta", () => {
  let tabId: string;
  let token: string;

  beforeAll(async () => {
    if (!hasDb) return;
    await resetTable(7);
    token = await openCustomer(7);
    const refri = await productByName("Refrigerante Lata 350ml");
    const cola = await optionByName("Refrigerante Lata 350ml", "Cola");
    const order = await rpc<OrderRow>("anon", "customer_place_order", {
      p_session_token: token, p_items: [await burgerItem(2), { product_id: refri.id, quantity: 2, modifiers: [cola] }],
      p_notes: null, p_idempotency_key: key(),
    });
    await serve(order.id);
    const st = await rpc<CustomerState>("anon", "customer_get_state", { p_session_token: token });
    tabId = st.tab.id;
    // 2*39,90 + 2*7,00 = 93,80 ; taxa 10% = 9,38 ; total 103,18
    expect(Number(st.totals.total)).toBeCloseTo(103.18, 2);
  });

  it("exige caixa aberto para receber", async () => {
    await expect(rpc(cashier, "register_payment", {
      p_tab_id: tabId, p_method: "pix", p_amount: 10, p_received_amount: null, p_payer_label: null, p_idempotency_key: key(),
    })).rejects.toThrow(/Abra o caixa/);
    await rpc(cashier, "open_cash_session", { p_opening_amount: 150 });
    await expect(rpc(cashier, "open_cash_session", { p_opening_amount: 150 })).rejects.toThrow(/já possui/);
  });

  it("desconto acima do limite exige PIN", async () => {
    await expect(rpc(cashier, "set_tab_adjustments", {
      p_tab_id: tabId, p_service_fee_enabled: true, p_discount_amount: 30, p_discount_reason: "Cortesia", p_supervisor_pin: null,
    })).rejects.toThrow(/PIN/);
    const t = await rpc<TotalsRow>(cashier, "set_tab_adjustments", {
      p_tab_id: tabId, p_service_fee_enabled: true, p_discount_amount: 5, p_discount_reason: "Cliente frequente", p_supervisor_pin: null,
    });
    expect(Number(t.total)).toBeCloseTo(98.18, 2);
  });

  it("pagamentos parciais e combinados, com troco e sem duplicidade", async () => {
    await expect(rpc(cashier, "register_payment", {
      p_tab_id: tabId, p_method: "pix", p_amount: 500, p_received_amount: null, p_payer_label: null, p_idempotency_key: key(),
    })).rejects.toThrow(/maior que o saldo/);

    const k = key();
    const p1 = await rpc<PaymentResult>(cashier, "register_payment", {
      p_tab_id: tabId, p_method: "cash", p_amount: 50, p_received_amount: 100, p_payer_label: "Pessoa 1", p_idempotency_key: k,
    });
    expect(Number(p1.payment.change_amount)).toBe(50);
    const dup = await rpc<PaymentResult>(cashier, "register_payment", {
      p_tab_id: tabId, p_method: "cash", p_amount: 50, p_received_amount: 100, p_payer_label: "Pessoa 1", p_idempotency_key: k,
    });
    expect(dup.duplicate).toBe(true);
    expect(Number(dup.totals.paid)).toBe(50);

    await expect(rpc(cashier, "close_tab", { p_tab_id: tabId, p_force_reason: null, p_supervisor_pin: null }))
      .rejects.toThrow(/saldo pendente/);

    const p2 = await rpc<PaymentResult>(cashier, "register_payment", {
      p_tab_id: tabId, p_method: "credit", p_amount: 48.18, p_received_amount: null, p_payer_label: "Pessoa 2", p_idempotency_key: key(),
    });
    expect(Number(p2.totals.balance)).toBe(0);
  });

  it("encerra a comanda, libera a mesa e invalida a sessão do cliente", async () => {
    const r = await rpc<CloseResult>(cashier, "close_tab", { p_tab_id: tabId, p_force_reason: null, p_supervisor_pin: null });
    expect(r.tab.status).toBe("closed");
    await expect(rpc("anon", "customer_get_state", { p_session_token: token })).rejects.toThrow(/expirada|encerrada/);
    await expect(rpc("anon", "customer_place_order", {
      p_session_token: token, p_items: [await burgerItem()], p_notes: null, p_idempotency_key: key(),
    })).rejects.toThrow(/expirada|encerrada/);
    await expect(rpc(cashier, "close_tab", { p_tab_id: tabId, p_force_reason: null, p_supervisor_pin: null })).rejects.toThrow(/já encerrada/);
    await expect(rpc(cashier, "register_payment", {
      p_tab_id: tabId, p_method: "pix", p_amount: 1, p_received_amount: null, p_payer_label: null, p_idempotency_key: key(),
    })).rejects.toThrow(/encerrada/);
    // Novo escaneamento abre nova comanda
    const newToken = await openCustomer(7);
    const st = await rpc<CustomerState>("anon", "customer_get_state", { p_session_token: newToken });
    expect(st.tab.id).not.toBe(tabId);
  });

  it("não encerra comanda com pedidos aguardando ou em preparo", async () => {
    await resetTable(12);
    const t = await tableByNumber(12);
    const tab = await rpc<TabRow>(waiter, "staff_open_tab", { p_table_id: t.id, p_customer_count: 1 });
    const o = await rpc<OrderRow>(waiter, "staff_place_order", { p_tab_id: tab.id, p_items: [await burgerItem()], p_notes: null, p_priority: false, p_idempotency_key: key() });
    await expect(rpc(cashier, "close_tab", { p_tab_id: tab.id, p_force_reason: "Teste de bloqueio", p_supervisor_pin: "4321" })).rejects.toThrow(/em preparo/);
    await rpc(cook, "update_order_status", { p_order_id: o.id, p_to: "preparing", p_expected_from: null });
    await rpc(cook, "update_order_status", { p_order_id: o.id, p_to: "ready", p_expected_from: null });
    await rpc(cashier, "register_payment", { p_tab_id: tab.id, p_method: "pix", p_amount: 43.89, p_received_amount: null, p_payer_label: null, p_idempotency_key: key() });
    await rpc(cashier, "close_tab", { p_tab_id: tab.id, p_force_reason: null, p_supervisor_pin: null });
    expect((await admin(`select status from orders where id = $1`, [o.id]))[0].status).toBe("delivered");
  });

  it("fechamento com saldo pendente exige justificativa e PIN", async () => {
    const t = await tableByNumber(9);
    await resetTable(9);
    const tab = await rpc<TabRow>(waiter2, "staff_open_tab", { p_table_id: t.id, p_customer_count: 1 });
    const o = await rpc<OrderRow>(waiter2, "staff_place_order", { p_tab_id: tab.id, p_items: [await burgerItem()], p_notes: null, p_priority: false, p_idempotency_key: key() });
    await serve(o.id);
    await expect(rpc(cashier, "close_tab", { p_tab_id: tab.id, p_force_reason: "Cliente saiu sem pagar", p_supervisor_pin: null })).rejects.toThrow(/PIN/);
    await rpc(cashier, "authorize_supervisor_pin", { p_pin: "4321" });
    const r = await rpc<CloseResult>(cashier, "close_tab", { p_tab_id: tab.id, p_force_reason: "Cliente saiu sem pagar", p_supervisor_pin: "4321" });
    expect(r.tab.forced_close_authorized_by).toBe(adminUser.id);
  });

  it("estorno exige autorização e fechamento de caixa calcula divergência", async () => {
    await resetTable(10);
    const t = await tableByNumber(10);
    const tab = await rpc<TabRow>(waiter, "staff_open_tab", { p_table_id: t.id, p_customer_count: 1 });
    await rpc(waiter, "staff_place_order", { p_tab_id: tab.id, p_items: [await burgerItem()], p_notes: null, p_priority: false, p_idempotency_key: key() });
    const p = await rpc<PaymentResult>(cashier, "register_payment", {
      p_tab_id: tab.id, p_method: "cash", p_amount: 20, p_received_amount: 20, p_payer_label: null, p_idempotency_key: key(),
    });
    await expect(rpc(cashier, "void_payment", { p_payment_id: p.payment.id, p_reason: "Valor errado", p_supervisor_pin: null })).rejects.toThrow(/PIN/);
    await rpc(cashier, "authorize_supervisor_pin", { p_pin: "4321" });
    await rpc(cashier, "void_payment", { p_payment_id: p.payment.id, p_reason: "Valor errado", p_supervisor_pin: "4321" });

    await rpc(cashier, "register_cash_movement", { p_type: "supply", p_amount: 30, p_reason: "Troco extra" });
    await expect(rpc(cashier, "register_cash_movement", { p_type: "withdrawal", p_amount: 10000, p_reason: "Cofre" })).rejects.toThrow(/maior que o dinheiro/);
    await rpc(cashier, "register_cash_movement", { p_type: "withdrawal", p_amount: 100, p_reason: "Cofre" });
    // abertura 150 + dinheiro 50 + suprimento 30 - sangria 100 = 130 (pagamento estornado não conta)
    const s = await rpc<CashSessionRow>(cashier, "close_cash_session", { p_counted_cash: 125, p_notes: "faltou troco" });
    expect(Number(s.expected_cash)).toBe(130);
    expect(Number(s.difference)).toBe(-5);
  });
});

d("Relatórios e dados de demonstração", () => {
  it("gera histórico fictício identificado e relatório consolidado", async () => {
    await admin(`select demo_generate_history(5)`);
    const r = await rpc<ReportRow>(adminUser, "report_summary", {
      p_from: new Date(Date.now() - 10 * 86400000).toISOString(), p_to: new Date(Date.now() + 86400000).toISOString(), p_include_demo: true,
    });
    expect(Number(r.revenue)).toBeGreaterThan(0);
    expect(r.includes_demo_data).toBe(true);
    expect(r.top_products.length).toBeGreaterThan(0);
    const live = await rpc<LiveRow>(adminUser, "dashboard_live", {});
    expect(live.tables_total).toBe(15);
  });

  it("funções de demonstração não são executáveis por usuários", async () => {
    await expect(as(adminUser, (q) => q(`select demo_generate_history(1)`))).rejects.toThrow(/permission denied/);
    await expect(as("anon", (q) => q(`select _place_order(null, null, null, 'customer', null, null, null, false)`))).rejects.toThrow(/permission denied/);
  });
});
