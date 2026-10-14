"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Smartphone } from "lucide-react";
import { qrWithLogo } from "@/lib/qr";

/**
 * QR Code para abrir um endereço do site no celular (ex.: testar a realidade aumentada,
 * que precisa da câmera do telefone). `path` é relativo ao site, ex.: "/menu?mesa=05&k=...".
 */
export function OpenOnPhone({ path, title = "Teste no celular", description }: { path: string; title?: string; description?: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    const absolute = window.location.origin + (process.env.NEXT_PUBLIC_BASE_PATH ?? "") + path;
    qrWithLogo(absolute, 480).then((data) => {
      if (!cancelled) { setQr(data); setUrl(absolute); }
    });
    return () => { cancelled = true; };
  }, [path]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card p-5 text-center sm:flex-row sm:text-left">
      <div className="size-40 shrink-0 overflow-hidden rounded-xl border bg-white p-1.5">
        {qr && <Image src={qr} alt="QR Code para abrir no celular" width={480} height={480} unoptimized className="size-full" />}
      </div>
      <div className="space-y-2">
        <p className="flex items-center justify-center gap-2 font-semibold sm:justify-start"><Smartphone className="size-5 text-primary" /> {title}</p>
        <p className="text-sm text-muted-foreground">
          {description ?? "Aponte a câmera do celular para o código. No cardápio, toque em “Ver na mesa” e depois em “Visualizar na minha mesa” para abrir a câmera e ver o prato sobre a sua mesa."}
        </p>
        <p className="text-xs text-muted-foreground">Android: Chrome com ARCore · iPhone: Safari (iOS 12+). Precisa de HTTPS.</p>
        {url && <p className="break-all text-[11px] text-muted-foreground/70">{url}</p>}
      </div>
    </div>
  );
}
