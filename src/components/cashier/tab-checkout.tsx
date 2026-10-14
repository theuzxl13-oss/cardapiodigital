"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, Banknote, CheckCircle2, CreditCard, Divide, Lock, Percent, Printer, QrCode, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Separator, Skeleton, Spinner } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { OrderList } from "@/components/order/order-list";
import { SupervisorDialog } from "@/components/staff/supervisor-dialog";
import { TableActionsDialog } from "@/components/order/table-actions-dialog";
import { useMyCashSession } from "./cash-session-store";
import { useLiveQuery } from "@/hooks/use-live-query";
import { authorizeWithPin, check, loadTabDetail, rpc, sb } from "@/lib/api";
import { cashSuggestions, changeFor, proportionalShare, splitEqually } from "@/lib/billing";
import { dateTime, money, pad, parseMoney, time } from "@/lib/format";
import { PAYMENT_LABEL, TAB_STATUS_LABEL } from "@/lib/labels";
import { cn, newIdempotencyKey } from "@/lib/utils";
import type { PaymentMethod, Profile, Restaurant } from "@/lib/types";
import { routes } from "@/lib/routes";

const METHODS: { id: PaymentMethod; icon: typeof Banknote }[] = [
  { id: "cash", icon: Banknote }, { id: "pix", icon: QrCode }, { id: "debit", icon: CreditCard }, { id: "credit", icon: CreditCard },
];

async function loadCheckout(tabId: string) {
  const { data: auth } = await sb().auth.getUser();
  const [detail, me, restaurant] = await Promise.all([
    loadTabDetail(tabId, true),
    sb().from("profiles").select("id, restaurant_id, full_name, role, active, email").eq("id", auth.user?.id ?? "").single(),
    sb().from("restaurants").select("*").single(),
  ]);
  return { ...detail, me: check(me) as Profile, restaurant: check(restaurant) as Restaurant };
}

