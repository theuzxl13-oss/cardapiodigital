import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** Configuração oficial do Next.js (Core Web Vitals + TypeScript). */
const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "out/**", ".demo-build/**", "demo-dist/**", "node_modules/**", "next-env.d.ts", "public/**"],
  },
];

export default config;
