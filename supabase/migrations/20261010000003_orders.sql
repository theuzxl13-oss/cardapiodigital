-- =============================================================================
-- 003 - COMANDAS, SESSÕES DE MESA E PEDIDOS
-- Toda escrita operacional passa por funções transacionais (SECURITY DEFINER),
-- que validam permissões, recalculam preços no servidor e registram auditoria.
-- =============================================================================

-- Abre (ou retorna) a comanda ativa de uma mesa. Bloqueia a mesa para evitar corrida.
create or replace function public._get_or_open_tab(p_table public.dining_tables, p_opened_by uuid, p_customer_count int)
returns public.tabs
language plpgsql security definer set search_path = public
as $$
declare v_tab public.tabs; v_rest public.restaurants;
begin
  perform 1 from public.dining_tables where id = p_table.id for update;
  select * into v_tab from public.tabs where table_id = p_table.id and status in ('open', 'closing');
  if found then return v_tab; end if;

  select * into v_rest from public.restaurants where id = p_table.restaurant_id;
  insert into public.tabs (restaurant_id, table_id, number, opened_by, customer_count, service_fee_pct, is_demo)
  values (p_table.restaurant_id, p_table.id, public._next_counter(p_table.restaurant_id, 'tab'),
          p_opened_by, p_customer_count, v_rest.service_fee_pct, false)
  returning * into v_tab;
  perform public._audit(p_table.restaurant_id, 'tab.open', 'tabs', v_tab.id::text,
    jsonb_build_object('mesa', p_table.number, 'origem', case when p_opened_by is null then 'cliente' else 'funcionario' end));
  return v_tab;
end;
$$;

-- Núcleo de criação de pedido: valida itens, adicionais, disponibilidade,
-- grava preços do momento, baixa estoque pela ficha técnica.
create or replace function public._place_order(
  p_tab_id uuid, p_items jsonb, p_notes text, p_source public.order_source,
  p_created_by uuid, p_session_id uuid, p_idempotency_key text, p_priority boolean
) returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_tab public.tabs;
  v_order public.orders;
  v_item jsonb;
  v_product public.products;
  v_qty int;
  v_opt_ids uuid[];
  v_count int;
  v_group record;
  v_mods jsonb;
  v_mod_total numeric;
  v_line numeric;
  v_subtotal numeric := 0;
  v_item_notes text;