export function TabCheckout({ tabId }: { tabId: string }) {
  const router = useRouter();
  const fetcher = useCallback(() => loadCheckout(tabId), [tabId]);
  const { data, loading, reload } = useLiveQuery(`checkout:${tabId}`, fetcher, ["orders", "payments", "tabs"], { filter: undefined });
  const { session } = useMyCashSession();

  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState("");
  const [payer, setPayer] = useState("");
  const [confirmPay, setConfirmPay] = useState(false);
  const [paying, setPaying] = useState(false);
  const payKey = useRef<string | null>(null);
  const [splitN, setSplitN] = useState(2);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [discountOpen, setDiscountOpen] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [forceClose, setForceClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const [moving, setMoving] = useState(false);

  const items = useMemo(() => (data?.orders ?? []).filter((o) => o.status !== "cancelled").flatMap((o) => o.order_items ?? []), [data]);

  if (loading || !data) return <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-2"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>;

  const { tab, table, totals, payments, me, restaurant } = data;
  const isOpen = tab.status === "open" || tab.status === "closing";
  const isSupervisor = me.role === "admin" || me.role === "manager";
  const balance = Number(totals.balance);
  const amountValue = parseMoney(amount || String(balance));
  const receivedValue = method === "cash" ? parseMoney(received || String(amountValue)) : amountValue;
  const change = method === "cash" ? changeFor(amountValue, receivedValue) : 0;
  const selectedSubtotal = items.filter((i) => selectedItems.has(i.id)).reduce((s, i) => s + Number(i.line_total), 0);
  const pendingKitchen = data.orders.filter((o) => ["received", "preparing"].includes(o.status)).length;

  function fill(v: number) {
    setAmount(v.toFixed(2).replace(".", ","));
    setReceived("");
  }

  function startPayment() {
    if (!session) return toast.error("Abra o caixa antes de registrar pagamentos.");
    if (Number.isNaN(amountValue) || amountValue <= 0) return toast.error("Informe um valor válido.");
    if (amountValue > balance + 0.001) return toast.error(`Valor maior que o saldo (${money(balance)}).`);
    if (method === "cash" && (Number.isNaN(receivedValue) || receivedValue < amountValue)) return toast.error("Valor recebido menor que o valor a pagar.");
    payKey.current = newIdempotencyKey();
    setConfirmPay(true);
  }

  async function pay() {
    setPaying(true);
    try {
      const r = await rpc<{ totals: { balance: number }; duplicate: boolean }>("register_payment", {
        p_tab_id: tab.id, p_method: method, p_amount: amountValue, p_received_amount: method === "cash" ? receivedValue : null,
        p_payer_label: payer || null, p_idempotency_key: payKey.current,
      });
      toast.success(r.duplicate ? "Pagamento já havia sido registrado" : `Pagamento de ${money(amountValue)} registrado${change > 0 ? ` · troco ${money(change)}` : ""}`);
      setConfirmPay(false); setAmount(""); setReceived(""); setPayer(""); setSelectedItems(new Set());
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPaying(false);
    }
  }

  async function closeTab(reason?: string, pin?: string | null) {
    setClosing(true);
    try {
      await rpc("close_tab", { p_tab_id: tab.id, p_force_reason: reason ?? null, p_supervisor_pin: pin ?? null });
      toast.success(`Comanda #${tab.number} encerrada. Mesa ${pad(table.number)} liberada.`);
      router.push(routes.receipt(tab.id));
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    } finally {
      setClosing(false);
    }
  }

  async function toggleServiceFee(enabled: boolean) {
    try {
      await rpc("set_tab_adjustments", { p_tab_id: tab.id, p_service_fee_enabled: enabled, p_discount_amount: Number(totals.discount), p_discount_reason: tab.discount_reason, p_supervisor_pin: null });
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon"><Link href="/caixa" aria-label="Voltar"><ArrowLeft /></Link></Button>
        <div>
          <h1 className="text-2xl font-bold">Mesa {pad(table.number)} · Comanda #{tab.number}</h1>
          <p className="text-sm text-muted-foreground">Aberta em {dateTime(tab.opened_at)}{tab.customer_count ? ` · ${tab.customer_count} pessoas` : ""}</p>
        </div>
        <Badge variant={tab.status === "closed" ? "secondary" : tab.status === "closing" ? "info" : "warning"} className="ml-auto">{TAB_STATUS_LABEL[tab.status]}</Badge>
        {isOpen && <Button variant="outline" onClick={() => setMoving(true)}><ArrowRightLeft /> Transferir / juntar</Button>}
        <Button asChild variant="outline"><Link href={routes.receipt(tab.id)}><Printer /> {isOpen ? "Pré-conta" : "Comprovante"}</Link></Button>
      </div>
      {tab.merged_into_tab_id && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          {tab.forced_close_reason ?? "Comanda unida a outra mesa."}{" "}
          <Link className="font-medium underline" href={routes.checkout(tab.merged_into_tab_id)}>Abrir a comanda unida</Link>
        </p>
      )}
      {isOpen && <TableActionsDialog open={moving} onOpenChange={setMoving} tab={tab} tableNumber={table.number} onTransferred={reload} onMerged={reload} />}

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        {/* Itens consumidos */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Itens consumidos</CardTitle>
              {isOpen && <span className="text-xs text-muted-foreground">Selecione itens para dividir por consumo</span>}
            </CardHeader>
            <CardContent className="divide-y p-0">
              {items.length === 0 && <p className="p-5 text-sm text-muted-foreground">Nenhum item.</p>}
              {items.map((i) => (
                <label key={i.id} className={cn("flex cursor-pointer items-start gap-3 px-5 py-2.5 text-sm hover:bg-muted/50", selectedItems.has(i.id) && "bg-primary/5")}>
                  {isOpen && (
                    <input type="checkbox" className="mt-1 size-4 accent-[var(--primary)]" checked={selectedItems.has(i.id)}
                      onChange={(e) => setSelectedItems((prev) => { const n = new Set(prev); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })} />
                  )}
                  <span className="flex-1">
                    <b>{i.quantity}×</b> {i.product_name}
                    {i.modifiers.length > 0 && <span className="text-muted-foreground"> · {i.modifiers.map((m) => m.name).join(", ")}</span>}
                    <span className="block text-xs text-muted-foreground">{money(Number(i.unit_price) + Number(i.modifiers_total))} cada</span>
                  </span>
                  <span className="tabular font-medium">{money(i.line_total)}</span>
                </label>
              ))}
            </CardContent>
          </Card>

          <details className="rounded-xl border bg-card">
            <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">Pedidos da comanda ({data.orders.length}){pendingKitchen > 0 && <span className="ml-2 text-amber-600">· {pendingKitchen} em andamento</span>}</summary>
            <div className="p-4 pt-0"><OrderList orders={[...data.orders].reverse()} role={me.role} onChanged={reload} /></div>
          </details>
        </div>

        {/* Totais e pagamento */}
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-2 p-5 text-sm">
              <Line label="Subtotal" value={totals.subtotal} />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-muted-foreground">
                  {isOpen && <Switch checked={tab.service_fee_enabled} onCheckedChange={toggleServiceFee} />}
                  Taxa de serviço ({Number(tab.service_fee_pct)}%)
                </label>
                <span className="tabular">{money(totals.service_fee)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Desconto{tab.discount_reason ? ` (${tab.discount_reason})` : ""}</span>
                <span className="flex items-center gap-2">
                  {isOpen && <Button size="sm" variant="ghost" className="h-7" onClick={() => setDiscountOpen(true)}><Percent className="size-3.5" /> Ajustar</Button>}
                  <span className="tabular">-{money(totals.discount)}</span>
                </span>
              </div>
              <Separator />
              <Line label="Total" value={totals.total} strong />
              <Line label="Pago" value={totals.paid} />
              <div className={cn("flex items-center justify-between rounded-lg px-3 py-2 text-lg font-bold", balance > 0 ? "bg-primary/10 text-primary" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200")}>
                <span>{balance > 0 ? "Saldo a pagar" : "Conta quitada"}</span><span className="tabular">{money(Math.max(balance, 0))}</span>
              </div>
            </CardContent>
          </Card>

          {isOpen && balance > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Divide className="size-4" /> Dividir conta</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <span>Dividir saldo por</span>
                  <Input type="number" min={2} max={30} value={splitN} onChange={(e) => setSplitN(Math.max(2, Math.min(30, Number(e.target.value) || 2)))} className="h-8 w-16" />
                  <span>pessoas</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {splitEqually(balance, splitN).map((v, i) => (
                    <Button key={i} size="sm" variant="outline" onClick={() => { fill(v); setPayer(`Pessoa ${i + 1}`); }}>P{i + 1}: {money(v)}</Button>
                  ))}
                </div>
                {selectedItems.size > 0 && (
                  <Button size="sm" variant="secondary" className="w-full" onClick={() => fill(Math.min(balance, proportionalShare(selectedSubtotal, totals)))}>
                    Itens selecionados (+taxa proporcional): {money(Math.min(balance, proportionalShare(selectedSubtotal, totals)))}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {isOpen && balance > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Wallet className="size-4" /> Registrar pagamento</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {!session && <p className="rounded-md bg-rose-50 p-2 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-200">Abra o caixa (barra superior) para receber.</p>}
                <div className="grid grid-cols-4 gap-1.5">
                  {METHODS.map((m) => (
                    <button key={m.id} onClick={() => setMethod(m.id)}
                      className={cn("flex flex-col items-center gap-1 rounded-lg border py-2.5 text-xs font-medium transition", method === m.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                      <m.icon className="size-5" /> {PAYMENT_LABEL[m.id]}
                    </button>
                  ))}
                </div>
                <Field label="Valor a abater (R$)">
                  <Input inputMode="decimal" value={amount} placeholder={balance.toFixed(2).replace(".", ",")} onChange={(e) => setAmount(e.target.value)} className="tabular text-lg" />
                </Field>
                {method === "cash" && (
                  <>
                    <Field label="Valor recebido (R$)">
                      <Input inputMode="decimal" value={received} placeholder={Number.isNaN(amountValue) ? "" : amountValue.toFixed(2).replace(".", ",")} onChange={(e) => setReceived(e.target.value)} className="tabular text-lg" />
                    </Field>
                    <div className="flex flex-wrap gap-1.5">
                      {cashSuggestions(Number.isNaN(amountValue) ? 0 : amountValue).map((v) => (
                        <Button key={v} size="sm" variant="outline" onClick={() => setReceived(v.toFixed(2).replace(".", ","))}>{money(v)}</Button>
                      ))}
                    </div>
                    <div className="flex justify-between rounded-lg bg-muted px-3 py-2 font-semibold"><span>Troco</span><span className="tabular">{money(change)}</span></div>
                  </>
                )}
                {method === "pix" && <p className="text-xs text-muted-foreground">Integração PIX demonstrativa: confirme o recebimento no aplicativo do banco antes de registrar.</p>}
                {(method === "debit" || method === "credit") && <p className="text-xs text-muted-foreground">Maquininha (TEF) não integrada nesta versão: registre após a aprovação da transação.</p>}
                <Input placeholder="Identificação do pagador (opcional)" value={payer} onChange={(e) => setPayer(e.target.value)} maxLength={60} />
                <Button size="lg" className="w-full" disabled={!session} onClick={startPayment}><CheckCircle2 /> Registrar {money(Number.isNaN(amountValue) ? 0 : amountValue)}</Button>
              </CardContent>
            </Card>
          )}

          {payments.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Pagamentos</CardTitle></CardHeader>
              <CardContent className="divide-y p-0 text-sm">
                {payments.map((p) => (
                  <div key={p.id} className={cn("flex items-center gap-3 px-5 py-2.5", p.voided_at && "opacity-50")}>
                    <div className="flex-1">
                      <p className="font-medium">{PAYMENT_LABEL[p.method]}{p.payer_label ? ` · ${p.payer_label}` : ""}</p>
                      <p className="text-xs text-muted-foreground">{time(p.created_at)}{Number(p.change_amount) > 0 ? ` · recebido ${money(p.received_amount)} · troco ${money(p.change_amount)}` : ""}</p>
                      {p.voided_at && <p className="text-xs text-destructive">Estornado: {p.void_reason}</p>}
                    </div>
                    <span className={cn("tabular font-semibold", p.voided_at && "line-through")}>{money(p.amount)}</span>
                    {isOpen && !p.voided_at && <Button size="icon-sm" variant="ghost" title="Estornar" onClick={() => setVoiding(p.id)}><Undo2 /></Button>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {isOpen && (
            <Card className={cn(balance <= 0 && "border-2 border-emerald-500")}>
              <CardContent className="space-y-2 p-5">
                {pendingKitchen > 0 && <p className="text-sm text-amber-700 dark:text-amber-400">{pendingKitchen} pedido(s) aguardando ou em preparo: conclua ou cancele antes de encerrar.</p>}
                {balance <= 0 ? (
                  <Button size="xl" variant="success" className="w-full" disabled={closing || pendingKitchen > 0} onClick={() => closeTab().catch(() => {})}>
                    {closing ? <Spinner /> : <Lock />} Encerrar comanda e liberar mesa
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" onClick={() => setForceClose(true)}><Lock /> Encerrar com saldo pendente…</Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Confirmação financeira */}
      <Dialog open={confirmPay} onOpenChange={setConfirmPay}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar pagamento</DialogTitle>
            <DialogDescription>Mesa {pad(table.number)} · Comanda #{tab.number}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 rounded-lg bg-muted p-4 text-sm">
            <Line label="Forma" text={PAYMENT_LABEL[method]} />
            <Line label="Valor abatido" value={amountValue} strong />
            {method === "cash" && <><Line label="Recebido" value={receivedValue} /><Line label="Troco" value={change} strong /></>}
            <Line label="Saldo após pagamento" value={Math.max(0, balance - amountValue)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPay(false)}>Voltar</Button>
            <Button onClick={pay} disabled={paying}>{paying && <Spinner />} Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DiscountDialog open={discountOpen} onOpenChange={setDiscountOpen} subtotal={Number(totals.subtotal)} current={Number(tab.discount_amount)}
        maxPct={Number(restaurant.max_discount_pct)} isSupervisor={isSupervisor}
        onSave={async (value, reason, pin) => {
          await rpc("set_tab_adjustments", { p_tab_id: tab.id, p_service_fee_enabled: tab.service_fee_enabled, p_discount_amount: value, p_discount_reason: reason, p_supervisor_pin: pin });
          toast.success("Desconto aplicado");
          reload();
        }} />

      <SupervisorDialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)} title="Estornar pagamento" askPin={!isSupervisor} destructive confirmLabel="Estornar"
        description="O estorno fica registrado na auditoria e no caixa."
        onConfirm={async (reason, pin) => {
          try { await rpc("void_payment", { p_payment_id: voiding, p_reason: reason, p_supervisor_pin: pin }); toast.success("Pagamento estornado"); reload(); }
          catch (e) { toast.error((e as Error).message); throw e; }
        }} />

      <SupervisorDialog open={forceClose} onOpenChange={setForceClose} title="Encerrar com saldo pendente" askPin={!isSupervisor} destructive confirmLabel="Encerrar mesmo assim"
        description={`Restam ${money(balance)} sem pagamento. Procedimento excepcional: exige justificativa (mín. 5 caracteres) e autorização de gerente.`}
        onConfirm={(reason, pin) => closeTab(reason, pin)} />
    </main>
  );
}

function Line({ label, value, text, strong }: { label: string; value?: number | string; text?: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong && "text-base font-semibold")}>
      <span className={cn(!strong && "text-muted-foreground")}>{label}</span>
      <span className="tabular">{text ?? money(value)}</span>
    </div>
  );
}

function DiscountDialog({ open, onOpenChange, subtotal, current, maxPct, isSupervisor, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void; subtotal: number; current: number; maxPct: number; isSupervisor: boolean;
  onSave: (value: number, reason: string, pin: string | null) => Promise<void>;
}) {
  const [mode, setMode] = useState<"value" | "pct">("value");
  const [input, setInput] = useState("");
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const raw = parseMoney(input || "0");
  const value = Number.isNaN(raw) ? 0 : mode === "pct" ? Math.round(subtotal * raw) / 100 : raw;
  const limit = Math.round(subtotal * maxPct) / 100;
  const needsPin = value > limit && !isSupervisor;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true);
          try {
            if (needsPin) await authorizeWithPin(pin);
            await onSave(value, reason, needsPin ? pin : null); onOpenChange(false); setInput(""); setReason(""); setPin("");
          }
          catch (err) { toast.error((err as Error).message); }
          finally { setBusy(false); }
        }}>
          <DialogHeader>
            <DialogTitle>Desconto na comanda</DialogTitle>
            <DialogDescription>Atual: {money(current)}. Limite sem autorização: {maxPct}% ({money(limit)}). Informe 0 para remover.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            <button type="button" onClick={() => setMode("value")} className={cn("rounded-md py-1.5 text-sm", mode === "value" && "bg-card shadow-sm")}>Valor (R$)</button>
            <button type="button" onClick={() => setMode("pct")} className={cn("rounded-md py-1.5 text-sm", mode === "pct" && "bg-card shadow-sm")}>Percentual (%)</button>
          </div>
          <Field label={mode === "pct" ? "Percentual" : "Valor"} hint={`Desconto calculado: ${money(value)}`}>
            <Input inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value)} autoFocus required />
          </Field>
          <Field label="Motivo"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} required={value > 0} minLength={value > 0 ? 3 : 0} /></Field>
          {needsPin && (
            <Field label="PIN do gerente" hint="Desconto acima do limite exige autorização.">
              <Input type="password" inputMode="numeric" required value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} maxLength={8} />
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy && <Spinner />} Aplicar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
