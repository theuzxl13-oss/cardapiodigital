export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/** Alterar a versão força a recriação do banco local dos visitantes após um novo deploy. */
export const DEMO_DB_VERSION = process.env.NEXT_PUBLIC_DEMO_DB_VERSION ?? "1";
export const DEMO_DB_NAME = `cardapio-demo-v${DEMO_DB_VERSION}`;
