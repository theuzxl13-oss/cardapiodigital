import { NextResponse, type NextRequest } from "next/server";
import { getAnonSupabase } from "@/lib/supabase/server";
import { sessionCookieOptions } from "@/lib/table-session";
import { TABLE_SESSION_COOKIE } from "@/lib/config";

/** Chamado a partir do QR Code: valida o token da mesa e cria a sessão segura do cliente. */
export async function GET(request: NextRequest) {
  const k = request.nextUrl.searchParams.get("k") ?? "";
  const target = request.nextUrl.clone();
  target.pathname = "/menu";
  target.search = "";

  if (!/^[a-f0-9]{16,64}$/i.test(k)) {
    target.searchParams.set("erro", "QR Code inválido. Escaneie novamente o código da sua mesa.");
    return NextResponse.redirect(target);
  }
  const { data, error } = await getAnonSupabase().rpc("customer_open_session", {
    p_qr_token: k,
    p_user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
  if (error || !data) {
    target.searchParams.set("erro", error?.message ?? "Não foi possível abrir a mesa.");
    return NextResponse.redirect(target);
  }
  const s = data as { session_token: string; table_number: number; expires_in_hours: number };
  target.searchParams.set("mesa", String(s.table_number).padStart(2, "0"));
  const res = NextResponse.redirect(target);
  res.cookies.set(TABLE_SESSION_COOKIE, s.session_token, sessionCookieOptions(s.expires_in_hours));
  return res;
}
