-- =============================================================================
-- 006 - SEGURANÇA: RLS, GRANTS e permissões de execução
-- Leitura: RLS por restaurante e papel. Escrita operacional: somente via funções.
-- Escrita de cadastros (cardápio, mesas, estoque): gerente/administrador via RLS.
-- =============================================================================

alter table public.restaurants enable row level security;
alter table public.profiles enable row level security;
alter table public.counters enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.modifier_groups enable row level security;
alter table public.modifier_options enable row level security;
alter table public.dining_tables enable row level security;
alter table public.tabs enable row level security;
alter table public.table_sessions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.service_requests enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.payments enable row level security;
alter table public.cash_movements enable row level security;
alter table public.fiscal_documents enable row level security;
alter table public.ingredients enable row level security;
alter table public.product_ingredients enable row level security;
alter table public.stock_movements enable row level security;
alter table public.audit_log enable row level security;

-- Restaurante: informações públicas (nome, logo) visíveis no cardápio
create policy restaurants_public_read on public.restaurants for select to anon, authenticated using (true);
create policy restaurants_admin_update on public.restaurants for update to authenticated
  using (id = public.current_restaurant_id() and public.has_role(array['admin']::public.app_role[]))
  with check (id = public.current_restaurant_id());

-- Perfis: funcionários veem colegas; somente admin altera
create policy profiles_staff_read on public.profiles for select to authenticated
  using (restaurant_id = public.current_restaurant_id());
