const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function money(value: number | string | null | undefined) {
  return brl.format(Number(value ?? 0));
}

export function time(value: string | Date | null | undefined) {
  if (!value) return "--:--";
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function dateTime(value: string | Date | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function date(value: string | Date | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

/** Minutos decorridos desde a data informada. */
export function minutesSince(value: string | Date, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000));
}

export function elapsedLabel(value: string | Date, now = Date.now()) {
  const m = minutesSince(value, now);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

export function pad(n: number | string, size = 2) {
  return String(n).padStart(size, "0");
}

/** Converte "12,50" ou "12.50" em número. */
export function parseMoney(input: string): number {
  const clean = input.replace(/[^\d,.-]/g, "");
  if (!/\d/.test(clean)) return NaN;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
