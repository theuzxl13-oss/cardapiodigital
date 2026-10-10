"use client";

/** Demonstração: equivalentes das Server Actions (no sistema real usam a Admin API do Supabase no servidor). */
import { notifyChange } from "@/lib/demo/db";
import { serviceQuery } from "@/lib/demo/mock-client";
import { getDemoUser } from "@/lib/demo/session";

type Result = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const me = getDemoUser();
  const rows = me ? await serviceQuery<{ role: string; restaurant_id: string }>("select role, restaurant_id::text from public.profiles where id = $1 and active", [me.id]) : [];
  if (!me || rows[0]?.role !== "admin") throw new Error("Apenas o administrador pode gerenciar funcionários");
  return { ...me, restaurant_id: rows[0].restaurant_id };
}

export async function createStaff(input: { full_name: string; email: string; password: string; role: string }): Promise<Result> {
  try {
    const me = await requireAdmin();
    if (input.password.length < 8) return { ok: false, error: "Senha mínima de 8 caracteres" };
    const exists = await serviceQuery("select 1 from auth.users where lower(email) = lower($1)", [input.email]);
    if (exists.length) return { ok: false, error: "E-mail já cadastrado" };
    await serviceQuery(
      "insert into auth.users (email, raw_app_meta_data, demo_password) values (lower($1), $2::jsonb, $3)",
      [input.email, JSON.stringify({ role: input.role, restaurant_id: me.restaurant_id, full_name: input.full_name }), input.password],
    );
    notifyChange(["profiles"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function setStaffBlocked(userId: string, blocked: boolean): Promise<Result> {
  try {
    const me = await requireAdmin();
    if (userId === me.id) return { ok: false, error: "Você não pode bloquear o próprio acesso" };
    await serviceQuery("update public.profiles set active = $2 where id = $1", [userId, !blocked]);
    notifyChange(["profiles"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function resetStaffPassword(userId: string, password: string): Promise<Result> {
  try {
    await requireAdmin();
    if (password.length < 8) return { ok: false, error: "A senha deve ter ao menos 8 caracteres" };
    await serviceQuery("update auth.users set demo_password = $2 where id = $1", [userId, password]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
