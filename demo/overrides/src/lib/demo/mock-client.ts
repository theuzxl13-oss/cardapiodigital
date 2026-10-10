"use client";

/**
 * Adaptador com a mesma interface usada do supabase-js, executando no PostgreSQL do
 * navegador (PGlite) com as MESMAS migrações, funções e políticas RLS do sistema real.
 * Implementa apenas o subconjunto da API usado pelo projeto.
 */
import { notifyChange, onChange, runAs, type DemoUser } from "./db";
import { getDemoUser, setDemoUser } from "./session";

type PgError = { message: string; code?: string; details?: string; hint?: string };
type Result<T = unknown> = { data: T | null; error: PgError | null; count?: number | null };

const IDENT = /^[a-z_][a-z0-9_]*$/;
function q(name: string) {
  if (!IDENT.test(name)) throw new Error(`Identificador inválido: ${name}`);
  return `"${name}"`;
}

function toError(e: unknown): PgError {
  const err = e as { message?: string; code?: string; detail?: string; hint?: string };
  return { message: err?.message ?? String(e), code: err?.code, details: err?.detail, hint: err?.hint };
}

/** Funções voláteis que apenas leem dados (não disparam atualização das outras telas). */
const READ_ONLY_FNS = new Set(["customer_get_state"]);

// --- Metadados do banco (FKs, PKs, funções) ------------------------------------------
interface Meta {
  fks: { child: string; parent: string; fk: string; ref: string }[];
  pks: Record<string, string[]>;
  fns: Record<string, { retset: boolean; composite: boolean; readonly: boolean }>;
}
let metaPromise: Promise<Meta> | null = null;
function meta(): Promise<Meta> {
  metaPromise ??= runAs("service", async (tx) => {
    const fks = await tx.query<Meta["fks"][number]>(`
      select cl.relname as child, pl.relname as parent, a.attname as fk, af.attname as ref
        from pg_constraint c
        join pg_class cl on cl.oid = c.conrelid join pg_class pl on pl.oid = c.confrelid
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
       where c.contype = 'f' and c.connamespace = 'public'::regnamespace and cardinality(c.conkey) = 1`);
    const pks = await tx.query<{ t: string; cols: string[] }>(`
      select cl.relname as t, array_agg(a.attname::text order by a.attnum) as cols
        from pg_constraint c join pg_class cl on cl.oid = c.conrelid
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.contype = 'p' and c.connamespace = 'public'::regnamespace group by cl.relname`);
    const fns = await tx.query<{ name: string; retset: boolean; composite: boolean; readonly: boolean }>(`
      select p.proname as name, p.proretset as retset, (t.typtype = 'c') as composite, (p.provolatile <> 'v') as readonly
        from pg_proc p join pg_type t on t.oid = p.prorettype where p.pronamespace = 'public'::regnamespace`);
    return {
      fks: fks.rows,
      pks: Object.fromEntries(pks.rows.map((r) => [r.t, r.cols])),
      fns: Object.fromEntries(fns.rows.map((r) => [r.name, { retset: r.retset, composite: r.composite, readonly: r.readonly || READ_ONLY_FNS.has(r.name) }])),
    };
  });
  return metaPromise;
}

// --- Parser do "select" do PostgREST: "*, order_items(*), modifier_groups(*, modifier_options(*))"
type Node = { kind: "star" } | { kind: "col"; name: string } | { kind: "embed"; rel: string; children: Node[] };
function parseSelect(src: string): Node[] {
  const out: Node[] = [];
  let i = 0;
  const s = src.replace(/\s+/g, "");
  function parseList(): Node[] {
    const nodes: Node[] = [];
    while (i < s.length && s[i] !== ")") {
      let name = "";
      while (i < s.length && !",()".includes(s[i])) name += s[i++];
      if (s[i] === "(") {
        i++;
        const children = parseList();
        i++; // ")"
        nodes.push({ kind: "embed", rel: name, children });
      } else if (name === "*") nodes.push({ kind: "star" });
      else if (name) nodes.push({ kind: "col", name });
      if (s[i] === ",") i++;
    }
    return nodes;
  }
  out.push(...parseList());
  return out;
}

