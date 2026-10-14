-- =============================================================================
-- 010 - TRANSFERIR E JUNTAR MESAS
-- Somente adiciona uma coluna opcional e funções novas (nenhum dado é apagado).
--
-- transfer_tab: move a comanda inteira para uma mesa LIVRE (pedidos, chamados e sessões
--   dos clientes acompanham). A mesa de origem fica livre.
-- merge_tabs:   soma a comanda de origem à comanda de destino (pedidos, pagamentos,
--   chamados e sessões dos clientes passam para o destino). A comanda de origem é
--   encerrada como "unida" e a mesa dela fica livre.
-- =============================================================================

alter table public.tabs add column if not exists merged_into_tab_id uuid references public.tabs (id);

create or replace function public.transfer_tab(p_tab_id uuid, p_target_table_id uuid)
returns public.tabs
language plpgsql security definer set search_path = public
as $$
declare
  v_me public.profiles;
  v_tab public.tabs;
  v_from public.dining_tables;
  v_to public.dining_tables;
begin
  v_me := public._require_role(array['waiter', 'cashier', 'manager', 'admin']::public.app_role[]);
  select * into v_tab from public.tabs where id = p_tab_id and restaurant_id = v_me.restaurant_id;
  if not found then raise exception 'Comanda não encontrada'; end if;
  if v_tab.table_id = p_target_table_id then raise exception 'A comanda já está nesta mesa'; end if;

  -- Bloqueia as duas mesas sempre na mesma ordem (evita deadlock entre transferências cruzadas)
  perform 1 from public.dining_tables where id in (v_tab.table_id, p_target_table_id) order by id for update;
  select * into v_tab from public.tabs where id = p_tab_id for update;
  if v_tab.status not in ('open', 'closing') then raise exception 'A comanda já foi encerrada'; end if;

  select * into v_from from public.dining_tables where id = v_tab.table_id;
  select * into v_to from public.dining_tables where id = p_target_table_id and restaurant_id = v_me.restaurant_id;
  if not found then raise exception 'Mesa de destino não encontrada'; end if;
  if not v_to.active then raise exception 'A Mesa % está desativada', v_to.number; end if;
  if exists (select 1 from public.tabs where table_id = v_to.id and status in ('open', 'closing')) then
    raise exception 'A Mesa % está ocupada. Para somar as contas, use "Juntar mesas".', v_to.number;
  end if;

  update public.tabs set table_id = v_to.id where id = v_tab.id returning * into v_tab;
  update public.orders set table_id = v_to.id where tab_id = v_tab.id;
  update public.service_requests set table_id = v_to.id where tab_id = v_tab.id;
  update public.table_sessions set table_id = v_to.id where tab_id = v_tab.id;

  perform public._audit(v_me.restaurant_id, 'tab.transfer', 'tabs', v_tab.id::text,
    jsonb_build_object('comanda', v_tab.number, 'de_mesa', v_from.number, 'para_mesa', v_to.number));
  return v_tab;
end;
$$;

create or replace function public.merge_tabs(p_source_tab_id uuid, p_target_tab_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me public.profiles;
  v_src public.tabs;
  v_dst public.tabs;
  v_src_table int;
  v_dst_table int;
  v_tot record;
begin
  v_me := public._require_role(array['waiter', 'cashier', 'manager', 'admin']::public.app_role[]);
  if p_source_tab_id = p_target_tab_id then raise exception 'Escolha outra mesa para juntar'; end if;

  -- Bloqueia as duas comandas sempre na mesma ordem
  perform 1 from public.tabs
   where id in (p_source_tab_id, p_target_tab_id) and restaurant_id = v_me.restaurant_id
   order by id for update;
  select * into v_src from public.tabs where id = p_source_tab_id and restaurant_id = v_me.restaurant_id;
  select * into v_dst from public.tabs where id = p_target_tab_id and restaurant_id = v_me.restaurant_id;
  if v_src.id is null or v_dst.id is null then raise exception 'Comanda não encontrada'; end if;
  if v_src.status not in ('open', 'closing') or v_dst.status not in ('open', 'closing') then
    raise exception 'As duas comandas precisam estar abertas para juntar';
  end if;
  if v_src.discount_amount > 0 then
    raise exception 'A comanda que será unida tem desconto. Remova o desconto no caixa antes de juntar.';
  end if;

  select number into v_src_table from public.dining_tables where id = v_src.table_id;
  select number into v_dst_table from public.dining_tables where id = v_dst.table_id;

  update public.orders set tab_id = v_dst.id, table_id = v_dst.table_id where tab_id = v_src.id;
  update public.payments set tab_id = v_dst.id where tab_id = v_src.id;
  update public.service_requests set tab_id = v_dst.id, table_id = v_dst.table_id where tab_id = v_src.id;
  update public.table_sessions set tab_id = v_dst.id, table_id = v_dst.table_id where tab_id = v_src.id;
  update public.tabs set customer_count = case when v_dst.customer_count is null and v_src.customer_count is null then null
                                               else coalesce(v_dst.customer_count, 0) + coalesce(v_src.customer_count, 0) end
   where id = v_dst.id;

  -- Origem: encerrada como "unida" (não conta como comanda fechada nos relatórios)
  update public.tabs set status = 'cancelled', closed_at = now(), closed_by = v_me.id, merged_into_tab_id = v_dst.id,
         forced_close_reason = format('Unida à comanda #%s (Mesa %s)', v_dst.number, v_dst_table)
   where id = v_src.id;

  select * into v_tot from public.tab_totals(v_dst.id);
  perform public._audit(v_me.restaurant_id, 'tab.merge', 'tabs', v_dst.id::text,
    jsonb_build_object('comanda_origem', v_src.number, 'mesa_origem', v_src_table,
                       'comanda_destino', v_dst.number, 'mesa_destino', v_dst_table, 'novo_total', v_tot.total));
  return jsonb_build_object('tab_id', v_dst.id, 'totals', to_jsonb(v_tot), 'source_table', v_src_table, 'target_table', v_dst_table);
end;
$$;

revoke execute on function public.transfer_tab(uuid, uuid), public.merge_tabs(uuid, uuid) from public, anon, authenticated;
grant execute on function public.transfer_tab(uuid, uuid), public.merge_tabs(uuid, uuid) to authenticated;
