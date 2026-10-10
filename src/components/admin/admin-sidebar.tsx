"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  BarChart3, Boxes, ChefHat, ClipboardList, FileClock, LayoutDashboard, Menu, QrCode, Receipt, Settings, Table2, UtensilsCrossed, Users, X,
} from "lucide-react";
import { LogoutButton } from "@/components/staff/logout-button";
import { ROLE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/produtos", label: "Cardápio", icon: UtensilsCrossed },
  { href: "/admin/mesas", label: "Mesas", icon: Table2 },
  { href: "/admin/qrcodes", label: "QR Codes", icon: QrCode },
  { href: "/admin/funcionarios", label: "Funcionários", icon: Users, adminOnly: true },
  { href: "/admin/estoque", label: "Estoque", icon: Boxes },
  { href: "/admin/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/admin/auditoria", label: "Auditoria", icon: FileClock },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings, adminOnly: true },
];
const OPS = [
  { href: "/garcom", label: "Garçom", icon: ClipboardList },
  { href: "/cozinha", label: "Cozinha", icon: ChefHat },
  { href: "/caixa", label: "Caixa", icon: Receipt },
];

export function AdminSidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const link = (item: { href: string; label: string; icon: typeof Menu }) => {
    const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
    return (
      <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
        className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition", active ? "bg-white/12 font-medium text-white" : "text-white/65 hover:bg-white/8 hover:text-white")}>
        <item.icon className="size-4" /> {item.label}
      </Link>
    );
  };
  return (
    <>
      <div className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-sidebar px-4 text-sidebar-foreground lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu /></button>
        <span className="font-semibold">Administração</span>
      </div>
      {open && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cn("no-print fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center gap-2.5 p-4">
          <Image src="/brand/logo.svg" alt="Logo" width={34} height={34} className="rounded-lg" />
          <div className="leading-tight">
            <p className="font-display font-semibold">Sabor &amp; Arte</p>
            <p className="text-xs text-white/50">Administração</p>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar"><X className="size-5" /></button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {NAV.filter((n) => !n.adminOnly || profile.role === "admin").map(link)}
          <p className="px-3 pb-1 pt-5 text-[11px] uppercase tracking-wider text-white/40">Operação</p>
          {OPS.map(link)}
        </nav>
        <div className="border-t border-white/10 p-4">
          <p className="text-sm font-medium">{profile.full_name}</p>
          <p className="mb-3 text-xs text-white/50">{ROLE_LABEL[profile.role]}</p>
          <LogoutButton variant="secondary" size="sm" className="w-full" />
        </div>
      </aside>
    </>
  );
}