create policy profiles_admin_update on public.profiles for update to authenticated
  using (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin']::public.app_role[]))
  with check (restaurant_id = public.current_restaurant_id());

-- Cardápio: público lê itens ativos; gerente/admin gerenciam
create policy categories_public_read on public.categories for select to anon, authenticated
  using (active or restaurant_id = public.current_restaurant_id());
create policy categories_manage on public.categories for all to authenticated
  using (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager']::public.app_role[]))
  with check (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager']::public.app_role[]));

create policy products_public_read on public.products for select to anon, authenticated
  using ((active and deleted_at is null) or restaurant_id = public.current_restaurant_id());
create policy products_manage on public.products for all to authenticated
  using (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager']::public.app_role[]))
  with check (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager']::public.app_role[]));
-- Cozinha/garçom podem marcar disponibilidade (somente a coluna available; ver grants abaixo)
create policy products_staff_availability on public.products for update to authenticated
  using (restaurant_id = public.current_restaurant_id() and public.has_role(array['kitchen', 'waiter']::public.app_role[]))
  with check (restaurant_id = public.current_restaurant_id());

create policy modifier_groups_public_read on public.modifier_groups for select to anon, authenticated using (true);
create policy modifier_groups_manage on public.modifier_groups for all to authenticated
  using (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager']::public.app_role[]))
  with check (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager']::public.app_role[]));
create policy modifier_options_public_read on public.modifier_options for select to anon, authenticated using (true);
create policy modifier_options_manage on public.modifier_options for all to authenticated
  using (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager']::public.app_role[]))
  with check (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager']::public.app_role[]));

-- Mesas: somente funcionários (o token do QR não é exposto ao público)
create policy tables_staff_read on public.dining_tables for select to authenticated
  using (restaurant_id = public.current_restaurant_id());
create policy tables_manage on public.dining_tables for all to authenticated
  using (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager']::public.app_role[]))
  with check (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager']::public.app_role[]));

-- Operação (comandas, pedidos, chamados): leitura por funcionários; escrita só via funções
create policy tabs_staff_read on public.tabs for select to authenticated using (restaurant_id = public.current_restaurant_id());
create policy orders_staff_read on public.orders for select to authenticated using (restaurant_id = public.current_restaurant_id());
create policy order_items_staff_read on public.order_items for select to authenticated using (restaurant_id = public.current_restaurant_id());
create policy order_history_staff_read on public.order_status_history for select to authenticated using (restaurant_id = public.current_restaurant_id());
create policy requests_staff_read on public.service_requests for select to authenticated using (restaurant_id = public.current_restaurant_id());

-- Financeiro: caixa, gerente e admin. Operador de caixa vê apenas as próprias sessões.
create policy cash_sessions_read on public.cash_sessions for select to authenticated
  using (restaurant_id = public.current_restaurant_id()
         and (public.has_role(array['admin', 'manager']::public.app_role[])
              or (public.has_role(array['cashier']::public.app_role[]) and operator_id = auth.uid())));
create policy cash_movements_read on public.cash_movements for select to authenticated
  using (restaurant_id = public.current_restaurant_id()
         and (public.has_role(array['admin', 'manager']::public.app_role[])
              or (public.has_role(array['cashier']::public.app_role[]) and created_by = auth.uid())));
create policy payments_read on public.payments for select to authenticated
  using (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager', 'cashier']::public.app_role[]));
create policy fiscal_read on public.fiscal_documents for select to authenticated
  using (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager']::public.app_role[]));

-- Estoque
create policy ingredients_read on public.ingredients for select to authenticated
  using (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager', 'kitchen']::public.app_role[]));
create policy ingredients_manage on public.ingredients for all to authenticated
  using (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager']::public.app_role[]))
  with check (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager']::public.app_role[]));
create policy recipes_read on public.product_ingredients for select to authenticated
  using (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager', 'kitchen']::public.app_role[]));
create policy recipes_manage on public.product_ingredients for all to authenticated
  using (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager']::public.app_role[]))
  with check (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager']::public.app_role[]));
create policy stock_movements_read on public.stock_movements for select to authenticated
  using (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager']::public.app_role[]));

create policy audit_read on public.audit_log for select to authenticated
  using (restaurant_id = public.current_restaurant_id() and public.has_role(array['admin', 'manager']::public.app_role[]));

-- ---------------------------------------------------------------------------
-- GRANTS de tabela (defesa em profundidade além do RLS)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on public.restaurants, public.categories, public.products, public.modifier_groups, public.modifier_options to anon;

grant select on all tables in schema public to authenticated;
revoke select on public.table_sessions, public.counters from authenticated;
-- profiles: pin_hash nunca é legível pelo cliente
revoke select on public.profiles from authenticated;
grant select (id, restaurant_id, full_name, email, role, active, created_at, updated_at) on public.profiles to authenticated;
grant update (full_name, role, active) on public.profiles to authenticated;

grant update (name, tagline, logo_url, cover_url, address, phone, service_fee_pct, max_discount_pct,
              allow_customer_open_tab, customer_session_hours, kitchen_sound_enabled, kitchen_late_minutes, receipt_footer)
  on public.restaurants to authenticated;

grant insert, update, delete on public.categories, public.modifier_groups, public.modifier_options,
  public.product_ingredients to authenticated;
grant insert, delete on public.products to authenticated;
grant update (category_id, name, description, price, image_url, ingredients, allergens, tags, prep_minutes, serves,
              available, active, featured, sort_order, model_glb_url, model_usdz_url, model_is_illustrative,
              model_credit, deleted_at) on public.products to authenticated;
grant insert, delete on public.dining_tables to authenticated;
grant update (number, label, seats, active) on public.dining_tables to authenticated;
grant insert on public.ingredients to authenticated;
grant update (name, unit, min_qty, cost_per_unit, active) on public.ingredients to authenticated;

-- Cozinha/garçom só conseguem alterar disponibilidade: trigger reforça a restrição por coluna
create or replace function public._guard_product_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.has_role(array['kitchen', 'waiter']::public.app_role[]) then
    if (to_jsonb(new) - 'available' - 'updated_at') is distinct from (to_jsonb(old) - 'available' - 'updated_at') then
      raise exception 'Seu perfil só pode alterar a disponibilidade do produto' using errcode = '42501';
    end if;
  end if;
  return new;
end; $$;
create trigger trg_guard_product before update on public.products for each row execute function public._guard_product_update();

-- Totais de comanda para funcionários (restrito ao próprio restaurante)
create or replace function public.staff_tab_totals(p_tab_id uuid)
returns table (subtotal numeric, service_fee numeric, discount numeric, total numeric, paid numeric, balance numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.tabs where id = p_tab_id and restaurant_id = public.current_restaurant_id()) then
    raise exception 'Comanda não encontrada';
  end if;
  return query select * from public.tab_totals(p_tab_id);
end; $$;

-- ---------------------------------------------------------------------------
-- Permissões de execução das funções
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

-- Funções auxiliares usadas pelas políticas RLS
grant execute on function public.current_restaurant_id(), public.has_role(public.app_role[]), public.is_staff(),
  public.current_profile() to anon, authenticated;

-- Cliente (anônimo, autenticado por token de sessão de mesa)
grant execute on function
  public.customer_open_session(text, text),
  public.customer_get_state(text),
  public.customer_place_order(text, jsonb, text, text),
  public.customer_cancel_order(text, uuid),
  public.customer_request_service(text, public.service_request_type, text)
to anon, authenticated;

-- Funcionários (cada função valida o papel internamente)
grant execute on function
  public.staff_tab_totals(uuid),
  public.staff_open_tab(uuid, int),
  public.staff_place_order(uuid, jsonb, text, boolean, text),
  public.update_order_status(uuid, public.order_status, public.order_status),
  public.cancel_order(uuid, text, text),
  public.update_service_request(uuid, public.service_request_status),
  public.request_tab_close(uuid),
  public.reopen_tab(uuid),
  public.cancel_empty_tab(uuid, text),
  public.open_cash_session(numeric),
  public.cash_session_summary(uuid),
  public.register_cash_movement(public.cash_movement_type, numeric, text),
  public.close_cash_session(numeric, text),
  public.register_payment(uuid, public.payment_method, numeric, numeric, text, text),
  public.void_payment(uuid, text, text),
  public.set_tab_adjustments(uuid, boolean, numeric, text, text),
  public.close_tab(uuid, text, text),
  public.adjust_stock(uuid, public.stock_movement_type, numeric, text, numeric),
  public.set_staff_pin(uuid, text),
  public.regenerate_table_qr(uuid),
  public.dashboard_live(),
  public.report_summary(timestamptz, timestamptz, boolean)
to authenticated;

