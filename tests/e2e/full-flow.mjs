#!/usr/bin/env node
/**
 * Teste ponta a ponta do fluxo completo (QR Code → Pedido → Cozinha → Garçom → Caixa → Encerramento → Relatórios).
 * Requer o app rodando (BASE_URL, padrão http://localhost:3000) com o seed de demonstração aplicado.
 * Uso: node tests/e2e/full-flow.mjs   (variáveis: BASE_URL, CHROMIUM_PATH, SHOTS_DIR)
 */
import fs from "node:fs";
import { chromium, devices } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? "e2e-screenshots";
const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo@1234";
// DEMO=1: versão estática (GitHub Pages) — todas as telas em abas do MESMO navegador (banco compartilhado).
const DEMO = process.env.DEMO === "1";
let shared = null;
const pathIs = (u, p) => u.pathname.replace(/\/$/, "").endsWith(p);
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
let step = 0;
const log = (msg) => console.log(`✓ ${String(++step).padStart(2, "0")}. ${msg}`);
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${String(step).padStart(2, "0")}-${name}.png`, fullPage: false });

async function staff(email, path) {
  const ctx = DEMO
    ? (shared ??= await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" }))
    : await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`[${email}] pageerror:`, e.message));
  await page.goto(`${BASE}/login?next=${path}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => pathIs(u, path), { timeout: 30000 });
  return page;
}

