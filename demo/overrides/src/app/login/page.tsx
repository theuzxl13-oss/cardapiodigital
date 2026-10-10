"use client";

import { Suspense } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { LoginForm } from "@/app/login/login-form";
import { asset } from "@/lib/asset";

function Inner() {
  const next = useSearchParams().get("next") ?? "";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-[#2a1a12] via-[#1b110d] to-black p-5">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-card p-7 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image src={asset("/brand/logo.svg")} alt="Logo" width={56} height={56} className="rounded-xl" />
          <div>
            <h1 className="font-display text-2xl font-semibold">Área do funcionário</h1>
            <p className="text-sm text-muted-foreground">Sabor &amp; Arte Bistrô</p>
          </div>
        </div>
        <LoginForm next={safeNext} />
        <p className="mt-4 text-center text-xs text-muted-foreground">Demonstração: use os atalhos acima (senha Demo@1234).</p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><Inner /></Suspense>;
}
