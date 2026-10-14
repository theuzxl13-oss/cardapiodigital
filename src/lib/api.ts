"use client";

import { getBrowserSupabase } from "./supabase/client";
import { errorMessage } from "./errors";
import type { Category, DiningTable, Order, Payment, Product, ServiceRequest, Tab, TabTotals } from "./types";

const sb = () => getBrowserSupabase();

/** Chama uma função do banco e lança erro com mensagem amigável. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw new Error(errorMessage(error));
  return data as T;
}

/**
 * Valida o PIN de gerente (limite de 5 tentativas a cada 10 minutos). Em caso de sucesso, o banco
 * libera UMA operação sensível nos próximos 2 minutos. Lança erro com a mensagem do banco.
 */
export async function authorizeWithPin(pin: string) {
  const r = await rpc<{ ok: boolean; message?: string }>("authorize_supervisor_pin", { p_pin: pin });
  if (!r.ok) throw new Error(r.message ?? "PIN incorreto");
}

function check<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw new Error(errorMessage(res.error));
  return res.data as T;
}

export interface FloorData {
  tables: DiningTable[];
  tabs: Tab[];
  orders: Order[];
  requests: ServiceRequest[];
}

export async function loadFloor(): Promise<FloorData> {
  const [tables, tabs, orders, requests] = await Promise.all([
    sb().from("dining_tables").select("*").eq("active", true).order("number"),
    sb().from("tabs").select("*").in("status", ["open", "closing"]),
    sb().from("orders").select("*, order_items(*)").in("status", ["received", "preparing", "ready"]).order("created_at"),
    sb().from("service_requests").select("*").neq("status", "done").order("created_at"),
  ]);
  return {
    tables: check(tables) as DiningTable[],
    tabs: check(tabs) as Tab[],
    orders: check(orders) as Order[],
    requests: check(requests) as ServiceRequest[],
  };
}

export interface TabDetail {
  tab: Tab;
  table: DiningTable;
  orders: Order[];
  totals: TabTotals;
  payments: Payment[];
  requests: ServiceRequest[];
}

export async function loadTabDetail(tabId: string, withPayments = false): Promise<TabDetail> {
  const tab = check(await sb().from("tabs").select("*").eq("id", tabId).single()) as Tab;
  const [table, orders, totals, payments, requests] = await Promise.all([
    sb().from("dining_tables").select("*").eq("id", tab.table_id).single(),
    sb().from("orders").select("*, order_items(*)").eq("tab_id", tabId).order("created_at"),
    sb().rpc("staff_tab_totals", { p_tab_id: tabId }).single(),
    withPayments ? sb().from("payments").select("*").eq("tab_id", tabId).order("created_at") : Promise.resolve({ data: [], error: null }),
    sb().from("service_requests").select("*").eq("tab_id", tabId).neq("status", "done"),
  ]);
  return {
    tab,
    table: check(table) as DiningTable,
    orders: check(orders) as Order[],
    totals: check(totals) as TabTotals,
    payments: check(payments) as Payment[],
    requests: check(requests) as ServiceRequest[],
  };
}

export async function loadMenuForStaff(): Promise<{ categories: Category[]; products: Product[] }> {
  const [categories, products] = await Promise.all([
    sb().from("categories").select("*").order("sort_order"),
    sb().from("products").select("*, modifier_groups(*, modifier_options(*))").is("deleted_at", null).order("sort_order"),
  ]);
  return { categories: check(categories) as Category[], products: check(products) as Product[] };
}

export { sb, check };
