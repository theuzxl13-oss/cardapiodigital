"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createMockClient } from "@/lib/demo/mock-client";

let client: SupabaseClient | undefined;

/**
 * VERSÃO DE DEMONSTRAÇÃO: em vez do Supabase, usa o PostgreSQL rodando no navegador
 * (mesmas migrações, funções e políticas). Ver demo/README.md.
 */
export function getBrowserSupabase(): SupabaseClient {
  if (!client) {
    client = createMockClient() as unknown as SupabaseClient;
    // Acesso pelo console do navegador para inspeção: window.demoSupabase
    if (typeof window !== "undefined") (window as unknown as { demoSupabase: SupabaseClient }).demoSupabase = client;
  }
  return client;
}
