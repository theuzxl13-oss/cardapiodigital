import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/staff/logout-button";

export default function AccessDenied() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <ShieldAlert className="size-12 text-destructive" />
      <h1 className="text-2xl font-semibold">Acesso negado</h1>
      <p className="max-w-md text-muted-foreground">Seu perfil não tem permissão para acessar esta área. Entre com outro usuário ou fale com o administrador.</p>
      <div className="flex gap-2">
        <Button asChild variant="outline"><Link href="/">Início</Link></Button>
        <LogoutButton />
      </div>
    </main>
  );
}
