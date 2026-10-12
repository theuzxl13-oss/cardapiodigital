"use client";

import { useCallback, useEffect } from "react";
import { useLiveQuery } from "@/hooks/use-live-query";
import { check, sb } from "@/lib/api";
import type { CashSession } from "@/lib/types";

const EVENT = "cash-session-changed";

/** Sessão de caixa aberta do operador atual (compartilhada entre componentes da página). */
export function useMyCashSession(operatorId?: string) {
  const fetcher = useCallback(async () => {
    const { data: auth } = await sb().auth.getUser();
    const id = operatorId ?? auth.user?.id;
    if (!id) return null;
    return check(await sb().from("cash_sessions").select("*").eq("operator_id", id).eq("status", "open").maybeSingle()) as CashSession | null;
  }, [operatorId]);

  const { data, loading, reload } = useLiveQuery(`cash-session:${operatorId ?? "me"}`, fetcher, [], { intervalMs: 60000 });

  useEffect(() => {
    const handler = () => { reload(); };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, [reload]);

  // undefined = carregando; null = caixa fechado
  return { session: loading ? undefined : data, reload };
}

export function notifyCashSessionChanged() {
  window.dispatchEvent(new Event(EVENT));
}
