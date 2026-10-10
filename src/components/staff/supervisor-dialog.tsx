"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";

/**
 * Diálogo de ação sensível: coleta justificativa e, quando necessário, o PIN de um
 * gerente/administrador. A verificação do PIN acontece no banco de dados.
 */
export function SupervisorDialog({
  open, onOpenChange, title, description, requireReason = true, askPin, confirmLabel = "Confirmar", destructive, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  requireReason?: boolean;
  askPin: boolean;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: (reason: string, pin: string | null) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onConfirm(reason.trim(), askPin ? pin : null);
      setReason(""); setPin("");
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {requireReason && (
            <Field label="Justificativa">
              <Textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Descreva o motivo" autoFocus />
            </Field>
          )}
          {askPin && (
            <Field label="PIN do gerente" hint="Autorização necessária para esta operação.">
              <Input type="password" inputMode="numeric" pattern="[0-9]{4,8}" required value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} maxLength={8} />
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Voltar</Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={busy}>
              {busy ? <Spinner /> : askPin ? <ShieldCheck /> : null} {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
