-- =============================================================================
-- 004 - CAIXA (PDV): sessões de caixa, pagamentos, ajustes e fechamento de conta
-- =============================================================================

create or replace function public._my_open_cash_session(p_me public.profiles)
returns public.cash_sessions
language plpgsql security definer set search_path = public
as $$
declare v public.cash_sessions;
begin
  select * into v from public.cash_sessions where operator_id = p_me.id and status = 'open' for update;
  if not found then
    raise exception 'Abra o caixa antes de registrar movimentações';
  end if;
  return v;
end;
$$;

create or replace function public.open_cash_session(p_opening_amount numeric)
returns public.cash_sessions
language plpgsql security definer set search_path = public
as $$
declare v_me public.profiles; v public.cash_sessions;
begin
  v_me := public._require_role(array['cashier', 'manager', 'admin']::public.app_role[]);
  if p_opening_amount is null or p_opening_amount < 0 then raise exception 'Valor de abertura inválido'; end if;
  if exists (select 1 from public.cash_sessions where operator_id = v_me.id and status = 'open') then
    raise exception 'Você já possui um caixa aberto';
  end if;
  insert into public.cash_sessions (restaurant_id, operator_id, opening_amount)
  values (v_me.restaurant_id, v_me.id, round(p_opening_amount, 2)) returning * into v;
  insert into public.cash_movements (restaurant_id, cash_session_id, type, amount, reason, created_by)
  values (v_me.restaurant_id, v.id, 'opening', v.opening_amount, 'Fundo de troco', v_me.id);
  perform public._audit(v_me.restaurant_id, 'cash.open', 'cash_sessions', v.id::text, jsonb_build_object('valor', v.opening_amount));
  return v;
end;
$$;

