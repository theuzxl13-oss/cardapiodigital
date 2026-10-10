-- =============================================================================
-- 001 - ESQUEMA BASE
-- Sistema de restaurante: cardápio QR, pedidos, cozinha, garçom, caixa, admin.
-- Todas as tabelas carregam restaurant_id para permitir multiestabelecimento.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'manager', 'cashier', 'waiter', 'kitchen');
create type public.tab_status as enum ('open', 'closing', 'closed', 'cancelled');
create type public.order_status as enum ('received', 'preparing', 'ready', 'delivered', 'cancelled');
create type public.order_source as enum ('customer', 'waiter');
create type public.payment_method as enum ('cash', 'pix', 'debit', 'credit');
create type public.service_request_type as enum ('call_waiter', 'request_bill');
create type public.service_request_status as enum ('open', 'acknowledged', 'done');
create type public.cash_session_status as enum ('open', 'closed');
create type public.cash_movement_type as enum ('opening', 'sale', 'withdrawal', 'supply', 'void');
create type public.stock_movement_type as enum ('purchase', 'sale', 'cancel_return', 'adjustment', 'loss');

-- ---------------------------------------------------------------------------
-- Restaurante e configurações
-- ---------------------------------------------------------------------------
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  tagline text,
  logo_url text,
  cover_url text,
  address text,
  phone text,
  timezone text not null default 'America/Sao_Paulo',
  currency text not null default 'BRL',
  service_fee_pct numeric(5,2) not null default 10 check (service_fee_pct between 0 and 30),
  max_discount_pct numeric(5,2) not null default 10 check (max_discount_pct between 0 and 100),
  allow_customer_open_tab boolean not null default true,
  customer_session_hours int not null default 12 check (customer_session_hours between 1 and 48),
  kitchen_sound_enabled boolean not null default true,
  kitchen_late_minutes int not null default 20 check (kitchen_late_minutes > 0),
  receipt_footer text default 'Obrigado pela preferência!',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Perfis de funcionários (1:1 com auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id),
  full_name text not null,
  email text,
  role public.app_role not null,
  active boolean not null default true,
  pin_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.profiles (restaurant_id, role);

-- Contadores sequenciais por restaurante (nº de pedido, nº de comanda)
create table public.counters (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  value bigint not null default 0,
  primary key (restaurant_id, name)
);

-- ---------------------------------------------------------------------------
-- Cardápio
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id),
  name text not null,
  slug text not null,
  icon text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, slug)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id),
  category_id uuid not null references public.categories (id),
  name text not null check (length(name) between 2 and 120),
  description text,
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  ingredients text,
  allergens text[] not null default '{}',
  tags text[] not null default '{}',
  prep_minutes int check (prep_minutes is null or prep_minutes between 0 and 240),
  serves int,
  available boolean not null default true,
  active boolean not null default true,
  featured boolean not null default false,
  sort_order int not null default 0,
  -- Realidade aumentada
  model_glb_url text,
  model_usdz_url text,
  model_is_illustrative boolean not null default true,
  model_credit text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.products (restaurant_id, category_id) where deleted_at is null;

create table public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id),
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null,
  min_select int not null default 0 check (min_select >= 0),
  max_select int not null default 1 check (max_select >= 1),
  sort_order int not null default 0,
  check (max_select >= min_select)
);
create index on public.modifier_groups (product_id);

create table public.modifier_options (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id),
  group_id uuid not null references public.modifier_groups (id) on delete cascade,
  name text not null,
  price_delta numeric(10,2) not null default 0 check (price_delta >= 0),
  active boolean not null default true,
  sort_order int not null default 0
);
create index on public.modifier_options (group_id);

-- ---------------------------------------------------------------------------
-- Mesas, comandas e sessões de mesa
-- ---------------------------------------------------------------------------
create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id),
  number int not null check (number > 0),
  label text,
  seats int not null default 4 check (seats > 0),
  -- Token secreto impresso no QR Code. Permanece com a mesa entre comandas.
  qr_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, number)
);

create table public.tabs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id),
  table_id uuid not null references public.dining_tables (id),
  number bigint not null,
  status public.tab_status not null default 'open',
  customer_count int check (customer_count is null or customer_count between 1 and 50),
  opened_by uuid references public.profiles (id),        -- null = aberta pelo cliente via QR
  opened_at timestamptz not null default now(),
  closing_requested_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.profiles (id),
  service_fee_enabled boolean not null default true,
  service_fee_pct numeric(5,2) not null default 10,
  discount_amount numeric(10,2) not null default 0 check (discount_amount >= 0),
  discount_reason text,
  discount_by uuid references public.profiles (id),
  discount_authorized_by uuid references public.profiles (id),
  forced_close_reason text,
  forced_close_authorized_by uuid references public.profiles (id),
  is_demo boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (restaurant_id, number)
);
-- Regra: uma mesa nunca possui duas comandas ativas.
create unique index tabs_one_active_per_table on public.tabs (table_id) where status in ('open', 'closing');
create index on public.tabs (restaurant_id, status);
create index on public.tabs (restaurant_id, closed_at);

-- Sessões de cliente (dispositivo que escaneou o QR). Apenas o hash do token é salvo.
create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id),
  table_id uuid not null references public.dining_tables (id),
  tab_id uuid not null references public.tabs (id),
  token_hash text not null unique,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index on public.table_sessions (tab_id);

