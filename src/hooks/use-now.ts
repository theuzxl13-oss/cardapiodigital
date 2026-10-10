"use client";

import { useEffect, useState } from "react";

/** Relógio que atualiza a cada intervalo (tempo decorrido nos cartões). */
export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
