"use client";

import { useCallback, useMemo, useRef } from "react";
import { useStoredState } from "./use-stored-state";
import { asset } from "@/lib/asset";

/** Alertas sonoros (Web Audio, sem arquivos externos), vibração e notificação do navegador. */
export function useAlerts(storageKey: string, defaultEnabled = true) {
  const defaults = useMemo(() => ({ enabled: defaultEnabled, volume: 0.6 }), [defaultEnabled]);
  const [prefs, setPrefs] = useStoredState("local", storageKey, defaults);
  const enabled = Boolean(prefs.enabled);
  const volume = Number(prefs.volume ?? 0.6);
  const ctx = useRef<AudioContext | null>(null);

  const save = useCallback((next: { enabled: boolean; volume: number }) => setPrefs(next), [setPrefs]);

  /** Navegadores exigem um gesto do usuário para liberar o áudio. */
  const unlock = useCallback(() => {
    if (!ctx.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) ctx.current = new AC();
    }
    ctx.current?.resume();
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
  }, []);

  const beep = useCallback((pattern: "new" | "ready" | "call" = "new") => {
    if (!enabled) return;
    const c = ctx.current;
    if (!c) return;
    const notes = pattern === "ready" ? [880, 1175, 1568] : pattern === "call" ? [660, 660, 880] : [740, 988];
    notes.forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = c.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume * 0.5, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.32);
    });
    navigator.vibrate?.([120, 60, 120]);
  }, [enabled, volume]);

  const notify = useCallback((title: string, body: string) => {
    try {
      if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
        new Notification(title, { body, icon: asset("/brand/logo.svg"), tag: title });
      }
    } catch { /* ignore */ }
  }, []);

  return { enabled, volume, save, unlock, beep, notify };
}
