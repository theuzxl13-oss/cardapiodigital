"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
  const lastError = useRef<string | null>(null);
  /** Só a resposta da consulta mais recente é aplicada (evita que uma resposta antiga sobrescreva a nova). */
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tablesKey = tables.join(",");

  const reload = useCallback(async () => {
    const id = ++seq.current;
    try {
      const result = await fetcherRef.current();
      if (id !== seq.current) return;
      setData(result);
      setError(null);
      lastError.current = null;
    } catch (e) {
      if (id !== seq.current) return;
      const message = (e as Error).message;
      console.error(`[useLiveQuery:${key}]`, e);
      setError(message);
      // Avisa o usuário uma vez por erro (as novas tentativas automáticas continuam)
      if (lastError.current !== message) {
        lastError.current = message;
        toast.error(`Não foi possível atualizar os dados: ${message}`);
      }
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [key]);

  // Mantém a função de consulta mais recente sem recriar a assinatura do tempo real
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

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
