"use client";

import { useCallback, useState } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Skeleton, Table, Td, Th } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useLiveQuery } from "@/hooks/use-live-query";
import { check, sb } from "@/lib/api";
import { dateTime } from "@/lib/format";

interface Entry { id: number; actor_id: string | null; action: string; entity: string; entity_id: string | null; details: Record<string, unknown>; created_at: string }

const ACTION_LABEL: Record<string, string> = {
  "order.cancel": "Cancelamento de pedido", "payment.register": "Pagamento registrado", "payment.void": "Estorno de pagamento",
  "tab.open": "Comanda aberta", "tab.close": "Comanda encerrada", "tab.adjust": "Taxa/desconto ajustado", "tab.request_close": "Fechamento solicitado",
  "tab.cancel_empty": "Mesa liberada sem consumo", "cash.open": "Abertura de caixa", "cash.close": "Fechamento de caixa",
  "cash.withdrawal": "Sangria", "cash.supply": "Suprimento", "profile.set_pin": "PIN definido", "profile.block": "Acesso bloqueado",
  "profile.unblock": "Acesso liberado", "profile.reset_password": "Senha redefinida", "table.regenerate_qr": "QR Code regenerado",
  insert: "Cadastro", update: "Alteração", delete: "Exclusão",
};

export function AuditAdmin() {
  const [entity, setEntity] = useState("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(100);
  const fetcher = useCallback(async () => {
    let query = sb().from("audit_log").select("*").order("created_at", { ascending: false }).limit(limit);
    if (entity !== "all") query = query.eq("entity", entity);
    const [rows, profiles] = await Promise.all([query, sb().from("profiles").select("id, full_name")]);
    return { rows: check(rows) as Entry[], names: Object.fromEntries((check(profiles) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name])) };
  }, [entity, limit]);
  const { data } = useLiveQuery(`audit:${entity}:${limit}`, fetcher, []);

  const rows = (data?.rows ?? []).filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
  return (
    <main className="space-y-4 p-5 md:p-8">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Filtrar por texto" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-52" value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="all">Todas as entidades</option>
          {["orders", "payments", "tabs", "cash_sessions", "cash_movements", "products", "categories", "profiles", "dining_tables", "restaurants", "product_ingredients"].map((e) => <option key={e}>{e}</option>)}
        </Select>
      </div>
      {!data ? <Skeleton className="h-96" /> : (
        <Card>
          <Table>
            <thead><tr><Th>Data</Th><Th>Usuário</Th><Th>Ação</Th><Th>Entidade</Th><Th>Detalhes</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <Td className="whitespace-nowrap">{dateTime(r.created_at)}</Td>
                  <Td>{r.actor_id ? data.names[r.actor_id] ?? "—" : "Cliente / sistema"}</Td>
                  <Td>{ACTION_LABEL[r.action] ?? r.action}</Td>
                  <Td className="text-muted-foreground">{r.entity}</Td>
                  <Td><code className="block max-w-xl whitespace-pre-wrap break-words text-xs text-muted-foreground">{JSON.stringify(r.details)}</code></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {data && data.rows.length >= limit && <div className="text-center"><Button variant="outline" onClick={() => setLimit(limit + 200)}>Carregar mais</Button></div>}
    </main>
  );
}
