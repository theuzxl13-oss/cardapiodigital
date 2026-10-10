import "server-only";
import { redirect } from "next/navigation";
import { getServerSupabase } from "./supabase/server";
import type { AppRole, Profile } from "./types";

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, restaurant_id, full_name, email, role, active")
    .eq("id", auth.user.id)
    .maybeSingle();
  return data && data.active ? (data as Profile) : null;
}

/** Usado nos layouts das áreas restritas (defesa adicional ao proxy e ao RLS). */
export async function requireRole(roles: AppRole[], next: string): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!roles.includes(profile.role)) redirect("/acesso-negado");
  return profile;
}
