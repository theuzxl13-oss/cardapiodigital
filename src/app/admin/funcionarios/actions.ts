"use server";

import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const me = await getCurrentProfile();
  if (!me || me.role !== "admin") throw new Error("Apenas o administrador pode gerenciar funcionários");
  return me;
}

const createSchema = z.object({
  full_name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  role: z.enum(["admin", "manager", "cashier", "waiter", "kitchen"]),
});

/** Cria funcionário via Admin API (service_role usada somente no servidor). */
export async function createStaff(input: z.infer<typeof createSchema>): Promise<Result> {
  try {
    const me = await requireAdmin();
    const data = createSchema.parse(input);
    const { error } = await getServiceSupabase().auth.admin.createUser({
      email: data.email.toLowerCase(),
      password: data.password,
      email_confirm: true,
      app_metadata: { role: data.role, restaurant_id: me.restaurant_id, full_name: data.full_name },
      user_metadata: { full_name: data.full_name },
    });
    if (error) return { ok: false, error: error.message.includes("already") ? "E-mail já cadastrado" : error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "Dados inválidos (senha mínima de 8 caracteres)" : (e as Error).message };
  }
}

/** Bloqueia/desbloqueia o acesso: inativa o perfil e bane o login no Supabase Auth. */
export async function setStaffBlocked(userId: string, blocked: boolean): Promise<Result> {
  try {
    const me = await requireAdmin();
    if (userId === me.id) return { ok: false, error: "Você não pode bloquear o próprio acesso" };
    const svc = getServiceSupabase();
    const { error: e1 } = await svc.from("profiles").update({ active: !blocked }).eq("id", userId).eq("restaurant_id", me.restaurant_id);
    if (e1) return { ok: false, error: e1.message };
    const { error: e2 } = await svc.auth.admin.updateUserById(userId, { ban_duration: blocked ? "876000h" : "none" });
    if (e2) return { ok: false, error: e2.message };
    await svc.from("audit_log").insert({ restaurant_id: me.restaurant_id, actor_id: me.id, action: blocked ? "profile.block" : "profile.unblock", entity: "profiles", entity_id: userId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function resetStaffPassword(userId: string, password: string): Promise<Result> {
  try {
    const me = await requireAdmin();
    if (password.length < 8) return { ok: false, error: "A senha deve ter ao menos 8 caracteres" };
    const svc = getServiceSupabase();
    const { data: target } = await svc.from("profiles").select("restaurant_id").eq("id", userId).single();
    if (target?.restaurant_id !== me.restaurant_id) return { ok: false, error: "Funcionário não encontrado" };
    const { error } = await svc.auth.admin.updateUserById(userId, { password });
    if (error) return { ok: false, error: error.message };
    await svc.from("audit_log").insert({ restaurant_id: me.restaurant_id, actor_id: me.id, action: "profile.reset_password", entity: "profiles", entity_id: userId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
