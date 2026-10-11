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

/**
 * Endereço público usado nos QR Codes: NEXT_PUBLIC_SITE_URL quando definido;
 * senão, o endereço atual do navegador (incluindo o basePath da instalação).
 */
export function publicSiteUrl() {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  return window.location.origin + (process.env.NEXT_PUBLIC_BASE_PATH ?? "");
}

export function tableMenuUrl(siteUrl: string, tableNumber: number, token: string) {
  return `${siteUrl}/menu?mesa=${String(tableNumber).padStart(2, "0")}&k=${token}`;
}

/** PDF A4 com 4 cartões por página (2x2, 85 x 117 mm), com linha de corte. */
export async function downloadCardsPdf(cards: { number: number; dataUrl: string }[], filename: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  cards.forEach((c, i) => {
    if (i > 0 && i % 4 === 0) doc.addPage();
    const slot = i % 4;
    const x = 15 + (slot % 2) * 95, y = 20 + Math.floor(slot / 2) * 135;
    doc.addImage(c.dataUrl, "PNG", x, y, 85, 117);
    doc.setDrawColor(200);
    doc.setLineDashPattern([1, 1], 0);
    doc.rect(x - 2, y - 2, 89, 121);
  });
  doc.save(filename);
}

/** Abre uma janela só com os cartões e chama a impressão do navegador. */
export function printCards(cards: { number: number; dataUrl: string }[]) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><title>QR Codes</title><style>
    @page { size: A4; margin: 10mm } body { margin: 0; font-family: sans-serif }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm } img { width: 100%; border: 1px dashed #bbb; break-inside: avoid }
  </style></head><body><div class="grid">${cards.map((c) => `<img src="${c.dataUrl}" alt="Mesa ${c.number}">`).join("")}</div>
  <script>window.onload = () => { window.print(); }<\/script></body></html>`);
  w.document.close();
  return true;
}