let aliasSeq = 0;
function selectList(table: string, alias: string, nodes: Node[], m: Meta): string {
  return nodes.map((n) => {
    if (n.kind === "star") return `${alias}.*`;
    if (n.kind === "col") return `${alias}.${q(n.name)}`;
    const sub = `e${++aliasSeq}`;
    const one = m.fks.find((f) => f.child === n.rel && f.parent === table);
    if (one) {
      return `(select coalesce(json_agg(x_${sub}), '[]'::json) from (select ${selectList(n.rel, sub, n.children, m)} from public.${q(n.rel)} ${sub}
               where ${sub}.${q(one.fk)} = ${alias}.${q(one.ref)}) x_${sub}) as ${q(n.rel)}`;
    }
    const many = m.fks.find((f) => f.child === table && f.parent === n.rel);
    if (many) {
      return `(select row_to_json(x_${sub}) from (select ${selectList(n.rel, sub, n.children, m)} from public.${q(n.rel)} ${sub}
               where ${sub}.${q(many.ref)} = ${alias}.${q(many.fk)}) x_${sub}) as ${q(n.rel)}`;
    }
    throw new Error(`Relacionamento não encontrado: ${table} → ${n.rel}`);
  }).join(", ");
}

class Params {
  values: unknown[] = [];
  add(v: unknown) {
    this.values.push(v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v);
    return `$${this.values.length}`;
  }
}

type Filter = (p: Params, alias: string) => string;

