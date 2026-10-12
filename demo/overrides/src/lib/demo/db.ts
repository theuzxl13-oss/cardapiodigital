"use client";

import { PGliteWorker } from "@electric-sql/pglite/worker";
import { BASE, DEMO_DB_NAME, DEMO_DB_VERSION } from "./config";

type Tx = { query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>; exec: (sql: string) => Promise<unknown> };
export type DemoUser = { id: string; email: string } | null;

let dbPromise: Promise<PGliteWorker> | null = null;

/** Banco PostgreSQL rodando no navegador, compartilhado entre abas e persistido no IndexedDB. */
export function getDb(): Promise<PGliteWorker> {
  if (typeof window === "undefined") return new Promise(() => {});
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        if (localStorage.getItem("demo-db-version") !== DEMO_DB_VERSION) {
          await deleteIdb(`/pglite/${DEMO_DB_NAME}`);
          localStorage.setItem("demo-db-version", DEMO_DB_VERSION);
        }
      } catch { /* armazenamento indisponível: segue em frente */ }
      window.dispatchEvent(new CustomEvent("demo-db-loading", { detail: true }));
      const worker = new Worker(new URL("./pglite-worker.ts", import.meta.url), { type: "module" });
      const db = await PGliteWorker.create(worker, { dataDir: `idb://${DEMO_DB_NAME}`, meta: { base: BASE } });
      window.dispatchEvent(new CustomEvent("demo-db-loading", { detail: false }));
      return db;
    })();
  }
  return dbPromise;
}

function deleteIdb(name: string) {
  return new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Apaga o banco local e recarrega com os dados de demonstração originais. */
export async function resetDemo() {
  try {
    const db = await dbPromise;
    await db?.close();
  } catch { /* ignore */ }
  await deleteIdb(`/pglite/${DEMO_DB_NAME}`);
  try { sessionStorage.clear(); } catch { /* ignore */ }
  channel()?.postMessage({ reset: true });
  // Recarga completa (necessária para reabrir o banco recriado)
  window.location.replace(new URL(`${BASE}/`, window.location.origin).href);
}

/**
 * Executa como um usuário do Supabase: anônimo, funcionário autenticado (RLS ativo)
 * ou "service" (superusuário, apenas para recursos da própria demonstração).
 */
export async function runAs<T>(user: DemoUser | "service", fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    if (user === null) {
      await tx.exec("set local role anon");
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    } else if (user !== "service") {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user.id, role: "authenticated", email: user.email })]);
    }
    return fn(tx as unknown as Tx);
  });
}

// --- "Realtime" entre abas ---------------------------------------------------------
let bc: BroadcastChannel | null | undefined;
function channel() {
  if (bc === undefined) bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("cardapio-demo-changes") : null;
  return bc;
}
const local = typeof window !== "undefined" ? new EventTarget() : null;

export function notifyChange(tables: string[]) {
  channel()?.postMessage({ tables });
  local?.dispatchEvent(new CustomEvent("change", { detail: tables }));
}

export function onChange(cb: (tables: string[]) => void) {
  const onMsg = (e: MessageEvent) => {
    if (e.data?.reset) location.reload();
    else if (e.data?.tables) cb(e.data.tables);
  };
  const onLocal = (e: Event) => cb((e as CustomEvent<string[]>).detail);
  channel()?.addEventListener("message", onMsg);
  local?.addEventListener("change", onLocal);
  return () => {
    channel()?.removeEventListener("message", onMsg);
    local?.removeEventListener("change", onLocal);
  };
}
