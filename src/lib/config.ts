export const RESTAURANT_ID = process.env.NEXT_PUBLIC_RESTAURANT_ID ?? "00000000-0000-4000-a000-000000000001";
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const SUPABASE_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const TABLE_SESSION_COOKIE = "mesa_sessao";

export function tableUrl(number: number, token: string) {
  return `${SITE_URL}/menu?mesa=${String(number).padStart(2, "0")}&k=${token}`;
}