try {
  // 1-4. Cliente chega, ocupa a Mesa 05, escaneia o QR e abre o cardápio
  const home = DEMO
    ? await (shared ??= await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" })).newPage()
    : await browser.newPage();
  await home.goto(BASE);
  await home.getByRole("link", { name: "05", exact: true }).waitFor({ timeout: 60000 });
  const href = await home.getByRole("link", { name: "05", exact: true }).getAttribute("href");
  await home.close();
  if (!href?.includes("k=")) throw new Error("Link da Mesa 05 não encontrado na home (modo demo)");
  const cctx = DEMO
    ? (shared ??= await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" }))
    : await browser.newContext({ ...devices["iPhone 13"], locale: "pt-BR" });
  const customer = await cctx.newPage();
  if (DEMO) await customer.setViewportSize({ width: 390, height: 844 });
  customer.on("pageerror", (e) => console.error("[cliente] pageerror:", e.message));
  await customer.goto(new URL(href, BASE + "/").toString());
  await customer.waitForURL((u) => pathIs(u, "/menu") && u.searchParams.get("mesa") === "05", { timeout: 30000 });
  await customer.getByText("Destaques da casa").waitFor();
  log("Cliente escaneou o QR da Mesa 05 e abriu o cardápio (token trocado por sessão httpOnly)");
  await shot(customer, "cardapio");

  // 5-7. Seleciona hambúrguer e visualiza em 3D/AR
  await customer.getByRole("button", { name: "Ver na mesa" }).first().click();
  const viewer = customer.locator("model-viewer");
  await viewer.waitFor({ timeout: 20000 });
  await customer.waitForFunction(() => document.querySelector("model-viewer")?.loaded === true, null, { timeout: 30000 });
  log("Modelo 3D carregado no <model-viewer> (AR: WebXR/Scene Viewer/Quick Look conforme o aparelho)");
  await shot(customer, "ar-viewer");
  await customer.keyboard.press("Escape");

  // 8. Adiciona hambúrguer (com escolha obrigatória) e refrigerante
  await customer.getByRole("button", { name: /^Hambúrguer Artesanal Clássico/ }).first().click();
  await customer.getByRole("button", { name: /Adicionar/ }).click();
  await customer.getByText(/Escolha uma opção em "Ponto da carne"/).waitFor();
  await customer.getByRole("button", { name: "Ao ponto" }).click();
  await customer.getByRole("button", { name: /Bacon extra/ }).click();
  await customer.getByRole("button", { name: /Adicionar/ }).click();
  await customer.getByRole("button", { name: /^Refrigerante Lata 350ml/ }).first().click();
  await customer.getByRole("button", { name: "Cola", exact: true }).click();
  await customer.getByRole("button", { name: /Adicionar/ }).click();
  log("Hambúrguer (ao ponto + bacon) e refrigerante (cola) no carrinho — validação de escolha obrigatória OK");

  // 9. Confirma o pedido
  await customer.getByRole("button", { name: /^2 ·/ }).click();
  await customer.getByText("R$ 52,90").first().waitFor();
  await shot(customer, "carrinho");
  await customer.getByRole("button", { name: "Confirmar pedido" }).click();
  await customer.getByText(/enviado para a cozinha/).waitFor();
  const orderNumber = (await customer.getByText(/^Pedido #\d+/).first().textContent()).match(/#(\d+)/)[1];
  log(`Pedido #${orderNumber} confirmado (preço recalculado no servidor: R$ 52,90)`);
  await shot(customer, "pedido-enviado");
  await customer.keyboard.press("Escape");

  // Segurança: trocar ?mesa= na URL não dá acesso a outra mesa
  await customer.goto(`${BASE}/menu?mesa=02`);
  await customer.getByText("Mesa diferente da sua sessão").waitFor();
  await customer.goto(`${BASE}/menu?mesa=05`);
  await customer.getByText("Destaques da casa").waitFor();
  log("Alterar a URL para ?mesa=02 é bloqueado (sessão vinculada à Mesa 05)");

  // 10-12. Cozinha recebe, inicia preparo e marca pronto
  const kitchen = await staff("cozinha1@saborarte.demo", "/cozinha");
  const card = kitchen.locator("article", { hasText: `#${orderNumber}` });
  await card.waitFor({ timeout: 25000 });
  log("Cozinha recebeu o pedido automaticamente");
  await shot(kitchen, "kds-recebido");
  await card.getByRole("button", { name: "Iniciar preparo" }).click();
  await kitchen.locator("article", { hasText: `#${orderNumber}` }).getByRole("button", { name: "Pronto" }).click({ timeout: 15000 });
  await kitchen.locator("article", { hasText: `#${orderNumber}` }).getByText("Aguardando garçom").waitFor({ timeout: 15000 });
  log("Cozinha iniciou o preparo e marcou como pronto");
  await shot(kitchen, "kds-pronto");

  // 13-14. Garçom é notificado e entrega
  const waiter = await staff("garcom1@saborarte.demo", "/garcom");
  const readyRow = waiter.locator("div", { hasText: `Pedido #${orderNumber}` }).filter({ has: waiter.getByRole("button", { name: "Entregue" }) }).last();
  await readyRow.waitFor({ timeout: 25000 });
  log("Garçom vê o pedido em “Prontos para servir”");
  await shot(waiter, "garcom-pronto");
  await readyRow.getByRole("button", { name: "Entregue" }).click();
  await waiter.getByText("Pedido marcado como entregue").waitFor();
  log("Garçom marcou o pedido como entregue");

  // Status atualizado para o cliente
  await customer.getByRole("button", { name: /Conta/ }).click();
  await customer.getByText("Entregue").first().waitFor({ timeout: 15000 });

  // 15. Cliente solicita fechamento
  const askBill = customer.getByRole("button", { name: "Solicitar fechamento da conta" });
  if (await askBill.isVisible().catch(() => false)) {
    await askBill.click();
    await customer.getByRole("button", { name: "Solicitar fechamento", exact: true }).click();
  }
  await customer.getByText("Fechamento solicitado").first().waitFor();
  log("Cliente solicitou o fechamento da conta");
  await shot(customer, "conta-solicitada");

  // 16-20. Caixa abre o caixa, vê itens, registra pagamento e encerra a comanda
  const cashier = await staff("caixa1@saborarte.demo", "/caixa");
  await cashier.getByText(/Caixa aberto às|Caixa fechado/).first().waitFor();
  const openBtn = cashier.getByRole("button", { name: "Abrir caixa" });
  if (await openBtn.isVisible()) {
    await openBtn.click();
    await cashier.getByLabel(/Fundo de troco/).fill("150,00");
    await cashier.getByRole("button", { name: "Confirmar" }).click();
    await cashier.getByText(/Caixa aberto às/).waitFor();
  }
  await cashier.getByRole("link", { name: /Mesa 05/ }).click();
  await cashier.getByText("Itens consumidos").waitFor();
  await cashier.getByText("Hambúrguer Artesanal Clássico").first().waitFor();
  const balanceText = await cashier.getByText("Saldo a pagar").locator("..").locator("span.tabular").textContent();
  const balance = Number(balanceText.replace(/[^\d,]/g, "").replace(",", "."));
  log(`Caixa visualiza todos os itens consumidos da Mesa 05 (saldo ${balanceText.trim()})`);
  await shot(cashier, "caixa-comanda");
  const received = Math.ceil((balance + 0.01) / 50) * 50;
  const change = (received - balance).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  await cashier.getByRole("button", { name: "Dinheiro" }).click();
  await cashier.getByLabel("Valor recebido (R$)").fill(String(received));
  await cashier.getByText(`R$ ${change}`).first().waitFor();
  await cashier.getByRole("button", { name: /^Registrar R\$/ }).click();
  await cashier.getByRole("button", { name: "Confirmar", exact: true }).click();
  await cashier.getByText(`troco R$ ${change}`).first().waitFor();
  log(`Pagamento em dinheiro registrado: recebido R$ ${received},00, troco R$ ${change}`);
  await cashier.getByRole("button", { name: "Encerrar comanda e liberar mesa" }).click();
  await cashier.waitForURL((u) => u.pathname.includes("/recibo"), { timeout: 20000 });
  await cashier.getByText("COMPROVANTE NÃO FISCAL").waitFor();
  log("Comanda encerrada; comprovante não fiscal gerado");
  await shot(cashier, "comprovante");

  // 21. Mesa disponível novamente e sessão do cliente encerrada
  await waiter.goto(`${BASE}/garcom`);
  const t5 = waiter.getByRole("link", { name: /^05/ });
  await t5.getByText("Livre").waitFor({ timeout: 15000 });
  log("Mesa 05 voltou a ficar livre no painel do garçom");
  await customer.reload();
  await customer.getByText(/encerrada|Escaneie o QR Code/i).first().waitFor({ timeout: 15000 });
  log("Sessão do cliente invalidada após o encerramento");

  // Relatórios administrativos atualizados
  const admin = await staff("admin@saborarte.demo", "/admin");
  await admin.getByText("Faturamento hoje").waitFor();
  await admin.getByText("Faturamento diário — últimos 30 dias").waitFor();
  await admin.waitForTimeout(1500);
  log("Dashboard administrativo atualizado");
  await shot(admin, "admin-dashboard");
  for (const [path, text, name] of [
    ["/admin/relatorios", "Faturamento diário", "admin-relatorios"],
    ["/admin/produtos", "Novo produto", "admin-produtos"],
    ["/admin/qrcodes", "Baixar PDF", "admin-qrcodes"],
    ["/admin/estoque", "Últimas movimentações", "admin-estoque"],
    ["/admin/funcionarios", "Novo funcionário", "admin-funcionarios"],
    ["/admin/auditoria", "Cancelamento|Pagamento registrado", "admin-auditoria"],
  ]) {
    await admin.goto(BASE + path);
    await admin.getByText(new RegExp(text)).first().waitFor({ timeout: 20000 });
    await admin.waitForTimeout(path === "/admin/qrcodes" ? 2500 : 800);
    log(`Admin: ${path}`);
    await shot(admin, name);
  }

  // Controle de acesso: garçom não acessa admin
  await waiter.goto(`${BASE}/admin`);
  await waiter.waitForURL((u) => u.pathname.includes("/acesso-negado"), { timeout: 20000 });
  log("Garçom é bloqueado na área administrativa");

  console.log(`\nFluxo completo aprovado. Capturas em ${SHOTS}/`);
} catch (e) {
  console.error("\n✗ FALHA:", e.message);
  for (const ctx of browser.contexts()) for (const p of ctx.pages()) await p.screenshot({ path: `${SHOTS}/falha-${Date.now()}.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