begin
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 100 then
    raise exception 'Chave de idempotência inválida';
  end if;

  select * into v_tab from public.tabs where id = p_tab_id for update;
  if not found then raise exception 'Comanda não encontrada'; end if;

  -- Reenvio do mesmo pedido: devolve o pedido já criado (sem duplicar)
  select * into v_order from public.orders
   where restaurant_id = v_tab.restaurant_id and idempotency_key = p_idempotency_key;
  if found then
    if v_order.tab_id <> p_tab_id then raise exception 'Chave de idempotência já utilizada'; end if;
    return v_order;
  end if;

  if v_tab.status not in ('open', 'closing') then
    raise exception 'A comanda desta mesa já foi encerrada';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'O pedido não possui itens';
  end if;
  if jsonb_array_length(p_items) > 40 then
    raise exception 'Pedido com itens demais (máximo 40 linhas)';
  end if;
  if p_notes is not null and length(p_notes) > 300 then
    raise exception 'Observação do pedido muito longa';
  end if;

  insert into public.orders (restaurant_id, tab_id, table_id, number, source, created_by, table_session_id,
                             priority, notes, idempotency_key, status)
  values (v_tab.restaurant_id, v_tab.id, v_tab.table_id, public._next_counter(v_tab.restaurant_id, 'order'),
          p_source, p_created_by, p_session_id, coalesce(p_priority, false), nullif(trim(p_notes), ''),
          p_idempotency_key, 'received')
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item ->> 'quantity', '') !~ '^[0-9]{1,3}$' then
      raise exception 'Quantidade inválida';
    end if;
    v_qty := (v_item ->> 'quantity')::int;
    if v_qty < 1 or v_qty > 50 then raise exception 'Quantidade inválida (1 a 50)'; end if;

    select * into v_product from public.products
     where id = (v_item ->> 'product_id')::uuid and restaurant_id = v_tab.restaurant_id
       and deleted_at is null and active;
    if not found then raise exception 'Produto não encontrado no cardápio'; end if;
    if not v_product.available then
      raise exception 'Produto indisponível no momento: %', v_product.name;
    end if;

    v_item_notes := nullif(trim(v_item ->> 'notes'), '');
    if v_item_notes is not null and length(v_item_notes) > 200 then
      raise exception 'Observação do item muito longa';
    end if;

    -- Adicionais: precisam pertencer ao produto, estar ativos e respeitar min/máx
    if v_item ? 'modifiers' and jsonb_typeof(v_item -> 'modifiers') <> 'array' then
      raise exception 'Adicionais inválidos';
    end if;
    select coalesce(array_agg(value::uuid), '{}') into v_opt_ids
      from jsonb_array_elements_text(coalesce(v_item -> 'modifiers', '[]'));
    if cardinality(v_opt_ids) <> (select count(distinct x) from unnest(v_opt_ids) x) then
      raise exception 'Adicional repetido';
    end if;
    select count(*) into v_count
      from public.modifier_options o join public.modifier_groups g on g.id = o.group_id
     where o.id = any (v_opt_ids) and g.product_id = v_product.id and o.active;
    if v_count <> cardinality(v_opt_ids) then
      raise exception 'Adicional inválido para %', v_product.name;
    end if;
    for v_group in
      select g.name, g.min_select, g.max_select,
             (select count(*) from public.modifier_options o where o.group_id = g.id and o.id = any (v_opt_ids)) as chosen
        from public.modifier_groups g where g.product_id = v_product.id
    loop
      if v_group.chosen < v_group.min_select then
        raise exception 'Escolha obrigatória não informada: % (%)', v_group.name, v_product.name;
      end if;
      if v_group.chosen > v_group.max_select then
        raise exception 'Seleção acima do permitido em: % (%)', v_group.name, v_product.name;
      end if;
    end loop;

    select coalesce(jsonb_agg(jsonb_build_object('option_id', o.id, 'group', g.name, 'name', o.name,
                                                 'price_delta', o.price_delta)
                              order by g.sort_order, o.sort_order), '[]'::jsonb),
           coalesce(sum(o.price_delta), 0)
      into v_mods, v_mod_total
      from public.modifier_options o join public.modifier_groups g on g.id = o.group_id
     where o.id = any (v_opt_ids);

    v_line := (v_product.price + v_mod_total) * v_qty;
    insert into public.order_items (restaurant_id, order_id, product_id, product_name, unit_price, quantity,
                                    modifiers, modifiers_total, notes, line_total)
    values (v_tab.restaurant_id, v_order.id, v_product.id, v_product.name, v_product.price, v_qty,
            v_mods, v_mod_total, v_item_notes, v_line);
    v_subtotal := v_subtotal + v_line;

    -- Baixa de estoque pela ficha técnica
    insert into public.stock_movements (restaurant_id, ingredient_id, type, quantity, order_id, reason, created_by)
    select v_tab.restaurant_id, pi.ingredient_id, 'sale', -(pi.quantity * v_qty), v_order.id,
           'Venda: ' || v_product.name, p_created_by
      from public.product_ingredients pi where pi.product_id = v_product.id;
    update public.ingredients i set current_qty = i.current_qty - pi.quantity * v_qty
      from public.product_ingredients pi
     where pi.product_id = v_product.id and pi.ingredient_id = i.id;
  end loop;

  update public.orders set subtotal = v_subtotal where id = v_order.id returning * into v_order;
  insert into public.order_status_history (restaurant_id, order_id, from_status, to_status, changed_by)
  values (v_tab.restaurant_id, v_order.id, null, 'received', p_created_by);
  return v_order;
end;
$$;

-- Devolve ao estoque os insumos de um pedido cancelado
create or replace function public._restock_order(p_order public.orders)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.stock_movements (restaurant_id, ingredient_id, type, quantity, order_id, reason, created_by)
  select p_order.restaurant_id, sm.ingredient_id, 'cancel_return', -sm.quantity, p_order.id,
         'Cancelamento do pedido #' || p_order.number, auth.uid()
    from public.stock_movements sm where sm.order_id = p_order.id and sm.type = 'sale';
  update public.ingredients i set current_qty = i.current_qty - s.qty
    from (select ingredient_id, sum(quantity) as qty from public.stock_movements
           where order_id = p_order.id and type = 'sale' group by ingredient_id) s
   where s.ingredient_id = i.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- CLIENTE (acesso anônimo via token de sessão de mesa)
-- ---------------------------------------------------------------------------

