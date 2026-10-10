/** Extrai mensagem amigável de erros do Supabase/PostgREST (as funções do banco já retornam texto em português). */
export function errorMessage(err: unknown): string {
  if (!err) return "Erro desconhecido";
  if (typeof err === "string") return err;
  const e = err as { message?: string; details?: string; hint?: string; code?: string };
  if (e.code === "PGRST301" || e.message?.includes("JWT")) return "Sua sessão expirou. Entre novamente.";
  if (e.message?.includes("Failed to fetch")) return "Sem conexão com o servidor. Verifique a internet.";
  return e.message || "Erro inesperado";
}
