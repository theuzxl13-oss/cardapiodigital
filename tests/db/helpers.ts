import { Pool, type PoolClient } from "pg";
import { randomUUID } from "node:crypto";

export const DATABASE_URL = process.env.DATABASE_URL ?? "";
export const RESTAURANT_ID = "00000000-0000-4000-a000-000000000001";
export const hasDb = DATABASE_URL.length > 0;

export const pool = hasDb ? new Pool({ connectionString: DATABASE_URL, max: 6 }) : (null as unknown as Pool);

type Query = <T = any>(sql: string, params?: unknown[]) => Promise<T[]>;

/** Executa como superusuário (equivalente ao service_role). */
export async function admin<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(sql, params);
  return r.rows as T[];
}

/** Executa um bloco simulando a requisição de um usuário do Supabase (RLS ativo). */
export async function as<T>(
  user: { id: string } | "anon",
  fn: (q: Query) => Promise<T>,
): Promise<T> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("begin");
    if (user === "anon") {
      await client.query("set local role anon");
      await client.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)");
    } else {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: user.id, role: "authenticated" }),
      ]);
    }
    const q: Query = async (sql, params = []) => (await client.query(sql, params)).rows;
    const result = await fn(q);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export async function rpc<T = any>(user: { id: string } | "anon", fn: string, args: Record<string, unknown>): Promise<T> {
  const names = Object.keys(args);
  const sql = `select to_jsonb(r) as result from public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) r`;
  return as(user, async (q) => {
    const rows = await q(sql, names.map((n) => normalize(args[n])));
    const v = rows[0]?.result;
    // Funções que retornam jsonb chegam embrulhadas como {fn: ...}
    if (v && typeof v === "object" && fn in v && Object.keys(v).length === 1) return v[fn];
    return v;
  });
}

function normalize(v: unknown) {
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  return v;
}

export async function createUser(role: string, name: string) {
  const id = randomUUID();
  await admin(
    `insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3)`,
    [id, `${role}-${id.slice(0, 8)}@teste.local`, JSON.stringify({ role, restaurant_id: RESTAURANT_ID, full_name: name })],
  );
  return { id, role, name };
}

export async function tableByNumber(n: number) {
  const rows = await admin<{ id: string; qr_token: string }>(
    `select id, qr_token from dining_tables where restaurant_id = $1 and number = $2`,
    [RESTAURANT_ID, n],
  );
  return rows[0];
}

export async function productByName(name: string) {
  const rows = await admin<{ id: string; price: string }>(`select id, price from products where name = $1`, [name]);
  return rows[0];
}

export async function optionByName(productName: string, optionName: string) {
  const rows = await admin<{ id: string }>(
    `select o.id from modifier_options o join modifier_groups g on g.id = o.group_id
       join products p on p.id = g.product_id where p.name = $1 and o.name = $2`,
    [productName, optionName],
  );
  return rows[0].id;
}

export const key = () => randomUUID();

/** Libera a mesa (fecha comanda ativa à força) para isolar cenários. */
export async function resetTable(n: number) {
  await admin(
    `update tabs set status = 'cancelled', closed_at = now() where status in ('open','closing')
       and table_id = (select id from dining_tables where restaurant_id = $1 and number = $2)`,
    [RESTAURANT_ID, n],
  );
}
