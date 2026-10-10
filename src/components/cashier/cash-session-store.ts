"use client";

import { useCallback, useEffect, useState } from "react";
import { check, sb } from "@/lib/api";
import type { CashSession } from "@/lib/types";

const EVENT = "cash-session-changed";

/** Sessão de caixa aberta do operador atual (compartilhada entre componentes da página). */
export function useMyCashSession(operatorId?: string) {
  const [session, setSession] = useState<CashSession | null | undefined>(undefined);

  const load = useCallback(async () => {
    const { data: auth } = await sb().auth.getUser();
    const id = operatorId ?? auth.user?.id;
    if (!id) return setSession(null);
    const data = check(await sb().from("cash_sessions").select("*").eq("operator_id", id).eq("status", "open").maybeSingle());
    setSession(data as CashSession | null);
  }, [operatorId]);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, [load]);

  return { session, reload: load };
}

export function notifyCashSessionChanged() {
  window.dispatchEvent(new Event(EVENT));
}
