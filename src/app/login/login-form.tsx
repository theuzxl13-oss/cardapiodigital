"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { ROLE_HOME } from "@/lib/labels";
import type { AppRole } from "@/lib/types";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = getBrowserSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) {
      setLoading(false);
      toast.error(error?.message === "Invalid login credentials" ? "E-mail ou senha incorretos" : error?.message ?? "Falha no login");
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", data.user.id).maybeSingle();
    if (!profile || !profile.active) {
      await supabase.auth.signOut();
      setLoading(false);
      toast.error("Usuário sem perfil de funcionário ativo. Fale com o administrador.");
      return;
    }
    router.replace(next || ROLE_HOME[profile.role as AppRole]);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="E-mail">
        <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@restaurante.com" />
      </Field>
      <Field label="Senha">
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" disabled={loading}>
        {loading && <Spinner />} Entrar
      </Button>
      {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            ["Admin", "admin@saborarte.demo"],
            ["Caixa", "caixa1@saborarte.demo"],
            ["Garçom", "garcom1@saborarte.demo"],
            ["Cozinha", "cozinha1@saborarte.demo"],
          ].map(([label, mail]) => (
            <button key={mail} type="button" className="rounded-md border px-2 py-1.5 hover:bg-muted"
              onClick={() => { setEmail(mail); setPassword("Demo@1234"); }}>
              Demo: {label}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
