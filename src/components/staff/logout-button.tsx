"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { getBrowserSupabase } from "@/lib/supabase/client";

export function LogoutButton({ variant = "outline", size, className, label = "Sair" }: Pick<ButtonProps, "variant" | "size" | "className"> & { label?: string }) {
  const router = useRouter();
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={async () => {
        await getBrowserSupabase().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      <LogOut /> {label}
    </Button>
  );
}
