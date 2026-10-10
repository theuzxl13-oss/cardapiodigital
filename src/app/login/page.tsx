import Image from "next/image";
import { LoginForm } from "./login-form";
import { asset } from "@/lib/asset";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "";
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
      </div>
    </main>
  );
}
