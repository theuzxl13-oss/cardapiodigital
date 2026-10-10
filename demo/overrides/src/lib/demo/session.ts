"use client";

/**
 * Sessões da demonstração ficam por ABA (sessionStorage): é possível abrir, no mesmo
 * navegador, uma aba como cliente, outra como cozinha, outra como caixa etc.
 */
const USER_KEY = "demo-user";
const TABLE_KEY = "demo-mesa-token";

export function getDemoUser(): { id: string; email: string } | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setDemoUser(u: { id: string; email: string } | null) {
  try {
    if (u) sessionStorage.setItem(USER_KEY, JSON.stringify(u));
    else sessionStorage.removeItem(USER_KEY);
  } catch { /* ignore */ }
}

export function getTableToken() {
  try { return sessionStorage.getItem(TABLE_KEY); } catch { return null; }
}

export function setTableToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TABLE_KEY, token);
    else sessionStorage.removeItem(TABLE_KEY);
  } catch { /* ignore */ }
}
