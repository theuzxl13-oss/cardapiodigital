"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { QrCode } from "lucide-react";
import { MenuApp, type CustomerState } from "@/components/menu/menu-app";
import { Spinner } from "@/components/ui/misc";
import { anonRpc } from "@/lib/demo/mock-client";
import { getTableToken, setTableToken } from "@/lib/demo/session";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { RESTAURANT_ID } from "@/lib/config";
import { asset } from "@/lib/asset";
import type { Category, Product, Restaurant } from "@/lib/types";

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-[#1b110d] p-8 text-center text-[#fbeee0]">
      <Image src={asset("/brand/logo.svg")} alt="Logo" width={64} height={64} className="rounded-2xl" />
      <QrCode className="size-14 opacity-80" />
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      <p className="max-w-sm opacity-80">{message}</p>
    </main>
  );
}

interface Loaded { restaurant: Restaurant; categories: Category[]; products: Product[]; state: CustomerState }

function MenuInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const k = sp.get("k");
      const mesa = sp.get("mesa");
      const requested = mesa ? Number(mesa) : null;

      // QR Code escaneado: reaproveita a sessão desta mesa ou cria uma nova
      if (k) {
        const current = getTableToken();
        if (current) {
          const r = await anonRpc<CustomerState>("customer_get_state", { p_session_token: current });
          if (!r.error && r.data && r.data.table.number === requested) return router.replace(`/menu?mesa=${mesa}`);
        }
        const r = await anonRpc<{ session_token: string; table_number: number }>("customer_open_session", {
          p_qr_token: k, p_user_agent: navigator.userAgent.slice(0, 300),
        });
        if (r.error || !r.data) return setNotice({ title: "Não foi possível abrir a mesa", message: r.error?.message ?? "Erro" });
        setTableToken(r.data.session_token);
        return router.replace(`/menu?mesa=${String(r.data.table_number).padStart(2, "0")}`);
      }

      const token = getTableToken();
      if (!token) return setNotice({ title: "Escaneie o QR Code da sua mesa", message: "Na demonstração, abra a página inicial e escolha uma mesa." });
      const st = await anonRpc<CustomerState>("customer_get_state", { p_session_token: token });
      if (st.error || !st.data) return setNotice({ title: "Escaneie o QR Code da sua mesa", message: st.error?.message ?? "Sessão não encontrada." });
      if (requested !== null && requested !== st.data.table.number) {
        return setNotice({
          title: "Mesa diferente da sua sessão",
          message: `Este aparelho está vinculado à Mesa ${String(st.data.table.number).padStart(2, "0")}. Para pedir em outra mesa, escaneie o QR Code dela.`,
        });
      }
      const sb = getBrowserSupabase();
      const [restaurant, categories, products] = await Promise.all([
        sb.from("restaurants").select("*").eq("id", RESTAURANT_ID).single(),
        sb.from("categories").select("*").eq("restaurant_id", RESTAURANT_ID).eq("active", true).order("sort_order"),
        sb.from("products").select("*, modifier_groups(*, modifier_options(*))").eq("restaurant_id", RESTAURANT_ID).eq("active", true).is("deleted_at", null).order("sort_order"),
      ]);
      if (cancelled) return;
      setNotice(null);
      setData({ restaurant: restaurant.data, categories: categories.data ?? [], products: products.data ?? [], state: st.data });
    })();
    return () => { cancelled = true; };
  }, [sp, router]);

  if (notice) return <Notice {...notice} />;
  if (!data) return <div className="flex min-h-[70dvh] items-center justify-center gap-2 text-muted-foreground"><Spinner /> Abrindo o cardápio…</div>;
  return <MenuApp key={data.state.tab.id} restaurant={data.restaurant} categories={data.categories} initialProducts={data.products} initialState={data.state} />;
}

export default function MenuPage() {
  return <Suspense><MenuInner /></Suspense>;
}
