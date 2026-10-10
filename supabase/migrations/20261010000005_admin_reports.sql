-- =============================================================================
-- 005 - ADMINISTRAÇÃO, ESTOQUE E RELATÓRIOS
-- =============================================================================

create or replace function public.adjust_stock(
  p_ingredient_id uuid, p_type public.stock_movement_type, p_quantity numeric,
  p_reason text, p_unit_cost numeric default null
) returns public.ingredients
language plpgsql security definer set search_path = public
as $$
declare v_me public.profiles; v_ing public.ingredients; v_delta numeric;
begin
  v_me := public._require_role(array['manager', 'admin']::public.app_role[]);
  if p_type not in ('purchase', 'adjustment', 'loss') then raise exception 'Tipo de movimentação inválido'; end if;
  if p_quantity is null or p_quantity = 0 then raise exception 'Quantidade inválida'; end if;
  select * into v_ing from public.ingredients where id = p_ingredient_id and restaurant_id = v_me.restaurant_id for update;
  if not found then raise exception 'Insumo não encontrado'; end if;
  v_delta := case p_type when 'purchase' then abs(p_quantity) when 'loss' then -abs(p_quantity) else p_quantity end;
  insert into public.stock_movements (restaurant_id, ingredient_id, type, quantity, unit_cost, reason, created_by)
  values (v_me.restaurant_id, v_ing.id, p_type, v_delta, p_unit_cost, nullif(trim(p_reason), ''), v_me.id);
  update public.ingredients set current_qty = current_qty + v_delta,
         cost_per_unit = case when p_type = 'purchase' and p_unit_cost is not null and p_unit_cost >= 0 then p_unit_cost else cost_per_unit end
   where id = v_ing.id returning * into v_ing;
  return v_ing;
end;
$$;

-- PIN de supervisor (gerente/admin). Admin pode definir de qualquer um; gerente apenas o próprio.
create or replace function public.set_staff_pin(p_user_id uuid, p_pin text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare v_me public.profiles; v_target public.profiles;
begin
  v_me := public._require_role(array['manager', 'admin']::public.app_role[]);
  select * into v_target from public.profiles where id = p_user_id and restaurant_id = v_me.restaurant_id;
  if not found then raise exception 'Funcionário não encontrado'; end if;
  if v_me.role <> 'admin' and v_target.id <> v_me.id then raise exception 'Apenas o administrador pode definir o PIN de outros usuários' using errcode = '42501'; end if;
  if p_pin is null then
    update public.profiles set pin_hash = null where id = v_target.id;
  else
    if p_pin !~ '^[0-9]{4,8}$' then raise exception 'O PIN deve ter de 4 a 8 dígitos'; end if;
    update public.profiles set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)) where id = v_target.id;
  end if;
  perform public._audit(v_me.restaurant_id, 'profile.set_pin', 'profiles', v_target.id::text, '{}');
end;
$$;

create or replace function public.regenerate_table_qr(p_table_id uuid)
returns public.dining_tables
language plpgsql security definer set search_path = public, extensions
as $$
declare v_me public.profiles; v public.dining_tables;
begin
  v_me := public._require_role(array['manager', 'admin']::public.app_role[]);
  update public.dining_tables set qr_token = encode(extensions.gen_random_bytes(18), 'hex')
   where id = p_table_id and restaurant_id = v_me.restaurant_id returning * into v;
  if not found then raise exception 'Mesa não encontrada'; end if;
  perform public._audit(v_me.restaurant_id, 'table.regenerate_qr', 'dining_tables', v.id::text, jsonb_build_object('mesa', v.number));
  return v;
end;
$$;

-- Indicadores em tempo real para o dashboard
create or replace function public.dashboard_live()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_me public.profiles; v_tz text; v_today_start timestamptz;
begin
  v_me := public._require_role(array['manager', 'admin', 'cashier']::public.app_role[]);
  select timezone into v_tz from public.restaurants where id = v_me.restaurant_id;
  v_today_start := (date_trunc('day', now() at time zone v_tz)) at time zone v_tz;
  return jsonb_build_object(
    'tables_total', (select count(*) from public.dining_tables where restaurant_id = v_me.restaurant_id and active),
    'tables_occupied', (select count(*) from public.tabs where restaurant_id = v_me.restaurant_id and status in ('open', 'closing')),
    'tabs_closing', (select count(*) from public.tabs where restaurant_id = v_me.restaurant_id and status = 'closing'),
    'orders_received', (select count(*) from public.orders where restaurant_id = v_me.restaurant_id and status = 'received'),
    'orders_preparing', (select count(*) from public.orders where restaurant_id = v_me.restaurant_id and status = 'preparing'),
    'orders_ready', (select count(*) from public.orders where restaurant_id = v_me.restaurant_id and status = 'ready'),
    'orders_delivered_today', (select count(*) from public.orders where restaurant_id = v_me.restaurant_id and status = 'delivered' and created_at >= v_today_start),
    'revenue_today', (select coalesce(sum(amount), 0) from public.payments where restaurant_id = v_me.restaurant_id and voided_at is null and created_at >= v_today_start),
    'open_balance', (select coalesce(sum(t.total), 0) from public.tabs tb, lateral public.tab_totals(tb.id) t
                      where tb.restaurant_id = v_me.restaurant_id and tb.status in ('open', 'closing')),
    'low_stock', (select count(*) from public.ingredients where restaurant_id = v_me.restaurant_id and active and current_qty <= min_qty),
    'open_requests', (select count(*) from public.service_requests where restaurant_id = v_me.restaurant_id and status <> 'done')
  );
