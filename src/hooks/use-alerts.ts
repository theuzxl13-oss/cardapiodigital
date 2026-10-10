"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Alertas sonoros (Web Audio, sem arquivos externos), vibração e notificação do navegador. */
export function useAlerts(storageKey: string, defaultEnabled = true) {
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [volume, setVolume] = useState(0.6);
  const ctx = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const v = JSON.parse(raw);
        setEnabled(Boolean(v.enabled));
        setVolume(Number(v.volume ?? 0.6));
      }
    } catch { /* preferências locais indisponíveis */ }
  }, [storageKey]);

  const save = useCallback((next: { enabled: boolean; volume: number }) => {
    setEnabled(next.enabled);
    setVolume(next.volume);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  }, [storageKey]);

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
        new Notification(title, { body, icon: "/brand/logo.svg", tag: title });
      }
    } catch { /* ignore */ }
  }, []);

  return { enabled, volume, save, unlock, beep, notify };
}