-- Dinheiro esperado na gaveta = soma das movimentações em dinheiro
create or replace function public.cash_session_summary(p_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_me public.profiles; v public.cash_sessions;
begin
  v_me := public._require_role(array['cashier', 'manager', 'admin']::public.app_role[]);
  select * into v from public.cash_sessions where id = p_session_id and restaurant_id = v_me.restaurant_id;
  if not found then raise exception 'Sessão de caixa não encontrada'; end if;
  if v_me.role = 'cashier' and v.operator_id <> v_me.id then raise exception 'Acesso negado' using errcode = '42501'; end if;
  return jsonb_build_object(
    'session', to_jsonb(v),
    'expected_cash', (select coalesce(sum(amount), 0) from public.cash_movements where cash_session_id = v.id and method = 'cash'),
    'by_method', coalesce((select jsonb_object_agg(method, total) from (
        select method, sum(amount) as total from public.payments
         where cash_session_id = v.id and voided_at is null group by method) m), '{}'::jsonb),
    'withdrawals', (select coalesce(-sum(amount), 0) from public.cash_movements where cash_session_id = v.id and type = 'withdrawal'),
    'supplies', (select coalesce(sum(amount), 0) from public.cash_movements where cash_session_id = v.id and type = 'supply'),
    'payments_count', (select count(*) from public.payments where cash_session_id = v.id and voided_at is null),
    'sales_total', (select coalesce(sum(amount), 0) from public.payments where cash_session_id = v.id and voided_at is null)
  );
end;
$$;

-- Sangria (withdrawal) e suprimento (supply)
create or replace function public.register_cash_movement(p_type public.cash_movement_type, p_amount numeric, p_reason text)
returns public.cash_movements
language plpgsql security definer set search_path = public
as $$
declare v_me public.profiles; v_s public.cash_sessions; v public.cash_movements; v_expected numeric;
begin
  v_me := public._require_role(array['cashier', 'manager', 'admin']::public.app_role[]);
  if p_type not in ('withdrawal', 'supply') then raise exception 'Tipo de movimentação inválido'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Valor inválido'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Informe o motivo'; end if;
  v_s := public._my_open_cash_session(v_me);
  if p_type = 'withdrawal' then
    select coalesce(sum(amount), 0) into v_expected from public.cash_movements where cash_session_id = v_s.id and method = 'cash';
    if p_amount > v_expected then raise exception 'Sangria maior que o dinheiro disponível no caixa (R$ %)', v_expected; end if;
  end if;
  insert into public.cash_movements (restaurant_id, cash_session_id, type, amount, reason, created_by)
  values (v_me.restaurant_id, v_s.id, p_type, case when p_type = 'withdrawal' then -round(p_amount, 2) else round(p_amount, 2) end,
          trim(p_reason), v_me.id) returning * into v;
  perform public._audit(v_me.restaurant_id, 'cash.' || p_type, 'cash_movements', v.id::text,
                        jsonb_build_object('valor', p_amount, 'motivo', p_reason));
  return v;
end;
$$;

create or replace function public.close_cash_session(p_counted_cash numeric, p_notes text default null)
returns public.cash_sessions
language plpgsql security definer set search_path = public
as $$
declare v_me public.profiles; v_s public.cash_sessions; v_expected numeric;
begin
  v_me := public._require_role(array['cashier', 'manager', 'admin']::public.app_role[]);
  if p_counted_cash is null or p_counted_cash < 0 then raise exception 'Informe o valor contado'; end if;
  v_s := public._my_open_cash_session(v_me);
  select coalesce(sum(amount), 0) into v_expected from public.cash_movements where cash_session_id = v_s.id and method = 'cash';
  update public.cash_sessions set status = 'closed', closed_at = now(), expected_cash = v_expected,
         counted_cash = round(p_counted_cash, 2), difference = round(p_counted_cash, 2) - v_expected,
         closing_notes = nullif(trim(p_notes), '')
   where id = v_s.id returning * into v_s;
  perform public._audit(v_me.restaurant_id, 'cash.close', 'cash_sessions', v_s.id::text,
    jsonb_build_object('esperado', v_expected, 'contado', p_counted_cash, 'divergencia', v_s.difference));
  return v_s;
end;
$$;

-- Registra pagamento (parcial, combinado ou total). Impede pagamento acima do saldo
-- e duplicidade via chave de idempotência + bloqueio da comanda.
create or replace function public.register_payment(
  p_tab_id uuid, p_method public.payment_method, p_amount numeric,
  p_received_amount numeric, p_payer_label text, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me public.profiles; v_s public.cash_sessions; v_tab public.tabs; v_pay public.payments;
  v_tot record; v_received numeric; v_change numeric;
begin
  v_me := public._require_role(array['cashier', 'manager', 'admin']::public.app_role[]);
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 100 then
    raise exception 'Chave de idempotência inválida';
  end if;
  select * into v_tab from public.tabs where id = p_tab_id and restaurant_id = v_me.restaurant_id for update;
  if not found then raise exception 'Comanda não encontrada'; end if;

  select * into v_pay from public.payments where restaurant_id = v_me.restaurant_id and idempotency_key = p_idempotency_key;
  if found then
    if v_pay.tab_id <> p_tab_id then raise exception 'Chave de idempotência já utilizada'; end if;
    select * into v_tot from public.tab_totals(p_tab_id);
    return jsonb_build_object('payment', to_jsonb(v_pay), 'totals', to_jsonb(v_tot), 'duplicate', true);
  end if;

  if v_tab.status not in ('open', 'closing') then raise exception 'Comanda já encerrada'; end if;
  v_s := public._my_open_cash_session(v_me);

  p_amount := round(p_amount, 2);
  if p_amount is null or p_amount <= 0 then raise exception 'Valor do pagamento inválido'; end if;
  select * into v_tot from public.tab_totals(p_tab_id);
  if p_amount > v_tot.balance then
    raise exception 'Valor (R$ %) maior que o saldo da comanda (R$ %)', p_amount, v_tot.balance;
  end if;

  if p_method = 'cash' then
    v_received := round(coalesce(p_received_amount, p_amount), 2);
    if v_received < p_amount then raise exception 'Valor recebido menor que o valor a pagar'; end if;
    v_change := v_received - p_amount;
  else
    v_received := p_amount;
    v_change := 0;
  end if;

  insert into public.payments (restaurant_id, tab_id, cash_session_id, method, amount, received_amount,
                               change_amount, payer_label, idempotency_key, created_by)
  values (v_me.restaurant_id, p_tab_id, v_s.id, p_method, p_amount, v_received, v_change,
          left(nullif(trim(p_payer_label), ''), 60), p_idempotency_key, v_me.id)
  returning * into v_pay;

  insert into public.cash_movements (restaurant_id, cash_session_id, type, method, amount, payment_id, created_by, reason)
  values (v_me.restaurant_id, v_s.id, 'sale', p_method, p_amount, v_pay.id, v_me.id, 'Comanda #' || v_tab.number);

  perform public._audit(v_me.restaurant_id, 'payment.register', 'payments', v_pay.id::text,
    jsonb_build_object('comanda', v_tab.number, 'metodo', p_method, 'valor', p_amount, 'troco', v_change));
  select * into v_tot from public.tab_totals(p_tab_id);
  return jsonb_build_object('payment', to_jsonb(v_pay), 'totals', to_jsonb(v_tot), 'duplicate', false);
end;
$$;

create or replace function public.void_payment(p_payment_id uuid, p_reason text, p_supervisor_pin text default null)
returns public.payments
language plpgsql security definer set search_path = public
as $$
declare v_me public.profiles; v_pay public.payments; v_auth uuid; v_s public.cash_sessions;
begin
  v_me := public._require_role(array['cashier', 'manager', 'admin']::public.app_role[]);
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Informe o motivo do estorno'; end if;
  select * into v_pay from public.payments where id = p_payment_id and restaurant_id = v_me.restaurant_id for update;
  if not found then raise exception 'Pagamento não encontrado'; end if;
  if v_pay.voided_at is not null then raise exception 'Pagamento já estornado'; end if;
  perform 1 from public.tabs where id = v_pay.tab_id and status in ('open', 'closing') for update;
  if not found then raise exception 'Comanda já encerrada: estorno não permitido'; end if;
  select * into v_s from public.cash_sessions where id = v_pay.cash_session_id;
  if v_s.status <> 'open' then raise exception 'O caixa deste pagamento já foi fechado'; end if;
  v_auth := public._authorize(v_me, p_supervisor_pin);
  update public.payments set voided_at = now(), voided_by = v_me.id, void_reason = trim(p_reason), void_authorized_by = v_auth
   where id = v_pay.id returning * into v_pay;
  insert into public.cash_movements (restaurant_id, cash_session_id, type, method, amount, payment_id, created_by, reason)
  values (v_me.restaurant_id, v_pay.cash_session_id, 'void', v_pay.method, -v_pay.amount, v_pay.id, v_me.id, trim(p_reason));
  perform public._audit(v_me.restaurant_id, 'payment.void', 'payments', v_pay.id::text,
    jsonb_build_object('valor', v_pay.amount, 'motivo', p_reason, 'autorizado_por', v_auth));
  return v_pay;
end;
$$;

-- Taxa de serviço e desconto. Desconto acima do limite exige supervisor.
create or replace function public.set_tab_adjustments(
  p_tab_id uuid, p_service_fee_enabled boolean, p_discount_amount numeric,
  p_discount_reason text, p_supervisor_pin text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me public.profiles; v_tab public.tabs; v_rest public.restaurants; v_tot record;
  v_auth uuid := null; v_limit numeric; v_gross numeric;
begin
  v_me := public._require_role(array['cashier', 'manager', 'admin']::public.app_role[]);
  select * into v_tab from public.tabs where id = p_tab_id and restaurant_id = v_me.restaurant_id for update;
  if not found or v_tab.status not in ('open', 'closing') then raise exception 'Comanda não está aberta'; end if;
  select * into v_rest from public.restaurants where id = v_tab.restaurant_id;
  p_discount_amount := round(coalesce(p_discount_amount, 0), 2);
  if p_discount_amount < 0 then raise exception 'Desconto inválido'; end if;

  select * into v_tot from public.tab_totals(p_tab_id);
  v_gross := v_tot.subtotal + case when p_service_fee_enabled then round(v_tot.subtotal * v_tab.service_fee_pct / 100, 2) else 0 end;
  if p_discount_amount > v_gross then raise exception 'Desconto maior que o valor da conta'; end if;

  if p_discount_amount > 0 then
    if p_discount_reason is null or length(trim(p_discount_reason)) < 3 then
      raise exception 'Informe o motivo do desconto';
    end if;
    v_limit := round(v_tot.subtotal * v_rest.max_discount_pct / 100, 2);
    if p_discount_amount > v_limit then
      v_auth := public._authorize(v_me, p_supervisor_pin);
    else
      v_auth := v_me.id;
    end if;
  end if;

  if v_gross - p_discount_amount < v_tot.paid then
    raise exception 'O novo total ficaria abaixo do valor já pago. Estorne um pagamento antes.';
  end if;

  update public.tabs set service_fee_enabled = p_service_fee_enabled, discount_amount = p_discount_amount,
         discount_reason = case when p_discount_amount > 0 then trim(p_discount_reason) else null end,
         discount_by = case when p_discount_amount > 0 then v_me.id else null end,
         discount_authorized_by = v_auth
   where id = p_tab_id returning * into v_tab;
  perform public._audit(v_me.restaurant_id, 'tab.adjust', 'tabs', v_tab.id::text,
    jsonb_build_object('taxa_servico', p_service_fee_enabled, 'desconto', p_discount_amount,
                       'motivo', p_discount_reason, 'autorizado_por', v_auth));
  select * into v_tot from public.tab_totals(p_tab_id);
  return to_jsonb(v_tot);
end;
$$;

-- Encerra a comanda e libera a mesa. Saldo pendente exige autorização e justificativa.
create or replace function public.close_tab(p_tab_id uuid, p_force_reason text default null, p_supervisor_pin text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_me public.profiles; v_tab public.tabs; v_tot record; v_auth uuid := null;
begin
  v_me := public._require_role(array['cashier', 'manager', 'admin']::public.app_role[]);
  select * into v_tab from public.tabs where id = p_tab_id and restaurant_id = v_me.restaurant_id for update;
  if not found then raise exception 'Comanda não encontrada'; end if;
  if v_tab.status not in ('open', 'closing') then raise exception 'Comanda já encerrada'; end if;

  select * into v_tot from public.tab_totals(p_tab_id);
  if v_tot.balance > 0 then
    if p_force_reason is null or length(trim(p_force_reason)) < 5 then
      raise exception 'A comanda possui saldo pendente de R$ %', v_tot.balance;
    end if;
    v_auth := public._authorize(v_me, p_supervisor_pin);
  end if;

  update public.tabs set status = 'closed', closed_at = now(), closed_by = v_me.id,
         forced_close_reason = case when v_auth is not null then trim(p_force_reason) else null end,
         forced_close_authorized_by = v_auth
   where id = p_tab_id returning * into v_tab;
  update public.table_sessions set revoked_at = now() where tab_id = p_tab_id and revoked_at is null;
  update public.service_requests set status = 'done', resolved_at = now() where tab_id = p_tab_id and status <> 'done';
  perform public._audit(v_me.restaurant_id, 'tab.close', 'tabs', v_tab.id::text,
    jsonb_build_object('comanda', v_tab.number, 'total', v_tot.total, 'pago', v_tot.paid,
                       'saldo_pendente', greatest(v_tot.balance, 0), 'autorizado_por', v_auth, 'motivo', p_force_reason));
  return jsonb_build_object('tab', to_jsonb(v_tab), 'totals', to_jsonb(v_tot));
end;
$$;
