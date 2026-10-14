-- =============================================================================
-- 008 - CORREÇÕES DA AUDITORIA TÉCNICA
-- Somente recria funções e adiciona índices (nenhuma alteração destrutiva de dados).
--  1. cancel_order: impede que o total fique abaixo do valor já pago; bloqueio comanda → pedido.
--  2. update_order_status: bloqueia alteração de pedidos de comanda encerrada.
--  3. regenerate_table_qr: revoga as sessões de clientes abertas com o QR anterior.
--  4. Índices para consultas frequentes.
-- =============================================================================

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
  if exists (select 1 from public.tabs where id = v_order.tab_id and status in ('closed', 'cancelled')) then
    raise exception 'A comanda deste pedido já foi encerrada: não é possível alterar o status';
  end if;

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
  v_tab_id uuid;
  v_tot record;
begin
  v_me := public._require_role(array['waiter', 'cashier', 'manager', 'admin']::public.app_role[]);
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Informe a justificativa do cancelamento';
  end if;
  -- Ordem de bloqueio: comanda e depois pedido (a mesma de close_tab), evitando deadlock
  select tab_id into v_tab_id from public.orders where id = p_order_id and restaurant_id = v_me.restaurant_id;
  if not found then raise exception 'Pedido não encontrado'; end if;
  perform 1 from public.tabs where id = v_tab_id for update;
  select * into v_order from public.orders where id = p_order_id for update;
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
  -- Integridade financeira: o total não pode ficar abaixo do que já foi pago
  select * into v_tot from public.tab_totals(v_order.tab_id);
  if v_tot.balance < 0 then
    raise exception 'Este pedido já foi pago (total pago R$ %). Estorne o pagamento no caixa antes de cancelar.', v_tot.paid;
  end if;
  perform public._restock_order(v_order);
  perform public._audit(v_order.restaurant_id, 'order.cancel', 'orders', v_order.id::text,
    jsonb_build_object('numero', v_order.number, 'status_anterior', v_from, 'motivo', trim(p_reason),
                       'autorizado_por', v_auth, 'valor', v_order.subtotal));
  return v_order;
end;
$$;

create or replace function public.regenerate_table_qr(p_table_id uuid)
returns public.dining_tables
language plpgsql security definer set search_path = public, extensions
as $$
declare v_me public.profiles; v public.dining_tables; v_revoked int;
begin
  v_me := public._require_role(array['manager', 'admin']::public.app_role[]);
  update public.dining_tables set qr_token = encode(extensions.gen_random_bytes(18), 'hex')
   where id = p_table_id and restaurant_id = v_me.restaurant_id returning * into v;
  if not found then raise exception 'Mesa não encontrada'; end if;
  -- O QR antigo pode ter vazado: as sessões abertas com ele deixam de valer (clientes escaneiam o novo)
  update public.table_sessions set revoked_at = now() where table_id = v.id and revoked_at is null;
  get diagnostics v_revoked = row_count;
  perform public._audit(v_me.restaurant_id, 'table.regenerate_qr', 'dining_tables', v.id::text,
                        jsonb_build_object('mesa', v.number, 'sessoes_revogadas', v_revoked));
  return v;
end;
$$;

-- Índices (consultas de cancelamento/estoque, chamados da mesa, resumo de caixa e limite anti-abuso)
create index if not exists stock_movements_order_id_idx on public.stock_movements (order_id) where order_id is not null;
create index if not exists service_requests_tab_id_idx on public.service_requests (tab_id);
create index if not exists payments_cash_session_id_idx on public.payments (cash_session_id);
create index if not exists cash_movements_payment_id_idx on public.cash_movements (payment_id) where payment_id is not null;
create index if not exists orders_table_session_idx on public.orders (table_session_id, created_at) where table_session_id is not null;
create index if not exists table_sessions_table_id_idx on public.table_sessions (table_id) where revoked_at is null;