create or replace function public._resolve_session(p_token text)
returns public.table_sessions
language plpgsql security definer set search_path = public
as $$
declare v public.table_sessions; v_status public.tab_status;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Sessão da mesa inválida. Escaneie o QR Code novamente.' using errcode = '42501';
  end if;
  select * into v from public.table_sessions where token_hash = public._hash_token(p_token);
  if not found or v.revoked_at is not null or v.expires_at < now() then
    raise exception 'Sessão da mesa expirada. Escaneie o QR Code novamente.' using errcode = '42501';
  end if;
  select status into v_status from public.tabs where id = v.tab_id;
  if v_status not in ('open', 'closing') then
    raise exception 'Esta comanda foi encerrada. Escaneie o QR Code para iniciar um novo atendimento.' using errcode = '42501';
  end if;
  return v;
end;
$$;

-- Chamado quando o cliente escaneia o QR Code: cria sessão segura vinculada à comanda.
create or replace function public.customer_open_session(p_qr_token text, p_user_agent text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_table public.dining_tables;
  v_rest public.restaurants;
  v_tab public.tabs;
  v_token text;
  v_active int;
begin
  select * into v_table from public.dining_tables where qr_token = p_qr_token and active;
  if not found then
    raise exception 'QR Code inválido ou desativado. Chame um garçom.';
  end if;
  select * into v_rest from public.restaurants where id = v_table.restaurant_id;

  select * into v_tab from public.tabs where table_id = v_table.id and status in ('open', 'closing');
  if not found then
    if not v_rest.allow_customer_open_tab then
      raise exception 'Mesa ainda não aberta. Peça ao garçom para abrir o atendimento.';
    end if;
    v_tab := public._get_or_open_tab(v_table, null, null);
  end if;

  select count(*) into v_active from public.table_sessions
   where tab_id = v_tab.id and revoked_at is null and expires_at > now();
  if v_active >= 30 then
    raise exception 'Limite de dispositivos conectados nesta mesa atingido. Chame um garçom.';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.table_sessions (restaurant_id, table_id, tab_id, token_hash, user_agent, expires_at)
  values (v_table.restaurant_id, v_table.id, v_tab.id, public._hash_token(v_token), left(p_user_agent, 300),
          now() + make_interval(hours => v_rest.customer_session_hours));

  return jsonb_build_object('session_token', v_token, 'table_number', v_table.number,
                            'tab_number', v_tab.number, 'expires_in_hours', v_rest.customer_session_hours);
end;
$$;

-- Estado completo da mesa para o cliente: comanda, pedidos e totais.
create or replace function public.customer_get_state(p_session_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_s public.table_sessions;
  v_tab public.tabs;
  v_table public.dining_tables;
  v_tot record;
begin
  v_s := public._resolve_session(p_session_token);
  select * into v_tab from public.tabs where id = v_s.tab_id;
  select * into v_table from public.dining_tables where id = v_s.table_id;
  select * into v_tot from public.tab_totals(v_tab.id);
  return jsonb_build_object(
    'table', jsonb_build_object('id', v_table.id, 'number', v_table.number, 'label', v_table.label),
    'tab', jsonb_build_object('id', v_tab.id, 'number', v_tab.number, 'status', v_tab.status,
                              'opened_at', v_tab.opened_at, 'closing_requested_at', v_tab.closing_requested_at,
                              'service_fee_enabled', v_tab.service_fee_enabled, 'service_fee_pct', v_tab.service_fee_pct),
    'totals', to_jsonb(v_tot),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'number', o.number, 'status', o.status, 'source', o.source, 'created_at', o.created_at,
        'subtotal', o.subtotal, 'notes', o.notes, 'mine', o.table_session_id = v_s.id,
        'items', (select coalesce(jsonb_agg(jsonb_build_object('product_name', i.product_name, 'quantity', i.quantity,
                     'unit_price', i.unit_price, 'modifiers', i.modifiers, 'notes', i.notes, 'line_total', i.line_total)
                     order by i.product_name), '[]'::jsonb) from public.order_items i where i.order_id = o.id)
      ) order by o.created_at desc)
      from public.orders o where o.tab_id = v_tab.id), '[]'::jsonb),
    'open_requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'type', r.type, 'status', r.status, 'created_at', r.created_at))
      from public.service_requests r where r.tab_id = v_tab.id and r.status <> 'done'), '[]'::jsonb)
  );
end;
$$;

