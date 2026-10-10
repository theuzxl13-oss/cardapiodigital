import Link from "next/link";
import Image from "next/image";
import { ChefHat, ClipboardList, Cuboid, LayoutDashboard, QrCode, Receipt, Smartphone, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_MODE, RESTAURANT_ID, SUPABASE_CONFIGURED } from "@/lib/config";
import { getServiceSupabase } from "@/lib/supabase/server";
import { asset } from "@/lib/asset";

export const dynamic = "force-dynamic";

const DEMO_USERS = [
  { role: "Administrador", email: "admin@saborarte.demo", area: "/admin", pin: "1234" },
  { role: "Caixa", email: "caixa1@saborarte.demo", area: "/caixa" },
  { role: "Caixa", email: "caixa2@saborarte.demo", area: "/caixa" },
  { role: "Garçom", email: "garcom1@saborarte.demo", area: "/garcom" },
  { role: "Garçom", email: "garcom2@saborarte.demo … garcom5", area: "/garcom" },
  { role: "Cozinha", email: "cozinha1@saborarte.demo", area: "/cozinha" },
  { role: "Cozinha", email: "cozinha2@saborarte.demo", area: "/cozinha" },
];

async function demoTables() {
  if (!DEMO_MODE || !process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const { data } = await getServiceSupabase()
      .from("dining_tables")
      .select("number, qr_token")
      .eq("restaurant_id", RESTAURANT_ID)
      .eq("active", true)
      .order("number");
    return data ?? [];
  } catch {
    return [];
  }
}

export default async function Home() {
  const tables = await demoTables();

  return (
    <main className="min-h-dvh">
      <section className="relative overflow-hidden bg-[#1b110d] text-[#fbeee0]">
        <Image src={asset("/brand/cover.svg")} alt="" fill className="object-cover opacity-90" priority />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-5 py-14 md:py-20">
          <div className="flex items-center gap-3">
            <Image src={asset("/brand/logo.svg")} alt="Logo" width={48} height={48} className="rounded-xl" />
            <div>
              <p className="font-display text-2xl font-semibold">Sabor &amp; Arte Bistrô</p>
              <p className="text-sm opacity-75">Plataforma digital do restaurante</p>
            </div>
            {DEMO_MODE && <Badge className="ml-auto bg-amber-400 text-amber-950">Modo demonstração</Badge>}
          </div>
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight md:text-5xl">
            Cardápio com realidade aumentada, pedidos pela mesa e gestão integrada em tempo real.
          </h1>
          <p className="max-w-2xl text-lg opacity-80">
            QR Code → Pedido → Cozinha → Garçom → Caixa → Relatórios. Todos os módulos compartilham o mesmo banco de dados.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/login">Área do funcionário</Link></Button>
            {tables.find((t) => t.number === 5) && (
              <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                <Link href={`/menu?mesa=05&k=${tables.find((t) => t.number === 5)!.qr_token}`}>
                  <Smartphone /> Abrir cardápio da Mesa 05
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-10 px-5 py-10">
        {!SUPABASE_CONFIGURED && (
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
            <CardHeader>
              <CardTitle>Configuração pendente</CardTitle>
              <CardDescription>
                Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (veja .env.example e README) para ativar o sistema.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: QrCode, title: "Cardápio QR + Pedidos", desc: "Cliente escaneia, pede, acompanha status, chama o garçom e solicita a conta.", href: tables[4] ? `/menu?mesa=05&k=${tables[4].qr_token}` : "/admin/qrcodes" },
            { icon: Cuboid, title: "Realidade aumentada", desc: "Botão “Visualizar na minha mesa” com WebXR, Scene Viewer (Android) e AR Quick Look (iOS).", href: tables[4] ? `/menu?mesa=05&k=${tables[4].qr_token}` : "/admin/produtos" },
            { icon: ClipboardList, title: "Painel do garçom", desc: "Mapa de mesas, lançamento de pedidos, notificações de pratos prontos e entregas.", href: "/garcom" },
            { icon: ChefHat, title: "Cozinha (KDS)", desc: "Cartões por status, tempo decorrido, prioridade, alertas sonoros e histórico.", href: "/cozinha" },
            { icon: Receipt, title: "Caixa (PDV)", desc: "Comandas, divisão de conta, pagamentos combinados, troco, sangria e fechamento.", href: "/caixa" },
            { icon: LayoutDashboard, title: "Administração", desc: "Indicadores, cardápio, mesas e QR Codes, funcionários, estoque e relatórios PDF/Excel.", href: "/admin" },
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

        {DEMO_MODE && (
          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><UserRound className="size-5" /> Acessos de demonstração</CardTitle>
                <CardDescription>Senha padrão: <code className="rounded bg-muted px-1.5 py-0.5">Demo@1234</code> (definida em DEMO_PASSWORD). PIN de gerente do administrador: <code className="rounded bg-muted px-1.5 py-0.5">1234</code>.</CardDescription>
              </CardHeader>
              <CardContent className="divide-y text-sm">
                {DEMO_USERS.map((u) => (
                  <div key={u.email} className="flex items-center justify-between gap-3 py-2">
                    <span className="font-medium">{u.role}</span>
                    <span className="truncate text-muted-foreground">{u.email}</span>
                    <Link className="text-primary hover:underline" href={`/login?next=${u.area}`}>{u.area}</Link>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Smartphone className="size-5" /> Mesas (links dos QR Codes)</CardTitle>
                <CardDescription>
                  Em operação real o cliente chega aqui escaneando o QR Code impresso. Cada link contém um token secreto da mesa.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tables.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Configure SUPABASE_SERVICE_ROLE_KEY para listar os links aqui, ou gere os QR Codes em Administração → QR Codes.
                  </p>
                ) : (
                  <div className="grid grid-cols-5 gap-2">
                    {tables.map((t) => (
                      <Link key={t.number} href={`/menu?mesa=${String(t.number).padStart(2, "0")}&k=${t.qr_token}`}
                        className="rounded-lg border bg-card py-2 text-center text-sm font-semibold transition hover:border-primary hover:text-primary">
                        {String(t.number).padStart(2, "0")}
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        )}
        <p className="text-center text-xs text-muted-foreground">
          Dados, nomes e endereço exibidos são fictícios e destinados à demonstração comercial.
        </p>
      </div>
    </main>
  );
}
