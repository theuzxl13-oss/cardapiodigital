"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Lock, LockOpen, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Separator, Spinner } from "@/components/ui/misc";
import { notifyCashSessionChanged, useMyCashSession } from "./cash-session-store";
import { rpc } from "@/lib/api";
import { money, parseMoney, time } from "@/lib/format";
import { PAYMENT_LABEL } from "@/lib/labels";
import type { PaymentMethod } from "@/lib/types";

interface Summary {
  expected_cash: number;
  by_method: Partial<Record<PaymentMethod, number>>;
  withdrawals: number;
  supplies: number;
  payments_count: number;
  sales_total: number;
}

export function CashSessionBar({ operatorId }: { operatorId: string }) {
  const { session } = useMyCashSession(operatorId);
  const [dialog, setDialog] = useState<null | "open" | "withdrawal" | "supply" | "close">(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);

  function openDialog(d: typeof dialog) {
    setAmount(""); setReason(""); setDialog(d);
    if (d === "close" && session) rpc<Summary>("cash_session_summary", { p_session_id: session.id }).then(setSummary).catch((e) => toast.error(e.message));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseMoney(amount || "0");
    if (Number.isNaN(value)) return toast.error("Valor inválido");
    setBusy(true);
    try {
      if (dialog === "open") {
        await rpc("open_cash_session", { p_opening_amount: value });
        toast.success("Caixa aberto");
      } else if (dialog === "withdrawal" || dialog === "supply") {
        await rpc("register_cash_movement", { p_type: dialog, p_amount: value, p_reason: reason });
        toast.success(dialog === "withdrawal" ? "Sangria registrada" : "Suprimento registrado");
      } else if (dialog === "close") {
        const s = await rpc<{ difference: number }>("close_cash_session", { p_counted_cash: value, p_notes: reason || null });
        const diff = Number(s.difference);
        toast[diff === 0 ? "success" : "warning"](diff === 0 ? "Caixa fechado sem divergência" : `Caixa fechado com divergência de ${money(diff)}`);
      }
      setDialog(null);
      notifyCashSessionChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (session === undefined) return <div className="h-12 border-b bg-card" />;

  return (
    <div className="no-print border-b bg-card">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2 text-sm">
        {session ? (
          <>
            <span className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400"><LockOpen className="size-4" /> Caixa aberto às {time(session.opened_at)}</span>
            <span className="text-muted-foreground">· Fundo {money(session.opening_amount)}</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => openDialog("supply")}><ArrowDownToLine /> Suprimento</Button>
              <Button size="sm" variant="outline" onClick={() => openDialog("withdrawal")}><ArrowUpFromLine /> Sangria</Button>
              <Button size="sm" variant="secondary" onClick={() => openDialog("close")}><Lock /> Fechar caixa</Button>
            </div>
          </>
        ) : (
          <>
            <span className="flex items-center gap-2 font-medium text-rose-700 dark:text-rose-400"><Lock className="size-4" /> Caixa fechado — abra o caixa para receber pagamentos</span>
            <Button size="sm" className="ml-auto" onClick={() => openDialog("open")}><Wallet /> Abrir caixa</Button>
          </>
        )}
      </div>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>
                {dialog === "open" && "Abertura de caixa"}
                {dialog === "withdrawal" && "Sangria (retirada de dinheiro)"}
                {dialog === "supply" && "Suprimento (entrada de dinheiro)"}
                {dialog === "close" && "Fechamento de caixa"}
              </DialogTitle>
              {dialog === "close" && <DialogDescription>Conte o dinheiro da gaveta e informe o valor. A divergência é registrada.</DialogDescription>}
            </DialogHeader>
            {dialog === "close" && summary && (
              <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
                {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                  <div key={m} className="flex justify-between"><span>{PAYMENT_LABEL[m]}</span><span className="tabular">{money(summary.by_method[m] ?? 0)}</span></div>
                ))}
                <Separator className="my-1.5" />
                <div className="flex justify-between"><span>Vendas ({summary.payments_count})</span><span className="tabular">{money(summary.sales_total)}</span></div>
                <div className="flex justify-between"><span>Suprimentos</span><span className="tabular">{money(summary.supplies)}</span></div>
                <div className="flex justify-between"><span>Sangrias</span><span className="tabular">-{money(summary.withdrawals)}</span></div>
                <div className="flex justify-between font-semibold"><span>Dinheiro esperado na gaveta</span><span className="tabular">{money(summary.expected_cash)}</span></div>
              </div>
            )}
            <Field label={dialog === "close" ? "Dinheiro contado (R$)" : dialog === "open" ? "Fundo de troco (R$)" : "Valor (R$)"}>
              <Input inputMode="decimal" required autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </Field>
            {dialog === "close" && summary && amount && !Number.isNaN(parseMoney(amount)) && (
              <p className="text-sm">Divergência: <b className="tabular">{money(parseMoney(amount) - Number(summary.expected_cash))}</b></p>
            )}
            {(dialog === "withdrawal" || dialog === "supply" || dialog === "close") && (
              <Field label={dialog === "close" ? "Observações" : "Motivo"}>
                <Textarea required={dialog !== "close"} minLength={dialog === "close" ? 0 : 3} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
              <Button type="submit" disabled={busy}>{busy && <Spinner />} Confirmar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
