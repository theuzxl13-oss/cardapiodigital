<div align="center">

# 🍽️ Sabor & Arte — Sistema Digital para Restaurantes

**Cardápio por QR Code · Realidade Aumentada · Pedidos pela mesa · Garçom · Cozinha · Caixa · Gestão**

Next.js 16 · React 19 · TypeScript · Tailwind CSS · Supabase (PostgreSQL, Auth, Realtime, Storage) · Three.js / model-viewer

### 👉 [Ver demonstração online](https://theuzxl13-oss.github.io/cardapiodigital/)

</div>

> **Sobre a demonstração online:** roda 100% no navegador (GitHub Pages). Um PostgreSQL completo é executado na própria página
> com **as mesmas migrações, regras e permissões** do sistema real; os dados ficam salvos só no seu navegador. Abra cliente,
> cozinha, garçom e caixa em **abas diferentes do mesmo navegador** para ver tudo se comunicando. Senha dos acessos: `Demo@1234`.
> Para operação real (dados compartilhados entre aparelhos), publique com Supabase + Vercel — veja abaixo.

---

## 📑 Índice

1. [O que é o sistema](#-o-que-é-o-sistema)
2. [Como funciona — visão geral](#-como-funciona--visão-geral)
3. [Os módulos, um por um](#-os-módulos-um-por-um)
4. [Jornada completa de um pedido](#-jornada-completa-de-um-pedido)
5. [Realidade aumentada](#-realidade-aumentada)
6. [Quem pode fazer o quê (permissões)](#-quem-pode-fazer-o-quê-permissões)
7. [Segurança e regras de negócio](#-segurança-e-regras-de-negócio)
8. [Como colocar no ar (passo a passo)](#-como-colocar-no-ar-passo-a-passo)
9. [Modo demonstração e acessos](#-modo-demonstração-e-acessos)
10. [Rodar no computador (desenvolvedores)](#-rodar-no-computador-desenvolvedores)
11. [Demonstração no GitHub Pages](#-demonstração-no-github-pages)
11. [Testes](#-testes)
12. [Estrutura do projeto](#-estrutura-do-projeto)
13. [Limitações e próximos passos](#-limitações-e-próximos-passos)

---

## 🧭 O que é o sistema

Uma plataforma completa para o dia a dia de um restaurante. O cliente pede pelo próprio celular, a cozinha recebe na hora,
o garçom é avisado quando o prato fica pronto e o caixa fecha a conta — tudo **conectado ao mesmo banco de dados e atualizado
em tempo real**.

| Para quem | O que ganha |
|---|---|
| **Cliente** | Cardápio bonito no celular, sem instalar app; vê o prato em 3D sobre a mesa; pede, acompanha e chama o garçom |
| **Garçom** | Mapa das mesas, lança pedidos, recebe aviso de prato pronto e de cliente chamando |
| **Cozinha** | Tela grande com os pedidos na ordem certa, tempo de espera e alerta sonoro |
| **Caixa** | Conta completa da mesa, divisão, vários pagamentos, troco e comprovante |
| **Dono / gerente** | Faturamento, mais vendidos, estoque, funcionários, QR Codes e relatórios em PDF/Excel |

> 💳 **O pagamento é feito sempre no caixa**, presencialmente. O cliente não paga pelo celular.

---

## ⚙️ Como funciona — visão geral

```
                    ┌──────────────────────────────┐
  📱 Cliente  ────► │  Cardápio digital (QR Code)  │ ──┐
                    └──────────────────────────────┘   │
                    ┌──────────────────────────────┐   │      ┌──────────────────────────┐
  🧑‍🍳 Garçom   ────► │  Painel do garçom            │ ──┤      │      BANCO DE DADOS      │
                    └──────────────────────────────┘   ├────► │  (Supabase / PostgreSQL) │
                    ┌──────────────────────────────┐   │      │                          │
  👨‍🍳 Cozinha  ────► │  Painel da cozinha (KDS)     │ ──┤      │  • guarda tudo           │
                    └──────────────────────────────┘   │      │  • aplica as regras      │
                    ┌──────────────────────────────┐   │      │  • avisa as telas em     │
  💰 Caixa    ────► │  Caixa (PDV)                 │ ──┤      │    tempo real            │
                    └──────────────────────────────┘   │      └──────────────────────────┘
                    ┌──────────────────────────────┐   │
  📊 Gerente  ────► │  Administração               │ ──┘
                    └──────────────────────────────┘
```

**Três ideias fazem o sistema funcionar:**

1. **Uma única fonte de verdade.** Todas as telas leem e gravam no mesmo banco. Um pedido feito no celular aparece na cozinha
   no mesmo instante; um pagamento no caixa atualiza o dashboard do gerente.
2. **As regras moram no banco de dados.** Preço, permissões, cancelamentos e fechamento de conta são validados no servidor.
   Mesmo que alguém tente burlar a tela, o banco recusa.
3. **Comanda por mesa.** Cada mesa tem **uma comanda ativa**. Pedidos do cliente (QR) e do garçom caem na mesma comanda,
   que só é encerrada pelo caixa.

---

## 🧩 Os módulos, um por um

### 1. 📱 Cardápio digital (cliente) — `/menu`

Cada mesa tem um **QR Code exclusivo**. Ao escanear, o cliente abre o cardápio já identificado com o número da mesa.

- Categorias (entradas, pratos principais, porções, bebidas, sobremesas) e destaques da casa
- Foto, descrição, preço, ingredientes, **alergênicos** e etiquetas (vegetariano, mais pedido…)
- **Disponibilidade em tempo real** — se a cozinha marca um item como esgotado, ele some do pedido na hora
- **Adicionais e personalização** (ex.: ponto da carne obrigatório, bacon extra) e observações
- Carrinho, confirmação e **acompanhamento do status**: recebido → em preparo → pronto → entregue
- Botões **Chamar garçom** e **Solicitar fechamento da conta**
- Vários pedidos durante a visita, todos somados na mesma comanda
- Botão **“Ver na mesa”** para abrir o prato em 3D / realidade aumentada

### 2. 🧑‍🍳 Painel do garçom — `/garcom`

Feito para celular ou tablet.

- **Mapa de mesas** com cores: 🟢 livre · 🟡 ocupada · 🟣 conta solicitada
- Abrir mesa e **lançar pedidos manualmente** (para quem não quer usar o QR), com prioridade e observações
- Lista **“Prontos para servir”** com **alerta sonoro e vibração** → botão **Entregue**
- Lista de **chamados** dos clientes (chamar garçom / pedir a conta)
- Valores da mesa, solicitar fechamento ao caixa, cancelar pedido (com justificativa)

### 3. 👨‍🍳 Painel da cozinha (KDS) — `/cozinha`

Tela escura, alto contraste e botões grandes, pensada para monitor ou tablet.

- Três colunas: **Novos · Em preparo · Prontos**
- Cada cartão mostra mesa, número do pedido, horário, **tempo decorrido** (fica amarelo/vermelho se atrasar), prioridade,
  itens, adicionais e observações em destaque
- Botões **Iniciar preparo** → **Pronto** (e voltar etapa, se necessário)
- **Alerta sonoro** configurável a cada novo pedido; histórico das últimas horas
- Marcar produtos como **indisponíveis**
- Se dois tablets mexerem no mesmo pedido ao mesmo tempo, o sistema detecta e avisa

### 4. 💰 Caixa (PDV) — `/caixa`

- **Abertura de caixa** (fundo de troco), **sangria**, **suprimento** e **fechamento** com conferência e cálculo de divergência
- Lista de comandas abertas, com busca rápida pelo número da mesa
- Itens consumidos, **taxa de serviço** (liga/desliga), **desconto** (valor ou %)
- **Divisão da conta**: em partes iguais ou pelos itens de cada pessoa
- **Pagamentos parciais e combinados**: dinheiro, PIX, débito e crédito — com **cálculo de troco**
- Confirmação antes de cada lançamento financeiro e **estorno** com autorização
- **Encerrar comanda** libera a mesa e gera o **comprovante não fiscal** (layout de bobina 80 mm)

### 5. 📊 Administração — `/admin`

| Seção | O que faz |
|---|---|
| **Dashboard** | Faturamento do dia e do mês, ticket médio, pedidos, mais vendidos, mesas ocupadas, formas de pagamento, tempos médios, estoque baixo |
| **Cardápio** | Cadastrar/editar produtos, preços, fotos, **modelos 3D**, categorias, adicionais e ficha técnica |
| **Mesas** | Cadastro, ocupação atual e histórico de comandas |
| **QR Codes** | Gera cartões com logo, número da mesa e instruções; imprime um ou todos; baixa PNG ou PDF |
| **Funcionários** | Criar usuários, definir função, PIN de gerente, bloquear acesso, redefinir senha |
| **Estoque** | Insumos, entradas, perdas, ajustes; **baixa automática a cada venda** pela ficha técnica; alerta de mínimo |
| **Relatórios** | Por período, com exportação em **PDF e Excel** (vendas, produtos, caixa, cancelamentos, estoque…) |
| **Auditoria** | Registro de quem fez o quê e quando |
| **Configurações** | Taxa de serviço, limite de desconto, regras da mesa, alertas da cozinha, rodapé do comprovante |

---

## 🔄 Jornada completa de um pedido

```
 📱 CLIENTE              👨‍🍳 COZINHA             🧑‍🍳 GARÇOM             💰 CAIXA
 ─────────              ───────────            ──────────            ────────
 Escaneia o QR
 da Mesa 05
      │
 Vê o hambúrguer
 em 3D na mesa
      │
 Pede hambúrguer
 + refrigerante ──────► Pedido aparece
      │                 em "Novos" 🔔
      │                      │
 Status: "Em  ◄──────── Iniciar preparo
 preparação"                 │
      │                      │
 Status: "Pronto" ◄──── Pronto ───────────► Aviso: "Pedido
      │                                     pronto — Mesa 05" 🔔
      │                                           │
 Status: "Entregue" ◄────────────────────── Entregue
      │
 Solicita fechamento ─────────────────────────────────────────► Comanda aparece
                                                                destacada
                                                                     │
                                                                Cliente paga
                                                                presencialmente
                                                                     │
                                                                Registra pagamento
                                                                + troco
                                                                     │
                                                                Encerra comanda
                                                                     │
                         Mesa 05 volta a ficar LIVRE  ◄──────────────┘
                         Dashboard e relatórios atualizados 📊
```

### Estados de um pedido

| Status | Quem muda | Significado |
|---|---|---|
| 🔵 **Pedido recebido** | automático | Chegou na cozinha |
| 🟡 **Em preparação** | Cozinha | Começou a ser preparado |
| 🟢 **Pronto para servir** | Cozinha | Garçom é notificado |
| ⚪ **Entregue** | Garçom | Está na mesa |
| 🔴 **Cancelado** | Garçom/Caixa/Gerente | Sempre com justificativa registrada |

### Estados de uma comanda

`Aberta` → `Fechamento solicitado` (cliente ou garçom pediu a conta) → `Encerrada` (caixa) — e a mesa fica livre.

---

## 🥽 Realidade aumentada

O cliente toca em **“Ver na mesa”**, gira o prato em 3D e depois toca em **“Visualizar na minha mesa”**: a câmera abre e o
prato aparece **sobre a mesa, em tamanho real**. Ele pode andar em volta para ver de vários ângulos.

| Aparelho | Tecnologia usada |
|---|---|
| Android (Chrome) | WebXR ou Google Scene Viewer (ARCore) |
| iPhone / iPad (Safari) | Apple AR Quick Look (arquivo USDZ) |
| Aparelhos sem AR | Visualização 3D interativa (girar e ampliar) |

- É **realidade aumentada de verdade**, não uma imagem colada sobre a câmera.
- Os modelos são feitos **em metros** (o hambúrguer tem ~12 cm, o prato ~27 cm), por isso aparecem no tamanho real.
- O projeto inclui **30 modelos 3D ilustrativos**, um para cada prato do cardápio de demonstração. O cliente vê o aviso
  *“Modelo 3D ilustrativo”*.
- **Para uso real:** fotografe/escaneie os pratos (apps como Polycam ou RealityScan), exporte em **GLB** (e **USDZ** para iPhone)
  e envie em **Administração → Cardápio → Imagem e 3D/AR**.
- ⚠️ A AR só funciona com o site publicado em **HTTPS** (a Vercel já fornece).

---

## 👥 Quem pode fazer o quê (permissões)

| Ação | Cliente | Garçom | Cozinha | Caixa | Gerente | Admin |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Ver cardápio e fazer pedidos da **própria** mesa | ✅ | ✅ | | ✅ | ✅ | ✅ |
| Abrir mesa / lançar pedido | | ✅ | | ✅ | ✅ | ✅ |
| Iniciar preparo / marcar pronto | | | ✅ | | ✅ | ✅ |
| Marcar entregue | | ✅ | | | ✅ | ✅ |
| Cancelar pedido **antes** do preparo | ✅¹ | ✅ | | ✅ | ✅ | ✅ |
| Cancelar pedido **depois** do preparo | | 🔑 | | 🔑 | ✅ | ✅ |
| Marcar produto indisponível | | ✅ | ✅ | | ✅ | ✅ |
| Receber pagamentos e fechar conta | | | | ✅ | ✅ | ✅ |
| Desconto acima do limite / estorno / fechar com saldo | | | | 🔑 | ✅ | ✅ |
| Cardápio, mesas, estoque, relatórios | | | | | ✅ | ✅ |
| Funcionários e configurações | | | | | | ✅ |

¹ apenas pedidos feitos no próprio celular · 🔑 = exige o **PIN de um gerente**

---

## 🔒 Segurança e regras de negócio

**Proteções**

- 🔐 **Login individual** para cada funcionário; ninguém consegue se cadastrar sozinho.
- 🧾 **Preços calculados no servidor.** O celular envia só *qual* produto e *quantos*; o valor vem do cardápio oficial.
- 🪑 **Mesa protegida.** O QR Code contém um código secreto. Trocar `?mesa=05` por `?mesa=02` no endereço **não** dá acesso à
  outra mesa. A sessão do cliente expira e é cancelada quando a conta é encerrada.
- 🔁 **Sem pedidos ou pagamentos duplicados**, mesmo com duplo clique ou internet instável.
- 🗝️ **Nenhuma chave secreta no navegador.** Chaves privilegiadas ficam só no servidor.
- 📜 **Auditoria** de pagamentos, estornos, descontos, cancelamentos, caixa, preços e usuários.

**Regras garantidas pelo banco de dados**

- Uma mesa nunca tem duas comandas ativas.
- O preço do pedido fica gravado no momento da confirmação — mudar o cardápio depois **não altera** pedidos antigos.
- A cozinha não altera valores; o garçom não acessa configurações.
- Cancelamentos registram **quem fez, quem autorizou e o motivo**.
- A comanda **não fecha** com saldo pendente (exceto com justificativa + PIN de gerente) nem com pedidos ainda na cozinha.
- Não é possível pagar mais do que o saldo nem registrar o mesmo pagamento duas vezes.
- O estoque baixa a cada venda e volta em caso de cancelamento.

---

## 🚀 Como colocar no ar (passo a passo)

> O link do GitHub mostra apenas o **código**. Para usar o sistema é preciso publicá-lo.
> São necessárias duas contas gratuitas: **Supabase** (banco de dados) e **Vercel** (hospedagem). Leva cerca de 15 minutos.

### Passo 1 — Criar o banco de dados (Supabase)

1. Crie uma conta em [supabase.com](https://supabase.com) → **New project**.
2. Abra **SQL Editor** e execute, **um por vez e nesta ordem**, o conteúdo dos arquivos:

   | Ordem | Arquivo |
   |:-:|---|
   | 1 | `supabase/migrations/20261010000001_schema.sql` |
   | 2 | `supabase/migrations/20261010000002_helpers.sql` |
   | 3 | `supabase/migrations/20261010000003_orders.sql` |
   | 4 | `supabase/migrations/20261010000004_cashier.sql` |
   | 5 | `supabase/migrations/20261010000005_admin_reports.sql` |
   | 6 | `supabase/migrations/20261010000006_security.sql` |
   | 7 | `supabase/migrations/20261010000007_realtime_storage.sql` |
   | 8 | `supabase/seed.sql` *(cardápio, mesas e estoque de demonstração)* |

3. Em **Authentication → Sign In / Providers → Email**, desligue **“Allow new users to sign up”**.
4. Em **Project Settings → API**, copie: **Project URL**, **anon key** e **service_role key**.

### Passo 2 — Publicar o site (Vercel)

1. Crie uma conta em [vercel.com](https://vercel.com) entrando com o GitHub.
2. **Add New → Project** → escolha o repositório `cardapiodigital`.
3. Em **Environment Variables**, cadastre:

   | Nome | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL do Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key *(marque como Sensitive)* |
   | `NEXT_PUBLIC_RESTAURANT_ID` | `00000000-0000-4000-a000-000000000001` |
   | `NEXT_PUBLIC_DEMO_MODE` | `true` |

4. Clique em **Deploy**. Você receberá um endereço como `https://cardapiodigital-xxx.vercel.app`.
5. Adicione a variável `NEXT_PUBLIC_SITE_URL` com esse endereço e faça **Redeploy** (é o endereço impresso nos QR Codes).
6. No Supabase, em **Authentication → URL Configuration**, coloque o mesmo endereço em **Site URL**.

### Passo 3 — Criar funcionários e dados de demonstração

No computador (com [Node.js](https://nodejs.org) instalado), dentro da pasta do projeto:

```bash
npm install
cp .env.example .env.local      # preencha com as chaves do Supabase
npm run seed:demo
```

Pronto! Abra o endereço da Vercel. ✅

---

## 🎬 Modo demonstração e acessos

Com `NEXT_PUBLIC_DEMO_MODE=true`, a página inicial mostra os **links de todas as mesas** e os **acessos de teste**.

**Senha de todos os usuários:** `Demo@1234` · **PIN de gerente (admin):** `1234`

| Função | E-mail | Tela |
|---|---|---|
| Administrador | `admin@saborarte.demo` | `/admin` |
| Caixa | `caixa1@saborarte.demo` · `caixa2@saborarte.demo` | `/caixa` |
| Cozinha | `cozinha1@saborarte.demo` · `cozinha2@saborarte.demo` | `/cozinha` |
| Garçom | `garcom1@saborarte.demo` … `garcom5@saborarte.demo` | `/garcom` |

**O que vem pronto:** 15 mesas · 30 produtos em 5 categorias · 30 modelos 3D · 36 insumos com ficha técnica ·
10 funcionários · 30 dias de vendas fictícias (marcadas como demonstração nos relatórios) · pedidos em andamento nas mesas
02, 03, 08 e 11. **A Mesa 05 fica livre** para você testar.

### Roteiro sugerido de apresentação

1. 📱 No celular, abra o link da **Mesa 05**.
2. Toque em **Ver na mesa** no hambúrguer → **Visualizar na minha mesa**.
3. Adicione hambúrguer e refrigerante → **Confirmar pedido**.
4. 💻 Em outra aba, entre como **cozinha1** → **Iniciar preparo** → **Pronto**.
5. Entre como **garcom1** → o pedido aparece em “Prontos para servir” → **Entregue**.
6. 📱 No celular: **Conta → Solicitar fechamento da conta**.
7. Entre como **caixa1** → **Abrir caixa** → Mesa 05 → registre o pagamento → **Encerrar comanda**.
8. Entre como **admin** → veja o dashboard atualizado.

> ⚠️ Antes de usar em operação real: `NEXT_PUBLIC_DEMO_MODE=false`, troque senhas e PIN e remova os usuários `@saborarte.demo`.

---

## 💻 Rodar no computador (desenvolvedores)

**Requisitos:** Node.js 20+ e um projeto Supabase (nuvem, ou local com Docker).

```bash
npm install
cp .env.example .env.local     # chaves do Supabase
npm run seed:demo
npm run dev                    # http://localhost:3000
```

Supabase local (Docker): `npx supabase start` aplica migrações e seed automaticamente; `npx supabase status` mostra as chaves.

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run typecheck` | Verificação de tipos |
| `npm test` | Testes (unitários + banco, se `DATABASE_URL` estiver definida) |
| `npm run seed:demo` | Funcionários, histórico e pedidos de demonstração |
| `npm run models:generate` | Regera os modelos 3D de demonstração |
| `npm run db:local:setup` | Cria banco PostgreSQL local para os testes |

Variáveis de ambiente: veja [`.env.example`](.env.example).

---

## 🌐 Demonstração no GitHub Pages

A versão online é gerada a partir do mesmo código por `npm run demo:build` (pasta `demo/`):

- `demo/overrides/` substitui apenas o que depende de servidor: o cliente Supabase vira um adaptador que executa as
  consultas no **PGlite** (PostgreSQL em WebAssembly) com as migrações de `supabase/`; páginas de servidor viram páginas de navegador.
- O banco é compartilhado entre abas (worker com eleição de líder) e salvo no IndexedDB; o botão **Restaurar dados** recria tudo.
- O resultado (`demo-dist/`) é publicado no branch `gh-pages`.

```bash
npm run demo:build                          # gera demo-dist/
DEMO=1 BASE_URL=http://localhost:4000/cardapiodigital node tests/e2e/full-flow.mjs   # E2E contra a versão estática
```

---

## 🧪 Testes

| Tipo | Onde | O que cobre |
|---|---|---|
| **Unitários** | `tests/unit/` | Carrinho, divisão de conta, troco, leitura de valores |
| **Regras de negócio** | `tests/db/` | 28 cenários no PostgreSQL real: preços no servidor, duplicidade, isolamento entre mesas, permissões, PIN, caixa, fechamento, estoque, relatórios |
| **Ponta a ponta** | `tests/e2e/` | Navegador automatizado percorrendo o roteiro completo, do QR Code ao relatório |

```bash
npm run test:unit
DATABASE_URL=postgres://postgres:postgres@localhost:5432/restaurante_test npm run db:local:setup
DATABASE_URL=postgres://postgres:postgres@localhost:5432/restaurante_test npm test
node tests/e2e/full-flow.mjs   # com o app rodando e o seed aplicado (requer playwright-core + Chromium)
```

---

## 🗂️ Estrutura do projeto

```
cardapiodigital/
├── src/
│   ├── app/                     ← telas (rotas)
│   │   ├── page.tsx             início / hub de demonstração
│   │   ├── login/               login dos funcionários
│   │   ├── menu/                📱 cardápio do cliente
│   │   ├── api/mesa/            rotas seguras do cliente (pedido, estado, chamar, cancelar)
│   │   ├── garcom/              🧑‍🍳 painel do garçom
│   │   ├── cozinha/             👨‍🍳 KDS
│   │   ├── caixa/               💰 PDV, comanda e comprovante
│   │   └── admin/               📊 dashboard e gestão
│   ├── components/              ← componentes visuais de cada módulo
│   ├── hooks/                   tempo real, alertas sonoros
│   ├── lib/                     conexão Supabase, regras de carrinho/conta, QR Code, formatação
│   └── proxy.ts                 proteção das áreas restritas
├── supabase/
│   ├── migrations/              ← banco de dados: tabelas, regras, permissões
│   ├── seed.sql                 dados de demonstração
│   └── config.toml
├── public/
│   ├── models/                  modelos 3D (.glb Android / .usdz iPhone)
│   ├── images/products/         imagens dos pratos
│   └── brand/                   logo e capa
├── scripts/                     seed, geração de modelos 3D e imagens
├── tests/                       unit · db · e2e
└── docs/ARQUITETURA.md          documentação técnica detalhada
```

📘 Detalhes técnicos (tabelas, funções do banco, políticas de acesso): **[docs/ARQUITETURA.md](docs/ARQUITETURA.md)**

---

## 🚧 Limitações e próximos passos

Recursos que dependem de serviços externos estão **preparados e claramente sinalizados** na interface:

| Recurso | Hoje | Para operação real |
|---|---|---|
| **Nota fiscal (NFC-e/SAT)** | Comprovante **não fiscal** (identificado como tal); estrutura do banco já preparada | Integrar emissor homologado + certificado digital (consultar contador) |
| **Impressora térmica** | Impressão pelo navegador em layout 80 mm | QZ Tray / PrintNode para impressão direta (ESC/POS) |
| **PIX** | Registro manual após conferir no banco | Cobrança com QR dinâmico e confirmação automática |
| **Cartão** | Registro manual após aprovação na maquininha | Integração TEF ou maquininha com API |
| **Modelos 3D e fotos** | Ilustrativos (demonstração) | Fotogrametria e fotos reais, enviadas pelo admin |
| **QR fotografado** | Quem tiver foto do QR poderia abrir a mesa de fora | Desligar “cliente abre a mesa” em Configurações (garçom abre) |
| **PIN de gerente** | Sem limite de tentativas | Limitar tentativas e usar PIN de 6+ dígitos |
| **Vários restaurantes** | Banco já preparado (`restaurant_id` em tudo); instalação atende um restaurante | Cadastro de restaurantes por domínio e planos (SaaS) |
| **Sem internet** | Requer conexão | Modo offline (PWA) para cozinha e garçom |

---

<div align="center">

Dados, nomes e endereço da demonstração são **fictícios**.

</div>
