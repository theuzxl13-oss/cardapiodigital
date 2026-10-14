# Arquitetura

## Visão geral

```
 Celular do cliente ──(QR: /menu?mesa=05&k=TOKEN)──►  Next.js (Vercel)
                                                      │  /api/mesa/*  (cookie httpOnly com token de sessão)
 Garçom / Cozinha / Caixa / Admin (navegador) ────────┤  Server Components + Server Actions (service_role só aqui)
        │  supabase-js (chave pública + JWT do funcionário)
        ▼                                             ▼
 ┌───────────────────────────── Supabase ─────────────────────────────┐
 │ Auth (funcionários)  ·  PostgREST (RLS)  ·  Realtime  ·  Storage    │
 │ PostgreSQL: tabelas + funções transacionais + políticas RLS + audit │
 └─────────────────────────────────────────────────────────────────────┘
```

Princípios:

1. **O banco é a fonte da verdade e o guardião das regras.** Toda operação que muda o estado operacional ou financeiro é uma
   função PL/pgSQL `SECURITY DEFINER` que valida papel, restaurante, estado atual e grava auditoria — numa única transação.
2. **Leitura via RLS**, escrita operacional **só por funções** (tabelas sem `INSERT/UPDATE` para `anon`/`authenticated`).
3. **Cadastros** (cardápio, mesas, estoque, categorias) são editados diretamente pelo painel com RLS restrita a gerente/admin,
   com triggers de auditoria e de proteção de colunas.
4. **Multiestabelecimento desde o início**: `restaurant_id` em todas as tabelas; políticas filtram por
   `current_restaurant_id()` (restaurante do perfil autenticado).

## Modelo de dados

| Tabela | Descrição |
|---|---|
| `restaurants` | Dados e configurações (taxa de serviço, limite de desconto, sessão do cliente, alertas da cozinha) |
| `profiles` | Funcionário (1:1 com `auth.users`): papel `admin/manager/cashier/waiter/kitchen`, ativo, `pin_hash` (bcrypt) |
| `categories`, `products` | Cardápio; `products` com alergênicos, etiquetas, disponibilidade, exclusão lógica (`deleted_at`) e URLs GLB/USDZ |
| `modifier_groups`, `modifier_options` | Adicionais/personalização com `min_select`/`max_select` e acréscimo de preço |
| `dining_tables` | Mesas com `qr_token` secreto (permanece com a mesa entre comandas; pode ser regenerado) |
| `tabs` | Comandas: `open → closing → closed` (ou `cancelled`); taxa, desconto e autorizações. Índice único parcial: 1 ativa por mesa |
| `table_sessions` | Sessões dos dispositivos dos clientes (somente hash SHA-256 do token), expiração e revogação |
| `orders` | Pedidos: origem (cliente/garçom), status, prioridade, carimbos de tempo e responsáveis por etapa, `idempotency_key` única |
| `order_items` | Itens com **snapshot** de nome, preço unitário e adicionais |
| `order_status_history` | Histórico permanente de transições |
| `service_requests` | Chamados do cliente (garçom / conta) |
| `cash_sessions`, `cash_movements` | Caixa por operador: abertura, vendas, sangrias, suprimentos, estornos, fechamento e divergência |
| `payments` | Pagamentos (método, valor abatido, recebido, troco, pagador), estorno com autorização, `idempotency_key` única |
| `ingredients`, `product_ingredients`, `stock_movements` | Estoque, ficha técnica e movimentações (venda, devolução, entrada, ajuste, perda) |
| `fiscal_documents` | Estrutura reservada para integração fiscal futura |
| `audit_log` | Trilha de auditoria |
| `counters` | Numeração sequencial de pedidos e comandas por restaurante |

Totais da comanda são sempre calculados por `tab_totals(tab_id)`: subtotal (pedidos não cancelados) + taxa de serviço − desconto − pagos.

## Funções (API do banco)

