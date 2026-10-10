"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChefHat, ClipboardList, Cuboid, LayoutDashboard, QrCode, Receipt, Smartphone, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { serviceQuery } from "@/lib/demo/mock-client";
import { asset } from "@/lib/asset";

const USERS = [
  { role: "Administrador", email: "admin@saborarte.demo", area: "/admin", hint: "PIN de gerente: 1234" },
  { role: "Caixa", email: "caixa1@saborarte.demo", area: "/caixa" },
  { role: "Cozinha", email: "cozinha1@saborarte.demo", area: "/cozinha" },
  { role: "Garçom", email: "garcom1@saborarte.demo", area: "/garcom" },
];

export default function Home() {
  const [tables, setTables] = useState<{ number: number; qr_token: string }[]>([]);
  useEffect(() => {
    serviceQuery<{ number: number; qr_token: string }>("select number, qr_token from public.dining_tables where active order by number")
      .then(setTables)
      .catch(() => {});
  }, []);
  const mesa = (n: number) => {
    const t = tables.find((x) => x.number === n);
    return t ? `/menu?mesa=${String(n).padStart(2, "0")}&k=${t.qr_token}` : "/";
  };

  return (
    <main className="min-h-dvh">
      <section className="relative overflow-hidden bg-[#1b110d] text-[#fbeee0]">
        <Image src={asset("/brand/cover.svg")} alt="" fill className="object-cover opacity-90" priority />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-5 py-12 md:py-16">
          <div className="flex items-center gap-3">
            <Image src={asset("/brand/logo.svg")} alt="Logo" width={48} height={48} className="rounded-xl" />
            <div>
              <p className="font-display text-2xl font-semibold">Sabor &amp; Arte Bistrô</p>
              <p className="text-sm opacity-75">Plataforma digital do restaurante</p>
            </div>
          </div>
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight md:text-5xl">
            Cardápio com realidade aumentada, pedidos pela mesa e gestão integrada.
          </h1>
          <p className="max-w-2xl text-lg opacity-80">Experimente o fluxo completo: QR Code → Pedido → Cozinha → Garçom → Caixa → Relatórios.</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href={mesa(5)}><Smartphone /> Abrir cardápio da Mesa 05</Link></Button>
            <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              <Link href="/login">Área do funcionário</Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-8 px-5 py-10">
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Como testar (2 minutos)</CardTitle>
            <CardDescription>Use abas diferentes do mesmo navegador — todas compartilham o mesmo banco de dados.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2 text-sm md:grid-cols-2">
              <li><b>1.</b> Aba 1: <Link className="text-primary underline" href={mesa(5)}>cardápio da Mesa 05</Link> → toque em <b>Ver na mesa</b> (3D/AR) → peça um hambúrguer.</li>
              <li><b>2.</b> Aba 2: entre como <b>cozinha1</b> → <b>Iniciar preparo</b> → <b>Pronto</b>.</li>
              <li><b>3.</b> Aba 3: entre como <b>garcom1</b> → o pedido aparece em “Prontos” → <b>Entregue</b>.</li>
              <li><b>4.</b> Aba 1: <b>Conta → Solicitar fechamento</b>.</li>
              <li><b>5.</b> Aba 4: entre como <b>caixa1</b> → <b>Abrir caixa</b> → Mesa 05 → pagamento → <b>Encerrar comanda</b>.</li>
              <li><b>6.</b> Entre como <b>admin</b> para ver dashboard, relatórios, estoque e QR Codes.</li>
            </ol>
          </CardContent>
        </Card>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: QrCode, title: "Cardápio QR + Pedidos", desc: "O cliente pede, acompanha o status, chama o garçom e pede a conta.", href: mesa(5) },
            { icon: Cuboid, title: "Realidade aumentada", desc: "“Visualizar na minha mesa”: AR no celular (Android/iPhone) e 3D no computador.", href: mesa(5) },
            { icon: ClipboardList, title: "Painel do garçom", desc: "Mapa de mesas, lançamento de pedidos e aviso de pratos prontos.", href: "/login?next=/garcom" },
            { icon: ChefHat, title: "Cozinha (KDS)", desc: "Pedidos por status, tempo decorrido, prioridade e alerta sonoro.", href: "/login?next=/cozinha" },
            { icon: Receipt, title: "Caixa (PDV)", desc: "Divisão de conta, pagamentos combinados, troco e fechamento.", href: "/login?next=/caixa" },
            { icon: LayoutDashboard, title: "Administração", desc: "Dashboard, cardápio, QR Codes, funcionários, estoque e relatórios.", href: "/login?next=/admin" },
          ].map((m) => (
            <Link key={m.title} href={m.href} className="group">
              <Card className="h-full transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                <CardHeader>
                  <m.icon className="size-7 text-primary" />
                  <CardTitle className="text-lg">{m.title}</CardTitle>
                  <CardDescription>{m.desc}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><UserRound className="size-5" /> Acessos de demonstração</CardTitle>
              <CardDescription>Senha de todos: <code className="rounded bg-muted px-1.5 py-0.5">Demo@1234</code> (a tela de login tem atalhos).</CardDescription>
            </CardHeader>
            <CardContent className="divide-y text-sm">
              {USERS.map((u) => (
                <div key={u.email} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-medium">{u.role}{u.hint && <Badge variant="secondary" className="ml-2">{u.hint}</Badge>}</span>
                  <Link className="truncate text-primary hover:underline" href={`/login?next=${u.area}`}>{u.email}</Link>
                </div>
              ))}
              <p className="pt-2 text-xs text-muted-foreground">Também existem caixa2, cozinha2 e garcom2 … garcom5.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Smartphone className="size-5" /> Mesas (links dos QR Codes)</CardTitle>
              <CardDescription>No restaurante o cliente chega aqui escaneando o QR Code impresso na mesa.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2">
                {tables.map((t) => (
                  <Link key={t.number} href={mesa(t.number)}
                    className="rounded-lg border bg-card py-2 text-center text-sm font-semibold transition hover:border-primary hover:text-primary">
                    {String(t.number).padStart(2, "0")}
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
        <p className="text-center text-xs text-muted-foreground">
          Nesta demonstração os dados ficam no seu navegador (não são compartilhados entre aparelhos). Nomes e endereço são fictícios.
        </p>
      </div>
    </main>
  );
}
