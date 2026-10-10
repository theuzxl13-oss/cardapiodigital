/**
 * Prefixa caminhos de arquivos públicos ("/brand/...", "/models/...") com o basePath da
 * instalação (ex.: publicação em subdiretório como no GitHub Pages). URLs absolutas passam intactas.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function asset<T extends string | null | undefined>(path: T): T {
  if (!path || !BASE || !path.startsWith("/") || path.startsWith("//") || path.startsWith(BASE + "/")) return path;
  return (BASE + path) as T;
}
