"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/misc";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { AppRole, Profile } from "@/lib/types";

/** Demonstração estática: proteção das áreas restritas feita no navegador (no sistema real: proxy + servidor + RLS). */
export function StaffGuard({ roles, children }: { roles: AppRole[]; children: (profile: Profile) => React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      const sb = getBrowserSupabase();
      const { data: auth } = await sb.auth.getUser();
      if (!auth.user) return router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      const { data } = await sb.from("profiles").select("id, restaurant_id, full_name, email, role, active").eq("id", auth.user.id).maybeSingle();
      if (!data || !data.active) return router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      if (!roles.includes(data.role)) return router.replace("/acesso-negado");
      setProfile(data as Profile);
    })();
  }, [router, pathname, roles]);

  if (!profile) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center gap-2 text-muted-foreground">
        <Spinner /> Carregando…
      </div>
    );
  }
  return <>{children(profile)}</>;
}
