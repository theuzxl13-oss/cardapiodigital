import "server-only";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAnonSupabase } from "./supabase/server";
import { TABLE_SESSION_COOKIE } from "./config";

/**
 * O token da sessão de mesa fica em cookie httpOnly (inacessível ao JavaScript do navegador).
 * Todas as operações do cliente passam pelo servidor, que repassa o token às funções
 * do banco. Alterar ?mesa= na URL não dá acesso a outra mesa: o token define a mesa.
 */
export async function readTableToken() {
  return (await cookies()).get(TABLE_SESSION_COOKIE)?.value ?? null;
}

export function sessionCookieOptions(hours: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: hours * 3600,
  };
}

/** Proteção CSRF básica para POSTs autenticados por cookie. */
export async function assertSameOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (origin && host && new URL(origin).host !== host) {
    throw new Error("Origem da requisição não permitida");
  }
}

export async function callCustomerRpc<T>(fn: string, args: Record<string, unknown>) {
  const token = await readTableToken();
  if (!token) return { error: "Sessão da mesa não encontrada. Escaneie o QR Code novamente.", status: 401 as const };
  const { data, error } = await getAnonSupabase().rpc(fn, { p_session_token: token, ...args });
  if (error) {
    const status = error.code === "42501" ? 401 : 400;
    return { error: error.message, status: status as 400 | 401 };
  }
  return { data: data as T };
}

export function json(result: { data?: unknown; error?: string; status?: number }) {
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  return NextResponse.json(result.data ?? null);
}