| Função | Quem pode | O que faz |
|---|---|---|
| `customer_open_session(qr_token)` | anônimo | Valida o QR, abre/reutiliza a comanda e emite token de sessão |
| `customer_get_state(token)` | anônimo (token) | Mesa, comanda, pedidos, totais, chamados |
| `customer_place_order(token, itens, obs, chave)` | anônimo (token) | Pedido com preços do servidor, idempotente, limite anti-abuso |
| `customer_cancel_order(token, pedido)` | anônimo (token) | Só pedidos da própria comanda e ainda não iniciados |
| `customer_request_service(token, tipo)` | anônimo (token) | Chamar garçom / pedir a conta (sem duplicar) |
| `staff_open_tab`, `staff_place_order` | garçom, caixa, gerente, admin | Abrir mesa e lançar pedidos na mesma comanda |
| `update_order_status(pedido, para, esperado)` | por transição | `received→preparing→ready` (cozinha), `ready→delivered` (garçom); detecta conflito |
| `cancel_order(pedido, motivo, pin)` | garçom, caixa, gerente, admin | Justificativa; PIN após início do preparo; devolve estoque; bloqueado se o total ficar abaixo do já pago |
| `request_tab_close`, `reopen_tab`, `cancel_empty_tab` | garçom, caixa, gerente, admin | Fluxo da comanda no salão |
| `open_cash_session`, `register_cash_movement`, `close_cash_session`, `cash_session_summary` | caixa, gerente, admin | Controle de caixa |
| `register_payment`, `void_payment` | caixa, gerente, admin | Pagamentos (não excede saldo, idempotente) e estorno autorizado |
| `set_tab_adjustments` | caixa, gerente, admin | Taxa de serviço e desconto (PIN acima do limite) |
| `close_tab(tab, motivo, pin)` | caixa, gerente, admin | Encerra, revoga sessões, libera a mesa |
| `adjust_stock`, `set_staff_pin`, `regenerate_table_qr` | gerente, admin | Administração (regenerar o QR revoga as sessões abertas da mesa) |
| `dashboard_live`, `report_summary` | gerente/admin (dashboard também caixa) | Indicadores e relatórios |
| `demo_*` | somente `service_role` | Geração de dados fictícios |

Erros são lançados com mensagens em português, exibidas diretamente na interface.

## Autorização por PIN

Operações sensíveis feitas por quem não é gerente exigem o PIN de um gerente/administrador (validado com `crypt()` no banco):
cancelamento após início do preparo, desconto acima do limite, estorno e fechamento com saldo pendente. O autorizador fica
registrado na linha afetada e no `audit_log`.

## Tempo real

- Funcionários: `useLiveQuery` assina `postgres_changes` (respeitando RLS) das tabelas relevantes e refaz a consulta;
  há verificação periódica (15–30 s) como redundância caso a conexão caia.
- Cliente: disponibilidade de produtos via Realtime (leitura pública do cardápio) e estado da comanda por consulta a cada 5 s
  através do servidor (o token da sessão nunca fica acessível ao JavaScript).

## Fluxo de status

```
Pedido:   received ──► preparing ──► ready ──► delivered
              │  ▲          │  ▲        │
              │  └──────────┘  └────────┘   (voltar etapa: cozinha / garçom)
              └──► cancelled (motivo; PIN após o início do preparo)

Comanda:  open ──► closing (cliente/garçom pediu a conta) ──► closed (caixa)
            └──► cancelled (aberta por engano, sem consumo)
```

## Decisões de segurança relevantes

- `products`: cozinha e garçom têm UPDATE pela política, mas o trigger `_guard_product_update` só permite alterar `available`.
- `profiles`: colunas legíveis explicitamente concedidas (sem `pin_hash`); somente admin altera papel/ativo; criação apenas via
  Admin API no servidor; o perfil nasce do `app_metadata` (não editável pelo usuário).
- `dining_tables` não é legível por anônimos (o token do QR não vaza pelo cardápio público).
- Funções internas (`_place_order`, `_authorize`, `tab_totals` etc.) não são executáveis por `anon`/`authenticated`.
