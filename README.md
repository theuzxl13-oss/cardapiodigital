# Sabor & Arte — Plataforma digital de restaurante

Sistema completo e integrado para restaurante, pronto para demonstração comercial:

| Módulo | Rota | Quem usa |
|---|---|---|
| Cardápio digital por QR Code + pedidos pela mesa | `/menu?mesa=05&k=<token>` | Cliente (sem instalar app) |
| Visualização dos pratos em **realidade aumentada** | botão “Visualizar na minha mesa” | Cliente |
| Painel do garçom | `/garcom` | Garçom |
| Painel da cozinha (KDS) | `/cozinha` | Cozinha |
| Caixa (PDV) | `/caixa` | Operador de caixa |
| Administração (dashboard, cardápio, mesas, QR Codes, funcionários, estoque, relatórios, auditoria, configurações) | `/admin` | Administrador / gerente |

Todos os módulos usam o **mesmo banco PostgreSQL (Supabase)** e se atualizam em **tempo real** (Supabase Realtime).
O pagamento é feito exclusivamente no caixa.

> Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · componentes no padrão shadcn/ui ·
> Supabase (PostgreSQL, Auth, Realtime, Storage) · `@google/model-viewer` + Three.js (WebXR, Scene Viewer, AR Quick Look) ·
> Recharts · jsPDF · ExcelJS · Vitest · Playwright.

---

## Sumário

