"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const EVENT = "stored-state-change";
/** Usado quando o navegador bloqueia o armazenamento (o estado vale apenas nesta página). */
const memory = new Map<string, string>();

function storageOf(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function readRaw(kind: "local" | "session", key: string): string | null {
  try {
    const store = storageOf(kind);
    if (store) return store.getItem(key);
  } catch { /* cai para a memória */ }
  return memory.get(key) ?? null;
}

function writeRaw(kind: "local" | "session", key: string, value: string) {
  try {
    const store = storageOf(kind);
    if (store) {
      store.setItem(key, value);
      return;
    }
  } catch { /* cai para a memória */ }
  memory.set(key, value);
}

/**
 * Estado persistido em localStorage/sessionStorage, sincronizado entre componentes
 * (e entre abas, no caso do localStorage). No servidor e na hidratação usa o valor padrão.
 * `fallback` deve ser estável (constante de módulo ou useMemo).
 */
export function useStoredState<T>(kind: "local" | "session", key: string, fallback: T) {
  const subscribe = useCallback((onChange: () => void) => {
    const handler = (e: Event) => {
      if (e instanceof StorageEvent ? e.key === key : (e as CustomEvent<string>).detail === key) onChange();
    };
    window.addEventListener("storage", handler);
    window.addEventListener(EVENT, handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener(EVENT, handler);
    };
  }, [key]);

  const raw = useSyncExternalStore(subscribe, () => readRaw(kind, key), () => null);

  const value = useMemo<T>(() => {
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }, [raw, fallback]);

  const setValue = useCallback((next: T | ((prev: T) => T)) => {
    let current = fallback;
    const r = readRaw(kind, key);
    if (r !== null) {
      try { current = JSON.parse(r) as T; } catch { /* usa o padrão */ }
    }
    const resolved = typeof next === "function" ? (next as (prev: T) => T)(current) : next;
    writeRaw(kind, key, JSON.stringify(resolved));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
  }, [kind, key, fallback]);

  return [value, setValue] as const;
}
