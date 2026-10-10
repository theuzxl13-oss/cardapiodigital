-- =============================================================================
-- 002 - FUNÇÕES AUXILIARES (identidade, permissões, auditoria, totais)
-- =============================================================================

-- Perfil do usuário autenticado (somente se ativo)
create or replace function public.current_profile()
returns public.profiles
language sql stable security definer set search_path = public
as $$
  select p.* from public.profiles p where p.id = auth.uid() and p.active;
$$;

create or replace function public.current_restaurant_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select p.restaurant_id from public.profiles p where p.id = auth.uid() and p.active;
$$;

create or replace function public.has_role(p_roles public.app_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.role = any (p_roles)
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active);
$$;

-- Garante que o usuário possui um dos papéis; devolve o perfil.
create or replace function public._require_role(p_roles public.app_role[])
returns public.profiles
language plpgsql stable security definer set search_path = public
as $$
declare v public.profiles;
begin
  select * into v from public.profiles where id = auth.uid() and active;
  if not found then
    raise exception 'Acesso negado: usuário não autenticado ou inativo' using errcode = '42501';
  end if;
  if not (v.role = any (p_roles)) then
    raise exception 'Acesso negado: seu perfil (%) não permite esta operação', v.role using errcode = '42501';
  end if;
  return v;
end;
$$;

create or replace function public._next_counter(p_restaurant uuid, p_name text)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare v bigint;
begin
  insert into public.counters (restaurant_id, name, value) values (p_restaurant, p_name, 1)
  on conflict (restaurant_id, name) do update set value = public.counters.value + 1
  returning value into v;
  return v;
end;
$$;

create or replace function public._audit(
  p_restaurant uuid, p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}'
) returns void
language sql security definer set search_path = public
as $$
  insert into public.audit_log (restaurant_id, actor_id, action, entity, entity_id, details)
  values (p_restaurant, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'));
$$;

-- Valida o PIN de um supervisor (gerente/administrador). Retorna o id do autorizador ou null.
create or replace function public._verify_supervisor_pin(p_restaurant uuid, p_pin text)
returns uuid
language plpgsql stable security definer set search_path = public, extensions
as $$
declare v uuid;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    return null;
  end if;
  select p.id into v from public.profiles p
   where p.restaurant_id = p_restaurant and p.active and p.role in ('admin', 'manager')
     and p.pin_hash is not null and p.pin_hash = extensions.crypt(p_pin, p.pin_hash)
   limit 1;
  return v;
end;
$$;

-- Autorização para operações sensíveis: gerente/admin autorizam a si mesmos;
-- demais papéis precisam do PIN de um supervisor.
create or replace function public._authorize(p_actor public.profiles, p_pin text)
returns uuid
language plpgsql stable security definer set search_path = public
as $$
declare v uuid;
begin
  if p_actor.role in ('admin', 'manager') then
    return p_actor.id;
  end if;
  v := public._verify_supervisor_pin(p_actor.restaurant_id, p_pin);
  if v is null then
    raise exception 'Autorização necessária: informe o PIN de um gerente' using errcode = '42501';
  end if;
  return v;
end;
$$;

create or replace function public._hash_token(p_token text)
returns text
language sql immutable set search_path = public, extensions
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- Totais da comanda (fonte única de verdade para caixa, cliente e relatórios)
create or replace function public.tab_totals(p_tab_id uuid)
returns table (
  subtotal numeric, service_fee numeric, discount numeric, total numeric,
  paid numeric, balance numeric
)
language sql stable security definer set search_path = public
as $$
  with t as (select * from public.tabs where id = p_tab_id),
  s as (
    select coalesce(sum(o.subtotal), 0)::numeric as subtotal
    from public.orders o where o.tab_id = p_tab_id and o.status <> 'cancelled'
  ),
  p as (
    select coalesce(sum(amount), 0)::numeric as paid
    from public.payments where tab_id = p_tab_id and voided_at is null
  ),
  calc as (
    select s.subtotal,
           case when t.service_fee_enabled then round(s.subtotal * t.service_fee_pct / 100, 2) else 0 end as service_fee,
           least(t.discount_amount, s.subtotal + case when t.service_fee_enabled then round(s.subtotal * t.service_fee_pct / 100, 2) else 0 end) as discount,
           p.paid
    from t, s, p
  )
  select subtotal, service_fee, discount,
         (subtotal + service_fee - discount) as total,
         paid,
         (subtotal + service_fee - discount - paid) as balance
  from calc;
$$;

-- updated_at automático
create or replace function public._touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

create trigger trg_touch before update on public.restaurants for each row execute function public._touch_updated_at();
create trigger trg_touch before update on public.profiles for each row execute function public._touch_updated_at();
create trigger trg_touch before update on public.products for each row execute function public._touch_updated_at();
create trigger trg_touch before update on public.dining_tables for each row execute function public._touch_updated_at();
create trigger trg_touch before update on public.tabs for each row execute function public._touch_updated_at();
create trigger trg_touch before update on public.ingredients for each row execute function public._touch_updated_at();

-- Auditoria genérica de alterações relevantes em cadastros
create or replace function public._audit_row_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_diff jsonb := '{}';
  k text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if k not in ('updated_at', 'pin_hash') and (v_old -> k) is distinct from (v_new -> k) then
        v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('de', v_old -> k, 'para', v_new -> k));
      end if;
    end loop;
    if v_diff = '{}' then return new; end if;
  elsif tg_op = 'INSERT' then
    v_diff := v_new - 'pin_hash';
  else
    v_diff := v_old - 'pin_hash';
  end if;
  insert into public.audit_log (restaurant_id, actor_id, action, entity, entity_id, details)
  values (coalesce((v_new ->> 'restaurant_id')::uuid, (v_old ->> 'restaurant_id')::uuid, (v_new ->> 'id')::uuid),
          auth.uid(), lower(tg_op), tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id'), v_diff);
  return coalesce(new, old);
end;
$$;

create trigger trg_audit after insert or update or delete on public.products for each row execute function public._audit_row_change();
create trigger trg_audit after insert or update or delete on public.profiles for each row execute function public._audit_row_change();
create trigger trg_audit after insert or update or delete on public.dining_tables for each row execute function public._audit_row_change();
create trigger trg_audit after update on public.restaurants for each row execute function public._audit_row_change();
create trigger trg_audit after insert or update or delete on public.categories for each row execute function public._audit_row_change();
create trigger trg_audit after insert or update or delete on public.product_ingredients for each row execute function public._audit_row_change();

-- Cria o perfil quando um usuário é criado pelo painel/admin API.
-- Usa APENAS app_metadata (não editável pelo próprio usuário), evitando autopromoção.
create or replace function public._handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
  v_restaurant uuid := nullif(new.raw_app_meta_data ->> 'restaurant_id', '')::uuid;
begin
  if v_role is null or v_restaurant is null then
    return new;
  end if;
  insert into public.profiles (id, restaurant_id, full_name, email, role)
  values (new.id, v_restaurant,
          coalesce(new.raw_app_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'full_name', new.email),
          new.email, v_role::public.app_role)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public._handle_new_auth_user();
