"use client";

import { useEffect, useState } from "react";
import { Database, RotateCcw } from "lucide-react";
import { getDb, resetDemo } from "@/lib/demo/db";

/** Faixa de aviso da demonstração + tela de preparação do banco no primeiro acesso. */
export function DemoChrome() {
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const onLoading = (e: Event) => setLoading((e as CustomEvent<boolean>).detail);
    window.addEventListener("demo-db-loading", onLoading);
    getDb().catch((err) => console.error("Falha ao iniciar o banco da demonstração", err));
    const t = setTimeout(() => setSlow(true), 4000);
    return () => { window.removeEventListener("demo-db-loading", onLoading); clearTimeout(t); };
  }, []);

  return (
    <>
      <div className="no-print flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-400 px-3 py-1.5 text-center text-xs font-medium text-amber-950">
        <span>
          <b>Versão de demonstração</b>
          <span className="hidden sm:inline"> · dados fictícios salvos só neste navegador · abra cliente, cozinha, garçom e caixa em <b>abas diferentes</b></span>
        </span>
        <button
          className="inline-flex items-center gap-1 rounded-full bg-amber-950/10 px-2 py-0.5 hover:bg-amber-950/20"
          onClick={() => confirm("Restaurar os dados originais da demonstração? Pedidos e alterações feitos serão apagados.") && resetDemo()}
        >
          <RotateCcw className="size-3" /> Restaurar dados
        </button>
      </div>
      {loading && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-[#1b110d]/95 p-6 text-center text-[#fbeee0]">
          <Database className="size-10 animate-pulse" />
          <p className="font-display text-xl">Preparando o banco de dados…</p>
          <p className="max-w-sm text-sm opacity-75">
            Esta demonstração roda um PostgreSQL completo dentro do seu navegador, com as mesmas regras do sistema real.
            {slow && " No primeiro acesso o download pode levar alguns segundos."}
          </p>
        </div>
      )}
    </>
  );
}