// --- Builder de consultas de tabela ---------------------------------------------------
class TableQuery<T = unknown> implements PromiseLike<Result<T>> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private columns = "*";
  private returning: string | null = null;
  private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private lim: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private head = false;
  private countMode = false;
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};

  constructor(private table: string) { q(table); }

  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.columns = cols; else this.returning = cols;
    if (opts?.head) this.head = true;
    if (opts?.count) this.countMode = true;
    return this;
  }
  insert(rows: Record<string, unknown> | Record<string, unknown>[]) { this.op = "insert"; this.payload = rows; return this; }
  upsert(rows: Record<string, unknown> | Record<string, unknown>[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert"; this.payload = rows; this.upsertOpts = opts; return this;
  }
  update(values: Record<string, unknown>) { this.op = "update"; this.payload = values; return this; }
  delete() { this.op = "delete"; return this; }

  eq(c: string, v: unknown) { this.filters.push((p, a) => `${a}.${q(c)} = ${p.add(v)}`); return this; }
  neq(c: string, v: unknown) { this.filters.push((p, a) => `${a}.${q(c)} is distinct from ${p.add(v)}`); return this; }
  gt(c: string, v: unknown) { this.filters.push((p, a) => `${a}.${q(c)} > ${p.add(v)}`); return this; }
  gte(c: string, v: unknown) { this.filters.push((p, a) => `${a}.${q(c)} >= ${p.add(v)}`); return this; }
  lt(c: string, v: unknown) { this.filters.push((p, a) => `${a}.${q(c)} < ${p.add(v)}`); return this; }
  lte(c: string, v: unknown) { this.filters.push((p, a) => `${a}.${q(c)} <= ${p.add(v)}`); return this; }
  in(c: string, values: unknown[]) {
    this.filters.push((p, a) => `${a}.${q(c)}::text = any(${p.add(values.map(String))}::text[])`);
    return this;
  }
  is(c: string, v: null | boolean) {
    this.filters.push((_p, a) => `${a}.${q(c)} is ${v === null ? "null" : v ? "true" : "false"}`);
    return this;
  }
  not(c: string, op: string, v: unknown) {
    if (op === "is") this.filters.push((_p, a) => `${a}.${q(c)} is not ${v === null ? "null" : v ? "true" : "false"}`);
    else if (op === "eq") this.filters.push((p, a) => `${a}.${q(c)} is distinct from ${p.add(v)}`);
    else throw new Error(`Operador não suportado na demonstração: not.${op}`);
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}) { q(col); this.orders.push({ col, asc: opts.ascending !== false }); return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  then<R1 = Result<T>, R2 = never>(ok?: ((v: Result<T>) => R1 | PromiseLike<R1>) | null, fail?: ((e: unknown) => R2 | PromiseLike<R2>) | null) {
    return this.execute().then(ok, fail);
  }

  private where(p: Params, alias = "r0") {
    return this.filters.length ? ` where ${this.filters.map((f) => f(p, alias)).join(" and ")}` : "";
  }

  private async execute(): Promise<Result<T>> {
    const user = getDemoUser();
    try {
      const m = await meta();
      const p = new Params();
      const T = `public.${q(this.table)}`;
      let sql: string;
      let wantsRows = true;

      if (this.op === "select") {
        if (this.countMode && this.head) {
          sql = `select json_build_array(json_build_object('count', count(*))) as data from ${T} r0${this.where(p)}`;
        } else {
          const order = this.orders.length ? ` order by ${this.orders.map((o) => `r0.${q(o.col)} ${o.asc ? "asc" : "desc"}`).join(", ")}` : "";
          sql = `select coalesce(json_agg(t), '[]'::json) as data from (select ${selectList(this.table, "r0", parseSelect(this.columns), m)}
                 from ${T} r0${this.where(p)}${order}${this.lim ? ` limit ${Number(this.lim)}` : ""}) t`;
        }
      } else if (this.op === "insert" || this.op === "upsert") {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload!];
        const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        cols.forEach(q);
        const colList = cols.map(q).join(", ");
        let conflict = "";
        if (this.op === "upsert") {
          const target = this.upsertOpts.onConflict ? this.upsertOpts.onConflict.split(",").map((c) => c.trim()) : m.pks[this.table] ?? ["id"];
          const updatable = cols.filter((c) => !target.includes(c));
          conflict = this.upsertOpts.ignoreDuplicates || updatable.length === 0
            ? ` on conflict (${target.map(q).join(", ")}) do nothing`
            : ` on conflict (${target.map(q).join(", ")}) do update set ${updatable.map((c) => `${q(c)} = excluded.${q(c)}`).join(", ")}`;
        }
        const ins = `insert into ${T} (${colList}) select ${colList} from json_populate_recordset(null::${T}, ${p.add(JSON.stringify(rows))}::json)${conflict}`;
        if (this.returning) {
          sql = `with w as (${ins} returning *) select coalesce(json_agg(t), '[]'::json) as data from (select ${selectList(this.table, "r0", parseSelect(this.returning), m)} from w r0) t`;
        } else { sql = ins; wantsRows = false; }
      } else if (this.op === "update") {
        const cols = Object.keys(this.payload as Record<string, unknown>);
        cols.forEach(q);
        const set = cols.map((c) => `${q(c)} = j.${q(c)}`).join(", ");
        const upd = `update ${T} r0 set ${set} from json_populate_record(null::${T}, ${p.add(JSON.stringify(this.payload))}::json) j${this.where(p)}`;
        if (this.returning) {
          sql = `with w as (${upd} returning r0.*) select coalesce(json_agg(t), '[]'::json) as data from (select ${selectList(this.table, "r0", parseSelect(this.returning), m)} from w r0) t`;
        } else { sql = upd; wantsRows = false; }
      } else {
        sql = `delete from ${T} r0${this.where(p)}`;
        wantsRows = false;
      }

      const rows = await runAs(user, async (tx) => (await tx.query<{ data: unknown[] }>(sql, p.values)).rows);
      if (this.op !== "select") notifyChange([this.table]);
      if (!wantsRows) return { data: null, error: null };
      const data = (rows[0]?.data ?? []) as unknown[];
      if (this.countMode && this.head) return { data: null, error: null, count: (data[0] as { count: number }).count };
      return shape<T>(data, this.mode);
    } catch (e) {
      return { data: null, error: toError(e) };
    }
  }
}

function shape<T>(data: unknown[], mode: "many" | "single" | "maybe"): Result<T> {
  if (mode === "many") return { data: data as T, error: null };
  if (data.length > 1) return { data: null, error: { message: "Mais de uma linha retornada", code: "PGRST116" } };
  if (data.length === 0) {
    return mode === "maybe" ? { data: null, error: null } : { data: null, error: { message: "Nenhum registro encontrado", code: "PGRST116" } };
  }
  return { data: data[0] as T, error: null };
}