-- ---------------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id),
  tab_id uuid not null references public.tabs (id),
  table_id uuid not null references public.dining_tables (id),
  number bigint not null,
  source public.order_source not null,
  created_by uuid references public.profiles (id),
  table_session_id uuid references public.table_sessions (id),
  status public.order_status not null default 'received',
  priority boolean not null default false,
  notes text check (notes is null or length(notes) <= 300),
  subtotal numeric(10,2) not null default 0,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  started_by uuid references public.profiles (id),
  ready_at timestamptz,
  ready_by uuid references public.profiles (id),
  delivered_at timestamptz,
  delivered_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  cancelled_by_customer boolean not null default false,
  cancel_reason text,
  cancel_authorized_by uuid references public.profiles (id),
  is_demo boolean not null default false,
  unique (restaurant_id, number),
  -- Proteção contra pedidos duplicados (duplo clique / reenvio de rede)
  unique (restaurant_id, idempotency_key)
);
create index on public.orders (restaurant_id, status, created_at);
create index on public.orders (tab_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id),
  order_id uuid not null references public.orders (id),
  product_id uuid not null references public.products (id),
  -- Snapshot do momento da confirmação: alterações futuras do cardápio não afetam o pedido.
  product_name text not null,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity int not null check (quantity between 1 and 50),
  modifiers jsonb not null default '[]',
  modifiers_total numeric(10,2) not null default 0,
  notes text check (notes is null or length(notes) <= 200),
  line_total numeric(10,2) not null
);
create index on public.order_items (order_id);
create index on public.order_items (product_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants (id),
  order_id uuid not null references public.orders (id),
  from_status public.order_status,
  to_status public.order_status not null,
  changed_by uuid references public.profiles (id),
  reason text,
  changed_at timestamptz not null default now()
);
create index on public.order_status_history (order_id);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id),
  tab_id uuid not null references public.tabs (id),
  table_id uuid not null references public.dining_tables (id),
  type public.service_request_type not null,
  status public.service_request_status not null default 'open',
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now(),
  acknowledged_by uuid references public.profiles (id),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);
create index on public.service_requests (restaurant_id, status);

-- ---------------------------------------------------------------------------
-- Caixa (PDV)
-- ---------------------------------------------------------------------------
create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id),
  operator_id uuid not null references public.profiles (id),
  status public.cash_session_status not null default 'open',
  opening_amount numeric(10,2) not null check (opening_amount >= 0),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  expected_cash numeric(10,2),
  counted_cash numeric(10,2),
  difference numeric(10,2),
  closing_notes text,
  is_demo boolean not null default false
);
create unique index cash_sessions_one_open_per_operator on public.cash_sessions (operator_id) where status = 'open';

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id),
  tab_id uuid not null references public.tabs (id),
  cash_session_id uuid not null references public.cash_sessions (id),
  method public.payment_method not null,
  amount numeric(10,2) not null check (amount > 0),           -- valor abatido da comanda
  received_amount numeric(10,2) not null check (received_amount > 0), -- valor entregue (dinheiro)
  change_amount numeric(10,2) not null default 0 check (change_amount >= 0),
  payer_label text,
  idempotency_key text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  void_reason text,
  void_authorized_by uuid references public.profiles (id),
  is_demo boolean not null default false,
  unique (restaurant_id, idempotency_key)
);
create index on public.payments (tab_id);
create index on public.payments (restaurant_id, created_at);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id),
  cash_session_id uuid not null references public.cash_sessions (id),
  type public.cash_movement_type not null,
  method public.payment_method not null default 'cash',
  amount numeric(10,2) not null,  -- positivo entra no caixa, negativo sai
  payment_id uuid references public.payments (id),
  reason text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.cash_movements (cash_session_id);

-- Estrutura para futura integração fiscal (NFC-e/SAT). Não utilizada pelos comprovantes simples.
create table public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id),
  tab_id uuid not null references public.tabs (id),
  provider text,
  document_type text,       -- ex.: 'nfce'
  status text not null default 'pending',
  access_key text,
  protocol text,
  payload jsonb,
  error text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Estoque
-- ---------------------------------------------------------------------------
create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id),
  name text not null,
  unit text not null check (unit in ('g', 'kg', 'ml', 'l', 'un')),
  current_qty numeric(12,3) not null default 0,
  min_qty numeric(12,3) not null default 0 check (min_qty >= 0),
  cost_per_unit numeric(10,4) not null default 0 check (cost_per_unit >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name)
);

-- Ficha técnica: quanto de cada insumo um produto consome
create table public.product_ingredients (
  product_id uuid not null references public.products (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  restaurant_id uuid not null references public.restaurants (id),
  quantity numeric(12,3) not null check (quantity > 0),
  primary key (product_id, ingredient_id)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id),
  ingredient_id uuid not null references public.ingredients (id),
  type public.stock_movement_type not null,
  quantity numeric(12,3) not null,  -- positivo = entrada; negativo = saída
  order_id uuid references public.orders (id),
  unit_cost numeric(10,4),
  reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.stock_movements (ingredient_id, created_at);

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  restaurant_id uuid references public.restaurants (id),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.audit_log (restaurant_id, created_at desc);
create index on public.audit_log (entity, entity_id);