1. [Início rápido](#1-início-rápido)
2. [Configuração do Supabase](#2-configuração-do-supabase)
3. [Publicação na Vercel](#3-publicação-na-vercel)
4. [Modo demonstração](#4-modo-demonstração)
5. [Funcionalidades](#5-funcionalidades)
6. [Realidade aumentada](#6-realidade-aumentada)
7. [Segurança e regras de negócio](#7-segurança-e-regras-de-negócio)
8. [Testes](#8-testes)
9. [Estrutura de pastas](#9-estrutura-de-pastas)
10. [Limitações e o que falta para operação real](#10-limitações-e-o-que-falta-para-operação-real)

Documentação técnica detalhada (modelo de dados, funções, políticas): [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

---

## 1. Início rápido

Pré-requisitos: Node.js 20+ e um projeto Supabase (nuvem ou local com Supabase CLI).

```bash
npm install
cp .env.example .env.local        # preencha as chaves do Supabase
# aplique migrações e seed (seção 2)
npm run seed:demo                 # cria funcionários, histórico fictício e pedidos ao vivo
npm run dev                       # http://localhost:3000
```

## 2. Configuração do Supabase

### Opção A — Supabase na nuvem

1. Crie um projeto em <https://supabase.com>.
2. Em **Project Settings → API**, copie `Project URL`, a chave **anon/publishable** e a **service_role** para `.env.local`.
3. Aplique o banco (escolha uma forma):
   - **CLI:** `npx supabase link --project-ref <ref>` e `npx supabase db push`; depois rode o conteúdo de `supabase/seed.sql` no **SQL Editor**.
   - **SQL Editor:** execute, em ordem, os arquivos de `supabase/migrations/` e depois `supabase/seed.sql`.
4. Em **Authentication → Providers → Email**, desative “Allow new users to sign up” (os funcionários são criados pelo administrador).
5. Rode `npm run seed:demo` (usa a service_role apenas no seu computador).
6. Realtime: a migração `…07_realtime_storage.sql` já adiciona as tabelas à publicação `supabase_realtime`.
   Confira em **Database → Publications** se necessário.
7. Storage: a mesma migração cria o bucket público `menu-media` (fotos e modelos 3D), com escrita restrita a gerente/admin.

### Opção B — Supabase local (Docker)

```bash
npx supabase start          # sobe Postgres, Auth, Realtime, Storage; aplica migrações e seed.sql
npx supabase status         # mostra URL e chaves para o .env.local
npm run seed:demo
```

### Variáveis de ambiente

Veja [`.env.example`](.env.example). Resumo:

| Variável | Onde é usada | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navegador e servidor | públicas; protegidas por RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **somente servidor** (criação/bloqueio de funcionários, seed) | nunca use prefixo `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | URLs impressas nos QR Codes | use o domínio público em produção |
| `NEXT_PUBLIC_RESTAURANT_ID` | restaurante atendido pela instalação | seed usa `00000000-0000-4000-a000-000000000001` |
| `NEXT_PUBLIC_DEMO_MODE` | exibe hub de demonstração e atalhos de login | `false` em produção |
| `DEMO_PASSWORD` | senha dos usuários do seed | padrão `Demo@1234` |

## 3. Publicação na Vercel

1. Envie o repositório ao GitHub e importe em <https://vercel.com/new> (framework detectado: Next.js).
2. Em **Settings → Environment Variables**, cadastre as variáveis da tabela acima (a `SUPABASE_SERVICE_ROLE_KEY` como *Sensitive*).
3. Defina `NEXT_PUBLIC_SITE_URL` com o domínio final (ex.: `https://sabor-arte.vercel.app`) **antes** de imprimir os QR Codes.
4. Deploy. No Supabase, em **Authentication → URL Configuration**, informe o mesmo domínio em *Site URL*.
5. Para produção real: `NEXT_PUBLIC_DEMO_MODE=false`, troque as senhas/PIN de demonstração e remova os usuários `@saborarte.demo`.

> HTTPS é obrigatório para AR (WebXR e Scene Viewer exigem URL pública segura). A Vercel já fornece HTTPS.

## 4. Modo demonstração

`npm run seed:demo` cria (todos marcados como fictícios):

- **Restaurante** “Sabor & Arte Bistrô” (dados e endereço fictícios), **15 mesas**, **5 categorias**, **30 produtos** com adicionais, alergênicos,
  fichas técnicas e **30 modelos 3D**;
- **36 insumos** com estoque e mínimos;
- **Funcionários** (senha `Demo@1234`):

| Papel | E-mail |
|---|---|
| Administrador (PIN de gerente **1234**) | `admin@saborarte.demo` |
| Caixa (2) | `caixa1@saborarte.demo`, `caixa2@saborarte.demo` |
| Cozinha (2) | `cozinha1@saborarte.demo`, `cozinha2@saborarte.demo` |
| Garçom (5) | `garcom1@saborarte.demo` … `garcom5@saborarte.demo` |

- **Histórico de 30 dias** (comandas, pedidos, pagamentos, sessões de caixa com sangrias e divergências) com `is_demo = true` —
  relatórios e dashboard sinalizam “Inclui dados fictícios de demonstração” e permitem excluí-los;
- **Pedidos ao vivo** nas mesas 02, 03, 08 e 11 (recebido, em preparo, pronto). A **Mesa 05 fica livre** para o roteiro abaixo.

Com `NEXT_PUBLIC_DEMO_MODE=true`, a página inicial lista os acessos e os links (QR) de todas as mesas.

### Roteiro de demonstração (o mesmo do teste E2E automatizado)

1. Na página inicial, abra **Mesa 05** (equivale a escanear o QR) no celular.
2. Toque em **Ver na mesa** no hambúrguer → modelo 3D → **Visualizar na minha mesa** (AR em aparelho compatível).
3. Adicione hambúrguer (escolha o ponto) e refrigerante → **Confirmar pedido**.
4. Em outra aba, entre como `cozinha1` → **Iniciar preparo** → **Pronto**.
5. Como `garcom1`, o pedido aparece em “Prontos para servir” (com som) → **Entregue**.
6. No celular: **Conta → Solicitar fechamento da conta**.
7. Como `caixa1`: **Abrir caixa** → comanda da Mesa 05 → pagamento (dinheiro com troco, PIX, cartão, divisão) → **Encerrar comanda**.
8. A mesa volta a ficar livre; o comprovante não fiscal é exibido; o dashboard do `admin` reflete a venda.

## 5. Funcionalidades

**Cliente (cardápio QR)** — capa e identidade visual, categorias, destaques, fotos, descrição, ingredientes, alergênicos, etiquetas
(vegetariano etc.), disponibilidade em tempo real, adicionais com regras (obrigatório/máximo), observações por item e por pedido,
carrinho, confirmação, acompanhamento de status (recebido → preparo → pronto → entregue), cancelamento antes do preparo,
chamar garçom, solicitar fechamento, vários pedidos na mesma comanda, notificações de status.

**Garçom** — login individual, mapa de mesas (livre/ocupada/conta solicitada), abertura de mesa, lançamento manual de pedidos
(com prioridade e observações) na mesma comanda do QR, pedidos em andamento, “prontos para servir” com alerta sonoro/vibração/
notificação, marcar entregue, chamados de clientes, valores da mesa, solicitar fechamento ao caixa, reabrir comanda,
liberar mesa aberta por engano, cancelamento com justificativa (PIN de gerente após início do preparo).

**Cozinha (KDS)** — interface escura de alto contraste e botões grandes; colunas Novos/Em preparo/Prontos; número do pedido, mesa,
horário, tempo decorrido com alerta de atraso configurável, prioridade, itens, adicionais e observações em destaque; alerta sonoro
configurável (liga/desliga e volume); histórico das últimas 3 horas; marcação de produtos indisponíveis; detecção de conflito quando
dois tablets alteram o mesmo pedido.

**Caixa (PDV)** — abertura/fechamento de caixa com conferência por forma de pagamento e cálculo de divergência; sangria e suprimento;
comandas abertas com busca por mesa/comanda; itens consumidos; taxa de serviço configurável (liga/desliga por comanda); desconto
(valor ou %) com limite e autorização por PIN acima dele; divisão igualitária e por itens (com taxa proporcional); pagamentos
parciais e combinados (dinheiro, PIX, débito, crédito); troco com sugestão de cédulas; confirmação antes de cada lançamento;
estorno com autorização; encerramento bloqueado com saldo pendente (salvo procedimento autorizado e justificado);
comprovante não fiscal 80 mm (pré-conta e final) e reimpressão.

**Administração** — dashboard em tempo real (faturamento diário/mensal, pedidos, ticket médio, mais vendidos, mesas ocupadas,
pedidos em preparo/concluídos, formas de pagamento, categorias, origem dos pedidos, tempos médios, estoque mínimo);
cardápio (CRUD, exclusão lógica, preços, imagens e modelos 3D com upload, adicionais, ficha técnica com custo, disponibilidade,
destaques, categorias); mesas (cadastro, ocupação, comandas); **QR Codes** (logo, número, instruções, impressão individual e em
lote, PNG e PDF, regeneração de token); funcionários (criação, papéis, PIN de supervisor, bloqueio, redefinição de senha,
produtividade); estoque (insumos, entradas/perdas/ajustes, baixa automática por venda pela ficha técnica, devolução em
cancelamentos, alertas de mínimo, valor em estoque); relatórios por período em **PDF e Excel** (financeiro, vendas, produtos,
categorias, operadores, garçons, sessões de caixa e divergências, cancelamentos, consumo de estoque); auditoria; configurações.

## 6. Realidade aumentada

Implementada com [`<model-viewer>`](https://modelviewer.dev) (Three.js por baixo), com integração **real** — não é uma imagem 2D sobre a câmera:

| Plataforma | Tecnologia | Requisito |
|---|---|---|
| Android (Chrome) | **WebXR** (AR na própria página) ou **Scene Viewer** (Google ARCore) | aparelho com ARCore, HTTPS |
| iPhone/iPad (Safari) | **AR Quick Look** com arquivo **USDZ** | iOS 12+ |
| Demais / sem AR | Visualização **3D interativa** (girar, ampliar) | qualquer navegador moderno |

- `ar-scale="fixed"` mantém a **escala real**: os modelos são construídos em metros (hambúrguer ≈ 12 cm, prato raso 27 cm).
- `ar-placement="floor"` posiciona o prato em superfícies horizontais (a mesa).
- Os 30 modelos de demonstração (`public/models/*.glb` + `*.usdz`) são **ilustrativos e procedurais**, gerados por
  `npm run models:generate` (`scripts/generate-models.mjs`, código próprio, licença MIT) — cada um representa de forma
  estilizada o prato cadastrado (hambúrguer com camadas, pizza margherita, petit gâteau etc.). O cliente vê o aviso
  “Modelo 3D ilustrativo”. As fotos de demonstração são renders desses modelos (`scripts/render-thumbnails.mjs`).
- **Para operação real**: faça fotogrametria dos pratos (ex.: Polycam, RealityScan, Object Capture da Apple) ou contrate
  modelagem; exporte GLB (até ~5 MB, texturas 1–2K) e USDZ, e envie em **Admin → Cardápio → Imagem e 3D/AR**.
  Desmarque “Modelo ilustrativo” quando o modelo for fiel ao prato. Sem USDZ, o model-viewer gera um automaticamente no iOS.

## 7. Segurança e regras de negócio

- **Autenticação** Supabase Auth (e-mail/senha); cadastro público desativado; perfil e papel definidos via `app_metadata`
  (o próprio usuário não consegue se promover).
- **RBAC** em três camadas: proxy do Next.js (rotas), layouts no servidor e — a camada definitiva — **RLS + funções no banco**.
- **Escritas operacionais apenas por funções transacionais** (`SECURITY DEFINER`): pedidos, status, cancelamentos, pagamentos,
  fechamento, caixa e estoque. As tabelas operacionais não têm permissão de escrita direta.
- **Preços calculados no servidor** a partir do cardápio vigente; o cliente envia só IDs e quantidades. Preço, nome e adicionais
  ficam gravados no item (snapshot) — mudanças futuras no cardápio não alteram pedidos.
- **Sessões de mesa seguras**: o QR contém um token secreto da mesa; ao escanear, o servidor cria uma sessão e guarda só o hash
  no banco; o token da sessão fica em **cookie httpOnly**. Trocar `?mesa=` na URL não dá acesso a outra mesa. A sessão expira e é
  revogada no encerramento da comanda. Limite de dispositivos por mesa e de pedidos por sessão (anti-abuso).
- **Idempotência**: pedidos e pagamentos usam chave única; duplo clique ou reenvio de rede não duplica. Comanda bloqueada
  (`FOR UPDATE`) durante pagamento e fechamento.
- **Uma comanda ativa por mesa** garantida por índice único parcial.
- **Cancelamento** exige justificativa; após o início do preparo exige gerente ou PIN de supervisor; registra responsável e autorizador.
- **Cozinha** não altera valores (trigger impede mudar qualquer coluna além de disponibilidade); **garçom** não acessa configurações.
- **Fechamento** bloqueado com saldo pendente ou pedidos ainda na cozinha; saldo pendente só com justificativa + autorização.
- **Auditoria** (`audit_log`) de pagamentos, estornos, descontos, cancelamentos, caixa, alterações de cardápio/preços, mesas e usuários.
- Nenhuma chave privilegiada no navegador; `service_role` só em Server Actions após verificar que o usuário é administrador.
- Cabeçalhos de segurança e proteção de origem (CSRF) nas rotas da mesa.

## 8. Testes

```bash
npm run typecheck
npm run test:unit                  # carrinho, divisão de conta, troco, parsing de valores

# Regras de negócio contra PostgreSQL real com as migrações (36 testes no total):
sudo service postgresql start      # ou qualquer PostgreSQL 15+
DATABASE_URL=postgres://postgres:postgres@localhost:5432/restaurante_test npm run db:local:setup
DATABASE_URL=postgres://postgres:postgres@localhost:5432/restaurante_test npm test

# Ponta a ponta (Playwright) com o app rodando e o seed aplicado:
npm i -D playwright-core && npx playwright install chromium
CHROMIUM_PATH=$(node -e "console.log(require('playwright-core').chromium.executablePath())") node tests/e2e/full-flow.mjs
```

Os testes de banco cobrem: QR inválido, comanda única por mesa, RLS para anônimos, preço calculado no servidor, adicionais
obrigatórios/inválidos, produto indisponível, idempotência concorrente, snapshot de preço, isolamento entre mesas, baixa e
devolução de estoque, fluxo de status com papéis, conflito de atualização simultânea, cancelamento com PIN, permissões da
cozinha e do garçom, caixa obrigatório, desconto com limite, pagamentos parciais/combinados/troco/duplicidade, encerramento,
invalidação da sessão do cliente, bloqueio com pedidos em preparo, fechamento forçado, estorno, divergência de caixa,
relatórios e proteção das funções de demonstração.

O teste E2E percorre os 21 passos do roteiro (cliente com modelo 3D carregado, cozinha, garçom, caixa com troco, encerramento,
mesa liberada, sessão invalidada, dashboard e telas administrativas, bloqueio de acesso), gerando capturas de tela.

## 9. Estrutura de pastas

```
├── public/
│   ├── brand/                 logo e capa
│   ├── images/products/       imagens dos pratos (renders dos modelos de demonstração)
│   └── models/                modelos 3D .glb (Android/WebXR) e .usdz (iOS)
├── scripts/
│   ├── generate-models.mjs    gera os modelos 3D procedurais em escala real
│   ├── render-thumbnails.mjs  renderiza as imagens dos produtos
│   ├── seed-demo.mjs          funcionários, histórico e pedidos de demonstração
│   └── local-db.sh            banco local para testes
├── src/
│   ├── app/
│   │   ├── page.tsx           início / hub de demonstração
│   │   ├── login/             login dos funcionários
│   │   ├── menu/              cardápio do cliente (QR)
│   │   ├── api/mesa/          rotas do cliente (entrar, estado, pedido, cancelar, chamar)
│   │   ├── garcom/            painel do garçom
│   │   ├── cozinha/           KDS
│   │   ├── caixa/             PDV, comanda e comprovante
│   │   └── admin/             dashboard, produtos, mesas, qrcodes, funcionarios, estoque, relatorios, auditoria, configuracoes
│   ├── components/
│   │   ├── ui/                componentes base (padrão shadcn/ui)
│   │   ├── menu/              cardápio, carrinho, conta, visualizador AR
│   │   ├── order/             seleção de adicionais, composer do garçom, lista de pedidos
│   │   ├── waiter/ kitchen/ cashier/ admin/ staff/
│   ├── hooks/                 tempo real (useLiveQuery), alertas sonoros, relógio
│   ├── lib/                   clientes Supabase, auth, API, carrinho, cobrança, QR, formatação, tipos
│   └── proxy.ts               proteção de rotas e renovação de sessão
├── supabase/
│   ├── migrations/            001 esquema · 002 auxiliares · 003 pedidos · 004 caixa · 005 admin/relatórios · 006 segurança · 007 realtime/storage
│   ├── seed.sql               dados de demonstração e geradores de histórico
│   └── config.toml            Supabase CLI
├── tests/
│   ├── unit/                  lógica pura
│   ├── db/                    regras de negócio no PostgreSQL (shim do Supabase incluso)
│   └── e2e/                   fluxo completo com Playwright
└── docs/ARQUITETURA.md
```

## 10. Limitações e o que falta para operação real

| Item | Situação nesta versão | Para operação real |
|---|---|---|
| **Documento fiscal (NFC-e/SAT)** | Comprovante **não fiscal**, identificado como tal. Tabela `fiscal_documents` preparada. | Integrar emissor homologado (ex.: Focus NFe, PlugNotas, NFE.io, Tecnospeed) após o pagamento; certificado digital A1 e cadastro na SEFAZ conforme a UF; consultar contador. |
| **Impressora térmica** | Impressão pelo navegador em layout 80 mm (impressora instalada no sistema). | Para impressão silenciosa/ESC-POS: QZ Tray, PrintNode ou agente local; impressão automática de comanda na cozinha. |
| **PIX** | Registro manual com aviso “integração demonstrativa”. | Cobrança dinâmica com QR e webhook de confirmação (API Pix do banco/PSP). |
| **Cartões (TEF/POS)** | Registro manual após aprovação na maquininha. | Integração TEF (SiTef, PayGo) ou maquininha com API (Stone, Cielo LIO etc.). |
| **Modelos 3D** | 30 modelos ilustrativos procedurais. | Fotogrametria/modelagem dos pratos reais e upload pelo admin. |
| **Fotos** | Renders dos modelos ilustrativos. | Fotografia profissional e upload pelo admin. |
| **Atualização do cliente** | Status da comanda por consulta a cada 5 s (o token fica em cookie httpOnly, fora do alcance do Realtime no navegador); disponibilidade de produtos via Realtime. | Opcional: canal Realtime *broadcast* privado por comanda. |
| **Abertura remota da mesa** | Quem fotografar o QR poderia abrir a mesa remotamente. | Desative “Cliente pode abrir a mesa pelo QR” em Configurações (garçom abre a mesa) e/ou regenere tokens periodicamente. |
| **PIN de supervisor** | Hash bcrypt; sem limite de tentativas no banco. | Limitar tentativas (ex.: rate limiting na borda) e PINs de 6+ dígitos. |
| **Multiestabelecimento** | Todas as tabelas e políticas já usam `restaurant_id`; a instalação atende um restaurante (`NEXT_PUBLIC_RESTAURANT_ID`). | Resolver restaurante por domínio/slug, cadastro de restaurantes e planos (SaaS). |
| **Offline** | Requer internet. | PWA com fila local para o KDS/garçom, se necessário. |
