import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Áreas restritas e papéis permitidos. A validação definitiva ocorre no banco (RLS + funções). */
const PROTECTED: { prefix: string; roles: string[] }[] = [
  { prefix: "/admin", roles: ["admin", "manager"] },
  { prefix: "/caixa", roles: ["admin", "manager", "cashier"] },
  { prefix: "/cozinha", roles: ["admin", "manager", "kitchen"] },
  { prefix: "/garcom", roles: ["admin", "manager", "waiter"] },
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return response;

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const area = PROTECTED.find((p) => path === p.prefix || path.startsWith(p.prefix + "/"));
  if (!area) return response;

  if (!data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", data.user.id).maybeSingle();
  if (!profile || !profile.active || !area.roles.includes(profile.role)) {
    const url = request.nextUrl.clone();
    url.pathname = "/acesso-negado";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/caixa/:path*", "/cozinha/:path*", "/garcom/:path*", "/login"],
};
