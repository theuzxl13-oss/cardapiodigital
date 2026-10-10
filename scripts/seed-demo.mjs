#!/usr/bin/env node
/**
 * Cria os funcionários de demonstração (Supabase Admin API) e gera pedidos/histórico fictícios.
 * Requer: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (em .env.local ou no ambiente).
 * Idempotente: usuários existentes são mantidos; o histórico só é gerado uma vez.
 *
 * Uso: npm run seed:demo
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const restaurantId = process.env.NEXT_PUBLIC_RESTAURANT_ID ?? "00000000-0000-4000-a000-000000000001";
const password = process.env.DEMO_PASSWORD ?? "Demo@1234";
if (!url || !key) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (veja .env.example).");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const STAFF = [
  { email: "admin@saborarte.demo", name: "Ana Administradora", role: "admin", pin: "1234" },
  { email: "caixa1@saborarte.demo", name: "Carlos Caixa", role: "cashier" },
  { email: "caixa2@saborarte.demo", name: "Camila Caixa", role: "cashier" },
  { email: "cozinha1@saborarte.demo", name: "Chef Roberto", role: "kitchen" },
  { email: "cozinha2@saborarte.demo", name: "Júlia Cozinha", role: "kitchen" },
  { email: "garcom1@saborarte.demo", name: "Gabriel Garçom", role: "waiter" },
  { email: "garcom2@saborarte.demo", name: "Mariana Garçonete", role: "waiter" },
  { email: "garcom3@saborarte.demo", name: "Pedro Garçom", role: "waiter" },
  { email: "garcom4@saborarte.demo", name: "Larissa Garçonete", role: "waiter" },
  { email: "garcom5@saborarte.demo", name: "Thiago Garçom", role: "waiter" },
];

async function findUser(email) {
  for (let page = 1; page < 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email === email);
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

const { data: rest, error: restErr } = await sb.from("restaurants").select("id, name").eq("id", restaurantId).maybeSingle();
if (restErr || !rest) {
  console.error("Restaurante não encontrado. Aplique as migrações e o supabase/seed.sql antes.", restErr?.message ?? "");
  process.exit(1);
}
console.log(`Restaurante: ${rest.name}`);

for (const s of STAFF) {
  let user = await findUser(s.email);
  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({
      email: s.email, password, email_confirm: true,
      app_metadata: { role: s.role, restaurant_id: restaurantId, full_name: s.name },
      user_metadata: { full_name: s.name },
    });
    if (error) throw new Error(`${s.email}: ${error.message}`);
    user = data.user;
    console.log(`✓ criado ${s.email} (${s.role})`);
  } else {
    console.log(`· já existe ${s.email}`);
  }
  // Garante o perfil (caso o usuário tenha sido criado antes da migração)
  await sb.from("profiles").upsert({ id: user.id, restaurant_id: restaurantId, full_name: s.name, email: s.email, role: s.role, active: true }, { onConflict: "id", ignoreDuplicates: true });
  if (s.pin) {
    const { error } = await sb.rpc("demo_set_pin", { p_user_id: user.id, p_pin: s.pin });
    if (error) console.warn(`  PIN não definido: ${error.message}`);
  }
}

const hist = await sb.rpc("demo_generate_history", { p_days: Number(process.env.DEMO_DAYS ?? 30) });
if (hist.error) throw hist.error;
console.log("Histórico:", hist.data);

const { count } = await sb.from("orders").select("id", { count: "exact", head: true }).in("status", ["received", "preparing", "ready"]);
if (!count) {
  const live = await sb.rpc("demo_generate_live_orders");
  if (live.error) throw live.error;
  console.log("Pedidos ao vivo:", live.data);
} else {
  console.log(`· já existem ${count} pedidos em andamento`);
}
console.log(`\nPronto! Senha dos usuários: ${password} · PIN do administrador: 1234`);