create or replace function public.customer_place_order(
  p_session_token text, p_items jsonb, p_notes text, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_s public.table_sessions; v_order public.orders;
begin
  v_s := public._resolve_session(p_session_token);
  -- Limite anti-abuso: no máximo 10 pedidos por sessão a cada 10 minutos
  if (select count(*) from public.orders where table_session_id = v_s.id and created_at > now() - interval '10 minutes'
        and idempotency_key <> coalesce(p_idempotency_key, '')) >= 10 then
    raise exception 'Muitos pedidos em sequência. Aguarde alguns minutos ou chame o garçom.';
  end if;
  v_order := public._place_order(v_s.tab_id, p_items, p_notes, 'customer', null, v_s.id, p_idempotency_key, false);
  return jsonb_build_object('id', v_order.id, 'number', v_order.number, 'subtotal', v_order.subtotal, 'status', v_order.status);
end;
$$;

-- Cliente só pode cancelar pedidos ainda não iniciados pela cozinha.
create or replace function public.customer_cancel_order(p_session_token text, p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_s public.table_sessions; v_order public.orders;
begin
  v_s := public._resolve_session(p_session_token);
  select * into v_order from public.orders where id = p_order_id and tab_id = v_s.tab_id for update;
  if not found then raise exception 'Pedido não encontrado nesta mesa'; end if;
  if v_order.status <> 'received' then
    raise exception 'O pedido já está em preparação. Para cancelar, chame um garçom.';
  end if;
  update public.orders set status = 'cancelled', cancelled_at = now(), cancelled_by_customer = true,
         cancel_reason = 'Cancelado pelo cliente antes do preparo'
   where id = v_order.id returning * into v_order;
  insert into public.order_status_history (restaurant_id, order_id, from_status, to_status, reason)
  values (v_order.restaurant_id, v_order.id, 'received', 'cancelled', 'Cancelado pelo cliente');
  perform public._restock_order(v_order);
  perform public._audit(v_order.restaurant_id, 'order.cancel', 'orders', v_order.id::text,
                        jsonb_build_object('numero', v_order.number, 'por', 'cliente'));
  return jsonb_build_object('id', v_order.id, 'status', v_order.status);
end;
$$;

create or replace function public.customer_request_service(p_session_token text, p_type public.service_request_type, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_s public.table_sessions; v_req public.service_requests;
begin
  v_s := public._resolve_session(p_session_token);
  perform 1 from public.tabs where id = v_s.tab_id for update;
  select * into v_req from public.service_requests
   where tab_id = v_s.tab_id and type = p_type and status <> 'done';
  if not found then
    insert into public.service_requests (restaurant_id, tab_id, table_id, type, note)
    values (v_s.restaurant_id, v_s.tab_id, v_s.table_id, p_type, left(nullif(trim(p_note), ''), 200))
    returning * into v_req;
  end if;
  if p_type = 'request_bill' then
    update public.tabs set status = 'closing', closing_requested_at = coalesce(closing_requested_at, now())
     where id = v_s.tab_id and status = 'open';
  end if;
  return jsonb_build_object('id', v_req.id, 'type', v_req.type, 'status', v_req.status);
end;
$$;

-- ---------------------------------------------------------------------------
-- FUNCIONÁRIOS
-- ---------------------------------------------------------------------------

create or replace function public.staff_open_tab(p_table_id uuid, p_customer_count int default null)
returns public.tabs
language plpgsql security definer set search_path = public
as $$
declare v_me public.profiles; v_table public.dining_tables; v_tab public.tabs;
begin
  v_me := public._require_role(array['waiter', 'cashier', 'manager', 'admin']::public.app_role[]);
  select * into v_table from public.dining_tables where id = p_table_id and restaurant_id = v_me.restaurant_id and active;
  if not found then raise exception 'Mesa não encontrada'; end if;
  v_tab := public._get_or_open_tab(v_table, v_me.id, p_customer_count);
  if p_customer_count is not null and v_tab.customer_count is distinct from p_customer_count then
    update public.tabs set customer_count = p_customer_count where id = v_tab.id returning * into v_tab;
  end if;
  return v_tab;
end;
$$;

create or replace function public.staff_place_order(
  p_tab_id uuid, p_items jsonb, p_notes text, p_priority boolean, p_idempotency_key text
) returns public.orders
language plpgsql security definer set search_path = public
as $$
declare v_me public.profiles; v_order public.orders;
begin
  v_me := public._require_role(array['waiter', 'cashier', 'manager', 'admin']::public.app_role[]);
  if not exists (select 1 from public.tabs where id = p_tab_id and restaurant_id = v_me.restaurant_id) then
    raise exception 'Comanda não encontrada';
  end if;
  v_order := public._place_order(p_tab_id, p_items, p_notes, 'waiter', v_me.id, null, p_idempotency_key, p_priority);
  return v_order;
end;
$$;

-- Transições de status com controle de papel e detecção de conflito (p_expected_from).
create or replace function public.update_order_status(
  p_order_id uuid, p_to public.order_status, p_expected_from public.order_status default null
) returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_me public.profiles;
  v_order public.orders;
  v_from public.order_status;
  v_allowed public.app_role[];
begin
  v_me := public._require_role(array['kitchen', 'waiter', 'cashier', 'manager', 'admin']::public.app_role[]);
  select * into v_order from public.orders where id = p_order_id and restaurant_id = v_me.restaurant_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  v_from := v_order.status;

  if p_expected_from is not null and p_expected_from <> v_from then
    raise exception 'O pedido #% já foi atualizado por outro usuário (status atual: %)', v_order.number, v_from
      using errcode = '40001';
  end if;
  if v_from = p_to then return v_order; end if;

  v_allowed := case
    when v_from = 'received'  and p_to = 'preparing' then array['kitchen', 'manager', 'admin']
    when v_from = 'preparing' and p_to = 'ready'     then array['kitchen', 'manager', 'admin']
    when v_from = 'preparing' and p_to = 'received'  then array['kitchen', 'manager', 'admin']
    when v_from = 'ready'     and p_to = 'preparing' then array['kitchen', 'manager', 'admin']
    when v_from = 'ready'     and p_to = 'delivered' then array['waiter', 'manager', 'admin']
    when v_from = 'delivered' and p_to = 'ready'     then array['waiter', 'manager', 'admin']
    else null end::public.app_role[];

  if p_to = 'cancelled' then
    raise exception 'Use a função de cancelamento (exige justificativa)';
  end if;
  if v_allowed is null then
    raise exception 'Transição de status não permitida: % → %', v_from, p_to;
  end if;
  if not (v_me.role = any (v_allowed)) then
    raise exception 'Seu perfil não pode alterar o pedido de % para %', v_from, p_to using errcode = '42501';
  end if;

  update public.orders set
    status = p_to,
    started_at   = case when p_to = 'preparing' then coalesce(started_at, now()) else started_at end,
    started_by   = case when p_to = 'preparing' then coalesce(started_by, v_me.id) else started_by end,
    ready_at     = case when p_to = 'ready' then now() when p_to in ('preparing', 'received') then null else ready_at end,
    ready_by     = case when p_to = 'ready' then v_me.id when p_to in ('preparing', 'received') then null else ready_by end,
    delivered_at = case when p_to = 'delivered' then now() when p_to = 'ready' then null else delivered_at end,
    delivered_by = case when p_to = 'delivered' then v_me.id when p_to = 'ready' then null else delivered_by end
  where id = v_order.id returning * into v_order;

  insert into public.order_status_history (restaurant_id, order_id, from_status, to_status, changed_by)
  values (v_order.restaurant_id, v_order.id, v_from, p_to, v_me.id);
  return v_order;
end;
$$;

-- Cancelamento com justificativa. Após o início do preparo exige gerente ou PIN de supervisor.
create or replace function public.cancel_order(p_order_id uuid, p_reason text, p_supervisor_pin text default null)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_me public.profiles;
  v_order public.orders;
  v_from public.order_status;
  v_auth uuid;
begin
  v_me := public._require_role(array['waiter', 'cashier', 'manager', 'admin']::public.app_role[]);
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Informe a justificativa do cancelamento';
  end if;
  select * into v_order from public.orders where id = p_order_id and restaurant_id = v_me.restaurant_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  v_from := v_order.status;
  if v_from = 'cancelled' then return v_order; end if;
  if exists (select 1 from public.tabs where id = v_order.tab_id and status in ('closed', 'cancelled')) then
    raise exception 'Não é possível cancelar pedidos de uma comanda encerrada';
  end if;

  if v_from = 'received' then
    v_auth := v_me.id;
  else
    v_auth := public._authorize(v_me, p_supervisor_pin);
  end if;

  update public.orders set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me.id,
         cancel_reason = trim(p_reason), cancel_authorized_by = v_auth
   where id = v_order.id returning * into v_order;
  insert into public.order_status_history (restaurant_id, order_id, from_status, to_status, changed_by, reason)
  values (v_order.restaurant_id, v_order.id, v_from, 'cancelled', v_me.id, trim(p_reason));
  perform public._restock_order(v_order);
  perform public._audit(v_order.restaurant_id, 'order.cancel', 'orders', v_order.id::text,
    jsonb_build_object('numero', v_order.number, 'status_anterior', v_from, 'motivo', trim(p_reason),
                       'autorizado_por', v_auth, 'valor', v_order.subtotal));
  return v_order;
end;
$$;

create or replace function public.update_service_request(p_request_id uuid, p_status public.service_request_status)
returns public.service_requests
language plpgsql security definer set search_path = public
as $$
declare v_me public.profiles; v_req public.service_requests;
begin
  v_me := public._require_role(array['waiter', 'cashier', 'manager', 'admin']::public.app_role[]);
  update public.service_requests set
    status = p_status,
    acknowledged_by = coalesce(acknowledged_by, v_me.id),
    acknowledged_at = coalesce(acknowledged_at, now()),
    resolved_at = case when p_status = 'done' then now() else resolved_at end
  where id = p_request_id and restaurant_id = v_me.restaurant_id
  returning * into v_req;
  if not found then raise exception 'Solicitação não encontrada'; end if;
  return v_req;
end;
$$;

-- Garçom solicita fechamento ao caixa
create or replace function public.request_tab_close(p_tab_id uuid)
returns public.tabs
language plpgsql security definer set search_path = public
as $$
declare v_me public.profiles; v_tab public.tabs;
begin
  v_me := public._require_role(array['waiter', 'cashier', 'manager', 'admin']::public.app_role[]);
  update public.tabs set status = 'closing', closing_requested_at = coalesce(closing_requested_at, now())
   where id = p_tab_id and restaurant_id = v_me.restaurant_id and status in ('open', 'closing')
  returning * into v_tab;
  if not found then raise exception 'Comanda não está aberta'; end if;
  perform public._audit(v_tab.restaurant_id, 'tab.request_close', 'tabs', v_tab.id::text, '{}');
  return v_tab;
end;
$$;

-- Reabre uma comanda em fechamento (ex.: cliente pediu mais algo)
create or replace function public.reopen_tab(p_tab_id uuid)
returns public.tabs
language plpgsql security definer set search_path = public
as $$
declare v_me public.profiles; v_tab public.tabs;
begin
  v_me := public._require_role(array['waiter', 'cashier', 'manager', 'admin']::public.app_role[]);
  update public.tabs set status = 'open', closing_requested_at = null
   where id = p_tab_id and restaurant_id = v_me.restaurant_id and status = 'closing'
  returning * into v_tab;
  if not found then raise exception 'Comanda não está em fechamento'; end if;
  update public.service_requests set status = 'done', resolved_at = now()
   where tab_id = p_tab_id and type = 'request_bill' and status <> 'done';
  return v_tab;
end;
$$;

-- Cancela comanda aberta por engano (sem consumo e sem pagamentos)
create or replace function public.cancel_empty_tab(p_tab_id uuid, p_reason text)
returns public.tabs
language plpgsql security definer set search_path = public
as $$
declare v_me public.profiles; v_tab public.tabs;
begin
  v_me := public._require_role(array['waiter', 'cashier', 'manager', 'admin']::public.app_role[]);
  select * into v_tab from public.tabs where id = p_tab_id and restaurant_id = v_me.restaurant_id for update;
  if not found or v_tab.status not in ('open', 'closing') then raise exception 'Comanda não está aberta'; end if;
  if exists (select 1 from public.orders where tab_id = p_tab_id and status <> 'cancelled') then
    raise exception 'A comanda possui pedidos. Cancele os pedidos ou feche a conta no caixa.';
  end if;
  if exists (select 1 from public.payments where tab_id = p_tab_id and voided_at is null) then
    raise exception 'A comanda possui pagamentos registrados';
  end if;
  update public.tabs set status = 'cancelled', closed_at = now(), closed_by = v_me.id,
         forced_close_reason = coalesce(nullif(trim(p_reason), ''), 'Mesa liberada sem consumo')
   where id = p_tab_id returning * into v_tab;
  update public.table_sessions set revoked_at = now() where tab_id = p_tab_id and revoked_at is null;
  update public.service_requests set status = 'done', resolved_at = now() where tab_id = p_tab_id and status <> 'done';
  perform public._audit(v_tab.restaurant_id, 'tab.cancel_empty', 'tabs', v_tab.id::text, jsonb_build_object('motivo', p_reason));
  return v_tab;
end;
$$;