// --- Chamadas de função (rpc) ---------------------------------------------------------
class RpcQuery<T = unknown> implements PromiseLike<Result<T>> {
  private mode: "many" | "single" | "maybe" = "many";
  constructor(private fn: string, private args: Record<string, unknown>, private as?: DemoUser) { q(fn); }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  then<R1 = Result<T>, R2 = never>(ok?: ((v: Result<T>) => R1 | PromiseLike<R1>) | null, fail?: ((e: unknown) => R2 | PromiseLike<R2>) | null) {
    return this.execute().then(ok, fail);
  }
  private async execute(): Promise<Result<T>> {
    try {
      const m = await meta();
      const info = m.fns[this.fn];
      if (!info) throw Object.assign(new Error(`Função não encontrada: ${this.fn}`), { code: "PGRST202" });
      const p = new Params();
      const args = Object.entries(this.args).map(([k, v]) => `${q(k)} => ${p.add(Array.isArray(v) ? JSON.stringify(v) : v)}`).join(", ");
      const sql = `select coalesce(json_agg(r), '[]'::json) as data from public.${q(this.fn)}(${args}) r`;
      const user = this.as !== undefined ? this.as : getDemoUser();
      const rows = await runAs(user, async (tx) => (await tx.query<{ data: unknown[] }>(sql, p.values)).rows);
      if (!info.readonly) notifyChange(["*"]);
      let data = (rows[0]?.data ?? []) as unknown[];
      if (!info.composite) data = data.map((d) => (d && typeof d === "object" && this.fn in (d as object) ? (d as Record<string, unknown>)[this.fn] : d));
      if (this.mode !== "many") return shape<T>(data, this.mode);
      return { data: (info.retset ? data : data[0] ?? null) as T, error: null };
    } catch (e) {
      return { data: null, error: toError(e) };
    }
  }
}

// --- Cliente ---------------------------------------------------------------------------
type Handler = { table: string; cb: () => void };
class MockChannel {
  handlers: Handler[] = [];
  private off: (() => void) | null = null;
  on(_type: string, filter: { table: string }, cb: () => void) { this.handlers.push({ table: filter.table, cb }); return this; }
  subscribe(status?: (s: string) => void) {
    this.off = onChange((tables) => {
      for (const h of this.handlers) if (tables.includes("*") || tables.includes(h.table)) h.cb();
    });
    setTimeout(() => status?.("SUBSCRIBED"), 0);
    return this;
  }
  unsubscribe() { this.off?.(); this.off = null; }
}

const uploads = new Map<string, string>();

export function createMockClient() {
  return {
    from: (table: string) => new TableQuery(table),
    rpc: <T = unknown>(fn: string, args: Record<string, unknown> = {}) => new RpcQuery<T>(fn, args),
    channel: () => new MockChannel(),
    removeChannel: (ch: MockChannel) => { ch.unsubscribe(); return Promise.resolve("ok"); },
    auth: {
      async getUser() {
        const u = getDemoUser();
        return { data: { user: u ? { id: u.id, email: u.email } : null }, error: null };
      },
      async getSession() {
        const u = getDemoUser();
        return { data: { session: u ? { user: u } : null }, error: null };
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        try {
          const rows = await runAs("service", async (tx) =>
            (await tx.query<{ id: string; email: string }>(
              "select id::text, email from auth.users where lower(email) = lower($1) and demo_password = $2", [email.trim(), password])).rows);
          if (!rows[0]) return { data: { user: null, session: null }, error: { message: "Invalid login credentials" } };
          setDemoUser(rows[0]);
          return { data: { user: rows[0], session: { user: rows[0] } }, error: null };
        } catch (e) {
          return { data: { user: null, session: null }, error: toError(e) };
        }
      },
      async signOut() { setDemoUser(null); return { error: null }; },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    },
    storage: {
      from: () => ({
        async upload(path: string, file: Blob) {
          const url = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = () => reject(r.error);
            r.readAsDataURL(file);
          });
          uploads.set(path, url);
          return { data: { path }, error: null };
        },
        getPublicUrl(path: string) { return { data: { publicUrl: uploads.get(path) ?? path } }; },
      }),
    },
  };
}

/** Consultas da própria demonstração que ignoram RLS (ex.: links das mesas na página inicial). */
export function serviceQuery<T>(sql: string, params: unknown[] = []) {
  return runAs("service", async (tx) => (await tx.query<T>(sql, params)).rows);
}

/** RPC como cliente anônimo (fluxo da mesa, que no sistema real passa pelo servidor). */
export function anonRpc<T>(fn: string, args: Record<string, unknown>) {
  return new RpcQuery<T>(fn, args, null);
}
