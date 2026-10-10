/// <reference lib="webworker" />
import { PGlite } from "@electric-sql/pglite";
import { worker } from "@electric-sql/pglite/worker";
import { SQL_BUNDLE } from "./sql-bundle";

/**
 * Worker compartilhado entre as abas (eleição de líder do PGlite): todas as abas
 * do mesmo navegador usam o MESMO banco — cliente, cozinha, garçom e caixa conversam entre si.
 */
worker({
  async init(options) {
    const base: string = options.meta?.base ?? "";
    const origin = self.location.origin;
    const [pgliteWasmModule, initdbWasmModule, fsBundle] = await Promise.all([
      WebAssembly.compileStreaming(fetch(`${base}/pglite/pglite.wasm`)),
      WebAssembly.compileStreaming(fetch(`${base}/pglite/initdb.wasm`)),
      fetch(`${base}/pglite/pglite.data`).then((r) => r.blob()),
    ]);
    const pgcrypto = {
      name: "pgcrypto",
      setup: async () => ({ bundlePath: new URL(`${base}/pglite/pgcrypto.tar.gz`, origin) }),
    };
    const open = (relaxedDurability: boolean) =>
      PGlite.create({ dataDir: options.dataDir, pgliteWasmModule, initdbWasmModule, fsBundle, relaxedDurability, extensions: { pgcrypto } });

    // Carga inicial com gravação síncrona e fechamento (garante que tudo foi salvo no IndexedDB);
    // depois reabre em modo de gravação assíncrona, muito mais rápido para o uso interativo.
    let pg = await open(true);
    const exists = await pg.query<{ t: string | null }>("select to_regclass('public.demo_meta')::text as t");
    if (!exists.rows[0]?.t) {
      await pg.close();
      pg = await open(false);
      await pg.exec(SQL_BUNDLE);
      await pg.close();
      pg = await open(true);
    }
    return pg;
  },
});