end;
$$;

-- Relatório consolidado de vendas por período
create or replace function public.report_summary(p_from timestamptz, p_to timestamptz, p_include_demo boolean default true)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_me public.profiles; v_tz text; v_r uuid;
begin
  v_me := public._require_role(array['manager', 'admin']::public.app_role[]);
  v_r := v_me.restaurant_id;
  select timezone into v_tz from public.restaurants where id = v_r;
  if p_to <= p_from then raise exception 'Período inválido'; end if;

  return (
  with pay as (
    select p.* from public.payments p join public.tabs t on t.id = p.tab_id
     where p.restaurant_id = v_r and p.voided_at is null and p.created_at >= p_from and p.created_at < p_to
       and (p_include_demo or not t.is_demo)
  ),
  ord as (
    select o.* from public.orders o join public.tabs t on t.id = o.tab_id
     where o.restaurant_id = v_r and o.created_at >= p_from and o.created_at < p_to
       and (p_include_demo or not t.is_demo)
  ),
  closed as (
    select t.id, tt.total, tt.subtotal, tt.service_fee, tt.discount from public.tabs t, lateral public.tab_totals(t.id) tt
     where t.restaurant_id = v_r and t.status = 'closed' and t.closed_at >= p_from and t.closed_at < p_to
       and (p_include_demo or not t.is_demo)
  )
  select jsonb_build_object(
    'revenue', (select coalesce(sum(amount), 0) from pay),
    'payments_count', (select count(*) from pay),
    'orders_count', (select count(*) from ord where status <> 'cancelled'),
    'orders_cancelled', (select count(*) from ord where status = 'cancelled'),
    'cancelled_value', (select coalesce(sum(subtotal), 0) from ord where status = 'cancelled'),
    'tabs_closed', (select count(*) from closed),
    'avg_ticket', (select coalesce(round(avg(total), 2), 0) from closed),
    'service_fee_total', (select coalesce(sum(service_fee), 0) from closed),
    'discount_total', (select coalesce(sum(discount), 0) from closed),
    'includes_demo_data', exists (select 1 from public.tabs t where t.restaurant_id = v_r and t.is_demo
                                   and t.opened_at < p_to and coalesce(t.closed_at, now()) >= p_from) and p_include_demo,
    'by_method', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'total', total, 'count', n) order by total desc)
                  from (select method, sum(amount) total, count(*) n from pay group by method) x), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'revenue', revenue, 'payments', n) order by day)
                  from (select to_char(created_at at time zone v_tz, 'YYYY-MM-DD') as day, sum(amount) revenue, count(*) n
                          from pay group by 1) d), '[]'::jsonb),
    'hourly', coalesce((select jsonb_agg(jsonb_build_object('hour', h, 'orders', n) order by h)
                  from (select extract(hour from created_at at time zone v_tz)::int h, count(*) n
                          from ord where status <> 'cancelled' group by 1) d), '[]'::jsonb),
    'top_products', coalesce((select jsonb_agg(x order by (x ->> 'quantity')::int desc) from (
                  select jsonb_build_object('product_id', i.product_id, 'name', max(i.product_name),
                         'quantity', sum(i.quantity), 'revenue', sum(i.line_total)) x
                    from public.order_items i join ord o on o.id = i.order_id
                   where o.status <> 'cancelled' group by i.product_id
                   order by sum(i.quantity) desc limit 15) t), '[]'::jsonb),
    'by_category', coalesce((select jsonb_agg(jsonb_build_object('category', c.name, 'quantity', q, 'revenue', rv) order by rv desc)
                  from (select p.category_id, sum(i.quantity) q, sum(i.line_total) rv
                          from public.order_items i join ord o on o.id = i.order_id join public.products p on p.id = i.product_id
                         where o.status <> 'cancelled' group by p.category_id) s
                  join public.categories c on c.id = s.category_id), '[]'::jsonb),
    'by_operator', coalesce((select jsonb_agg(jsonb_build_object('operator', pr.full_name, 'total', s.total, 'count', s.n) order by s.total desc)
                  from (select created_by, sum(amount) total, count(*) n from pay group by created_by) s
                  join public.profiles pr on pr.id = s.created_by), '[]'::jsonb),
    'by_waiter', coalesce((select jsonb_agg(jsonb_build_object('waiter', pr.full_name, 'orders', s.n, 'total', s.total) order by s.total desc)
                  from (select created_by, count(*) n, sum(subtotal) total from ord
                         where status <> 'cancelled' and source = 'waiter' group by created_by) s
                  join public.profiles pr on pr.id = s.created_by), '[]'::jsonb),
    'by_source', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'orders', n, 'total', total))
                  from (select source, count(*) n, sum(subtotal) total from ord where status <> 'cancelled' group by source) s), '[]'::jsonb),
    'avg_prep_minutes', (select coalesce(round(avg(extract(epoch from (ready_at - started_at)) / 60)::numeric, 1), 0)
                           from ord where ready_at is not null and started_at is not null),
    'avg_wait_minutes', (select coalesce(round(avg(extract(epoch from (ready_at - created_at)) / 60)::numeric, 1), 0)
                           from ord where ready_at is not null)
  ));
end;
$$;
