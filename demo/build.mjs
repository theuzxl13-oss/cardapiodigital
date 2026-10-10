#!/usr/bin/env node
/**
 * Gera a VERSÃO DE DEMONSTRAÇÃO ESTÁTICA (GitHub Pages) a partir do código real.
 *
 * - Copia o projeto para .demo-build/, aplica os arquivos de demo/overrides/ (adaptador que roda
 *   o PostgreSQL no navegador com PGlite, páginas que no sistema real rodam no servidor etc.).
 * - Embute as MESMAS migrações e seed do Supabase (supabase/) + demo/demo.sql.
 * - Gera o site em demo-dist/ (pronto para publicar).
 *
 * Uso: npm run demo:build    (variáveis: DEMO_BASE_PATH, padrão "/cardapiodigital")
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const work = path.join(root, ".demo-build");
const dist = path.join(root, "demo-dist");
const basePath = process.env.DEMO_BASE_PATH ?? "/cardapiodigital";
const SKIP = new Set(["node_modules", ".next", ".git", ".demo-build", "demo-dist", "e2e-screenshots", ".env", ".env.local", "out"]);

console.log("› Preparando cópia de trabalho");
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
for (const entry of fs.readdirSync(root)) {
  if (SKIP.has(entry)) continue;
  fs.cpSync(path.join(root, entry), path.join(work, entry), { recursive: true });
}
fs.symlinkSync(path.join(root, "node_modules"), path.join(work, "node_modules"), "dir");

// (demo/ é removida da cópia após aplicar os overrides)
// Rotas que dependem de servidor não existem no site estático
for (const p of ["src/proxy.ts", "src/app/api", "src/app/garcom/mesa/[id]", "src/app/caixa/comanda/[id]"]) {
  fs.rmSync(path.join(work, p), { recursive: true, force: true });
}

console.log("› Aplicando arquivos da demonstração");
fs.cpSync(path.join(root, "demo/overrides"), work, { recursive: true });
fs.rmSync(path.join(work, "demo"), { recursive: true, force: true });

console.log("› Embutindo migrações e seed");
const files = [
  "tests/db/supabase-shim.sql",
  ...fs.readdirSync(path.join(root, "supabase/migrations")).sort().map((f) => `supabase/migrations/${f}`),
  "supabase/seed.sql",
  "demo/demo.sql",
];
const version = String(Date.now());
const sql = files.map((f) => `-- ${f}\n${fs.readFileSync(path.join(root, f), "utf8")}`).join("\n\n")
  + `\ninsert into public.demo_meta (version) values ('${version}');\n`;
fs.writeFileSync(path.join(work, "src/lib/demo/sql-bundle.ts"), `// Gerado por demo/build.mjs — não editar.\nexport const SQL_BUNDLE = ${JSON.stringify(sql)};\n`);

console.log("› Copiando binários do PostgreSQL (PGlite)");
const pgDist = path.join(root, "node_modules/@electric-sql/pglite/dist");
fs.mkdirSync(path.join(work, "public/pglite"), { recursive: true });
for (const f of ["pglite.wasm", "initdb.wasm", "pglite.data", "pgcrypto.tar.gz"]) {
  fs.copyFileSync(path.join(pgDist, f), path.join(work, "public/pglite", f));
}

console.log("› Gerando site estático");
execSync("npx next build", {
  cwd: work,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_DEMO_MODE: "true",
    NEXT_PUBLIC_DEMO_DB_VERSION: version,
    NEXT_PUBLIC_RESTAURANT_ID: "00000000-0000-4000-a000-000000000001",
    NEXT_PUBLIC_SUPABASE_URL: "https://demo.local",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "demo",
    NEXT_TELEMETRY_DISABLED: "1",
  },
});

fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(path.join(work, "out"), dist, { recursive: true });
fs.writeFileSync(path.join(dist, ".nojekyll"), ""); // GitHub Pages: servir a pasta _next
console.log(`\n✓ Demonstração gerada em demo-dist/ (basePath ${basePath || "/"})`);
