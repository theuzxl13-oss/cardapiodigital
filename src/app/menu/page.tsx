import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { QrCode } from "lucide-react";
import { MenuApp, type CustomerState } from "@/components/menu/menu-app";
import { getAnonSupabase } from "@/lib/supabase/server";
import { readTableToken } from "@/lib/table-session";
import { RESTAURANT_ID, SUPABASE_CONFIGURED } from "@/lib/config";
import type { Category, Product, Restaurant } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cardápio" };

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-[#1b110d] p-8 text-center text-[#fbeee0]">
      <Image src="/brand/logo.svg" alt="Logo" width={64} height={64} className="rounded-2xl" />
      <QrCode className="size-14 opacity-80" />
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      <p className="max-w-sm opacity-80">{message}</p>
    </main>
  );
}

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ mesa?: string; k?: string; erro?: string }> }) {
  const { mesa, k, erro } = await searchParams;
  if (!SUPABASE_CONFIGURED) return <Notice title="Sistema não configurado" message="Configure as variáveis do Supabase para usar o cardápio." />;
  if (erro) return <Notice title="Não foi possível abrir a mesa" message={erro} />;

  const supabase = getAnonSupabase();
  const token = await readTableToken();
  let state: CustomerState | null = null;
  let stateError: string | null = null;
  if (token) {
    const { data, error } = await supabase.rpc("customer_get_state", { p_session_token: token });
    if (error) stateError = error.message;
    else state = data as CustomerState;
  }

  const requested = mesa ? Number(mesa) : null;
  // QR Code escaneado: reaproveita a sessão se já for desta mesa; senão cria uma nova.
  if (k) {
    if (state && requested === state.table.number) redirect(`/menu?mesa=${mesa}`);
    redirect(`/api/mesa/entrar?k=${encodeURIComponent(k)}`);
  }
  if (!state) {
    return <Notice title="Escaneie o QR Code da sua mesa" message={stateError ?? "Para fazer pedidos, aponte a câmera do celular para o QR Code que está na mesa."} />;
  }
  if (requested !== null && requested !== state.table.number) {
    return (
      <Notice
        title="Mesa diferente da sua sessão"
        message={`Este aparelho está vinculado à Mesa ${String(state.table.number).padStart(2, "0")}. Para pedir em outra mesa, escaneie o QR Code dela.`}
      />
    );
  }

  const [{ data: restaurant }, { data: categories }, { data: products }] = await Promise.all([
    supabase.from("restaurants").select("*").eq("id", RESTAURANT_ID).single(),
    supabase.from("categories").select("*").eq("restaurant_id", RESTAURANT_ID).eq("active", true).order("sort_order"),
    supabase
      .from("products")
      .select("*, modifier_groups(*, modifier_options(*))")
      .eq("restaurant_id", RESTAURANT_ID)
      .eq("active", true)
      .is("deleted_at", null)
      .order("sort_order"),
  ]);

  return (
    <MenuApp
      restaurant={restaurant as Restaurant}
      categories={(categories ?? []) as Category[]}
      initialProducts={(products ?? []) as Product[]}
      initialState={state}
    />
  );
}
