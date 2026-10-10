"use client";

import QRCode from "qrcode";
import { asset } from "@/lib/asset";

/** Gera QR Code PNG (data URL) com a logo do restaurante ao centro. Correção de erro alta (H). */
export async function qrWithLogo(url: string, size = 600, logoSrc = asset("/brand/logo.svg")): Promise<string> {
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, url, { errorCorrectionLevel: "H", margin: 2, width: size, color: { dark: "#1b110d", light: "#ffffff" } });
  const ctx = canvas.getContext("2d")!;
  try {
    const img = await loadImage(logoSrc);
    const s = size * 0.2;
    const x = (size - s) / 2;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, x - 8, x - 8, s + 16, s + 16, 14);
    ctx.fill();
    ctx.drawImage(img, x, x, s, s);
  } catch {
    /* sem logo: QR continua válido */
  }
  return canvas.toDataURL("image/png");
}

/** Cartão de mesa pronto para impressão: título, QR, número e instruções. */
export async function tableCard(url: string, tableNumber: number, restaurantName: string): Promise<string> {
  const W = 800, H = 1100;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fffaf3"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1b110d"; ctx.fillRect(0, 0, W, 170);
  ctx.fillStyle = "#fbeee0"; ctx.textAlign = "center";
  ctx.font = "600 46px Georgia, serif"; ctx.fillText(restaurantName, W / 2, 95);
  ctx.font = "26px sans-serif"; ctx.fillText("Cardápio digital · Realidade aumentada", W / 2, 140);
  const qr = await loadImage(await qrWithLogo(url, 560));
  ctx.drawImage(qr, (W - 560) / 2, 220, 560, 560);
  ctx.fillStyle = "#b5532d"; ctx.font = "bold 88px sans-serif";
  ctx.fillText(`MESA ${String(tableNumber).padStart(2, "0")}`, W / 2, 880);
  ctx.fillStyle = "#3b2a20"; ctx.font = "28px sans-serif";
  ["1. Aponte a câmera do celular para o código", "2. Escolha seus pratos e veja-os na sua mesa em AR", "3. Confirme o pedido · pagamento no caixa"].forEach((l, i) => ctx.fillText(l, W / 2, 950 + i * 44));
  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
