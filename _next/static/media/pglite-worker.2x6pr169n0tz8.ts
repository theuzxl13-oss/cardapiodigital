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

    // Gravação assíncrona (rápida) no uso interativo; após a carga inicial, força a gravação
    // completa no IndexedDB para que outra aba possa assumir o banco com segurança.
    const pg = await open(true);
    const exists = await pg.query<{ t: string | null }>("select to_regclass('public.demo_meta')::text as t");
    if (!exists.rows[0]?.t) {
      await pg.exec(SQL_BUNDLE);
      // Gravação completa e aguardada (no modo assíncrono, pg.syncToFs() apenas agenda)
      await (pg as unknown as { fs: { syncToFs(relaxed: boolean): Promise<void> } }).fs.syncToFs(false);
    }
    return pg;
  },
});
