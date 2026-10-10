"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChefHat, ClipboardList, LayoutDashboard, Receipt } from "lucide-react";
import { LogoutButton } from "./logout-button";
import { ROLE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { asset } from "@/lib/asset";

const MODULES = [
  { href: "/garcom", label: "Garçom", icon: ClipboardList, roles: ["admin", "manager", "waiter"] },
  { href: "/cozinha", label: "Cozinha", icon: ChefHat, roles: ["admin", "manager", "kitchen"] },
  { href: "/caixa", label: "Caixa", icon: Receipt, roles: ["admin", "manager", "cashier"] },
  { href: "/admin", label: "Admin", icon: LayoutDashboard, roles: ["admin", "manager"] },
];

export function StaffTopbar({ profile, title, dark, children }: { profile: Profile; title: string; dark?: boolean; children?: React.ReactNode }) {
  const pathname = usePathname();
  const modules = MODULES.filter((m) => m.roles.includes(profile.role));
  return (
    <header className={cn("sticky top-0 z-30 border-b backdrop-blur no-print", dark ? "border-white/10 bg-black/80 text-white" : "bg-background/90")}>
      <div className="flex h-14 items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2">
          <Image src={asset("/brand/logo.svg")} alt="Logo" width={30} height={30} className="rounded-lg" />
          <span className="hidden font-semibold sm:inline">{title}</span>
        </Link>
        {modules.length > 1 && (
          <nav className="flex gap-1">
            {modules.map((m) => (
              <Link key={m.href} href={m.href}
                className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition",
                  pathname.startsWith(m.href) ? (dark ? "bg-white/15" : "bg-muted") : "opacity-70 hover:opacity-100")}>
                <m.icon className="size-4" /> <span className="hidden md:inline">{m.label}</span>
              </Link>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2">
          {children}
          <div className="hidden text-right text-xs leading-tight sm:block">
            <p className="font-medium">{profile.full_name}</p>
            <p className="opacity-60">{ROLE_LABEL[profile.role]}</p>
          </div>
          <LogoutButton variant="ghost" size="sm" label="" />
        </div>
      </div>
    </header>
  );
}
