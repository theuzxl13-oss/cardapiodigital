"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

/**
 * Executa uma consulta e a repete sempre que houver alteração (Supabase Realtime)
 * nas tabelas informadas. Inclui verificação periódica como redundância caso a
 * conexão em tempo real caia.
 */
export function useLiveQuery<T>(key: string, fetcher: () => Promise<T>, tables: string[], options: { intervalMs?: number; filter?: string } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tablesKey = tables.join(",");

  const reload = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      console.error(`[useLiveQuery:${key}]`, e);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    reload();
    const supabase = getBrowserSupabase();
    const channel = supabase.channel(`live:${key}`);
    for (const table of tablesKey.split(",").filter(Boolean)) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, ...(options.filter ? { filter: options.filter } : {}) }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(reload, 250);
      });
    }
    channel.subscribe((status) => setConnected(status === "SUBSCRIBED"));
    const interval = setInterval(reload, options.intervalMs ?? 20000);
    const onVis = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [key, tablesKey, reload, options.intervalMs, options.filter]);

  return { data, error, loading, reload, connected, setData };
}
