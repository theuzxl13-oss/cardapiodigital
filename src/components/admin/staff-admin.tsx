"use client";

import { useState } from "react";
import { KeyRound, Lock, LockOpen, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Skeleton, Spinner, Table, Td, Th } from "@/components/ui/misc";
import { createStaff, resetStaffPassword, setStaffBlocked } from "@/app/admin/funcionarios/actions";
import { useLiveQuery } from "@/hooks/use-live-query";
import { check, rpc, sb } from "@/lib/api";
import { date } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";
import type { AppRole, Profile } from "@/lib/types";

async function load() {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [profiles, orders, payments] = await Promise.all([
    sb().from("profiles").select("id, restaurant_id, full_name, email, role, active, created_at").order("role").order("full_name"),
    sb().from("orders").select("created_by").not("created_by", "is", null).gte("created_at", since),
    sb().from("payments").select("created_by").is("voided_at", null).gte("created_at", since),
  ]);
  const count = (rows: { created_by: string }[]) => rows.reduce<Record<string, number>>((m, r) => ((m[r.created_by] = (m[r.created_by] ?? 0) + 1), m), {});
  return { profiles: check(profiles) as Profile[], orders: count(check(orders) as { created_by: string }[]), payments: count(check(payments) as { created_by: string }[]) };
}

export function StaffAdmin({ meId, serviceKeyConfigured }: { meId: string; serviceKeyConfigured: boolean }) {
  const { data, reload } = useLiveQuery("admin-staff", load, []);
  const [creating, setCreating] = useState(false);
  const [pinFor, setPinFor] = useState<Profile | null>(null);
  const [pwFor, setPwFor] = useState<Profile | null>(null);
  if (!data) return <div className="p-8"><Skeleton className="h-96" /></div>;

  async function changeRole(p: Profile, role: AppRole) {
    const { error } = await sb().from("profiles").update({ role }).eq("id", p.id);
    if (error) toast.error(error.message); else { toast.success("Permissão atualizada"); reload(); }
  }

  return (
    <main className="space-y-5 p-5 md:p-8">
      {!serviceKeyConfigured && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          SUPABASE_SERVICE_ROLE_KEY não configurada no servidor: criação, bloqueio e troca de senha ficam indisponíveis.
        </p>
      )}
      <div className="flex"><Button className="ml-auto" disabled={!serviceKeyConfigured} onClick={() => setCreating(true)}><Plus /> Novo funcionário</Button></div>
      <Card>
        <Table>
          <thead><tr><Th>Nome</Th><Th>E-mail</Th><Th>Permissão</Th><Th>Situação</Th><Th className="text-right">Pedidos (30d)</Th><Th className="text-right">Recebimentos (30d)</Th><Th>Desde</Th><Th /></tr></thead>
          <tbody>
            {data.profiles.map((p) => (
              <tr key={p.id} className={!p.active ? "opacity-60" : ""}>
                <Td className="font-medium">{p.full_name}{p.id === meId && <Badge variant="secondary" className="ml-2">você</Badge>}</Td>
                <Td className="text-muted-foreground">{p.email}</Td>
                <Td>
                  <Select className="h-8 w-36" value={p.role} disabled={p.id === meId} onChange={(e) => changeRole(p, e.target.value as AppRole)}>
                    {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </Select>
                </Td>
                <Td>{p.active ? <Badge variant="success">Ativo</Badge> : <Badge variant="destructive">Bloqueado</Badge>}</Td>
                <Td className="tabular text-right">{data.orders[p.id] ?? 0}</Td>
                <Td className="tabular text-right">{data.payments[p.id] ?? 0}</Td>
                <Td>{date(p.created_at)}</Td>
                <Td className="whitespace-nowrap text-right">
                  {(p.role === "admin" || p.role === "manager") && <Button size="icon-sm" variant="ghost" title="Definir PIN de supervisor" onClick={() => setPinFor(p)}><ShieldCheck /></Button>}
                  <Button size="icon-sm" variant="ghost" title="Redefinir senha" disabled={!serviceKeyConfigured} onClick={() => setPwFor(p)}><KeyRound /></Button>
                  <Button size="icon-sm" variant="ghost" title={p.active ? "Bloquear acesso" : "Desbloquear"} disabled={!serviceKeyConfigured || p.id === meId}
                    onClick={async () => {
                      if (!confirm(p.active ? `Bloquear o acesso de ${p.full_name}?` : `Desbloquear ${p.full_name}?`)) return;
                      const r = await setStaffBlocked(p.id, p.active);
                      if (r.ok) { toast.success(p.active ? "Acesso bloqueado" : "Acesso liberado"); reload(); } else toast.error(r.error);
                    }}>{p.active ? <Lock /> : <LockOpen />}</Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {creating && <CreateDialog onClose={() => setCreating(false)} onSaved={reload} />}
      {pinFor && (
        <SimpleDialog title={`PIN de supervisor · ${pinFor.full_name}`} description="Usado para autorizar cancelamentos, descontos acima do limite, estornos e fechamento com saldo. 4 a 8 dígitos."
          label="Novo PIN" inputMode="numeric" onClose={() => setPinFor(null)}
          onSubmit={async (v) => { await rpc("set_staff_pin", { p_user_id: pinFor.id, p_pin: v }); toast.success("PIN definido"); }} />
      )}
      {pwFor && (
        <SimpleDialog title={`Nova senha · ${pwFor.full_name}`} label="Senha (mín. 8 caracteres)" onClose={() => setPwFor(null)}
          onSubmit={async (v) => { const r = await resetStaffPassword(pwFor.id, v); if (!r.ok) throw new Error(r.error); toast.success("Senha redefinida"); }} />
      )}
    </main>
  );
}

function CreateDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "waiter" as AppRole });
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true);
          const r = await createStaff(form);
          setBusy(false);
          if (!r.ok) return toast.error(r.error);
          toast.success("Funcionário criado"); onSaved(); onClose();
        }}>
          <DialogHeader><DialogTitle>Novo funcionário</DialogTitle></DialogHeader>
          <Field label="Nome completo"><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
          <Field label="E-mail (login)"><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Senha inicial"><Input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Permissão">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AppRole })}>
              {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </Field>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy && <Spinner />} Criar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SimpleDialog({ title, description, label, inputMode, onClose, onSubmit }: {
  title: string; description?: string; label: string; inputMode?: "numeric"; onClose: () => void; onSubmit: (v: string) => Promise<void>;
}) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true);
          try { await onSubmit(v); onClose(); } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
        }}>
          <DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader>
          <Field label={label}><Input type="password" inputMode={inputMode} required value={v} onChange={(e) => setV(inputMode ? e.target.value.replace(/\D/g, "") : e.target.value)} /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy && <Spinner />} Salvar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
