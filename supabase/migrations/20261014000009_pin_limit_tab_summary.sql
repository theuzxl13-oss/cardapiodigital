-- =============================================================================
-- 009 - LIMITE DE TENTATIVAS DO PIN DE GERENTE + RESUMO DAS COMANDAS ABERTAS
-- Somente cria tabelas/funções novas e recria _authorize (nenhum dado é apagado).
--
-- PIN de gerente em duas etapas:
--   1. authorize_supervisor_pin(pin): valida o PIN SEM lançar erro (a tentativa errada fica
--      registrada) e, se correto, cria uma autorização de uso único válida por 2 minutos.
--      Após 5 erros em 10 minutos, o funcionário fica bloqueado por 10 minutos.
--   2. A operação sensível (cancelar, desconto, estorno, fechar com saldo) consome a autorização.
--   Gerentes e administradores continuam autorizando as próprias operações sem PIN.
-- =============================================================================

create table if not exists public.supervisor_pin_attempts (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants (id),
  actor_id uuid not null references public.profiles (id),
  success boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists supervisor_pin_attempts_actor_idx on public.supervisor_pin_attempts (actor_id, created_at desc);

create table if not exists public.supervisor_grants (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id),
  actor_id uuid not null references public.profiles (id),
  authorizer_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists supervisor_grants_actor_idx on public.supervisor_grants (actor_id, created_at desc) where used_at is null;

-- Acesso somente pelas funções (nenhuma política = nenhuma leitura/escrita direta)
alter table public.supervisor_pin_attempts enable row level security;
alter table public.supervisor_grants enable row level security;
revoke all on public.supervisor_pin_attempts, public.supervisor_grants from anon, authenticated;

create or replace function public.authorize_supervisor_pin(p_pin text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me public.profiles;
  v_failures int;
  v_last_failure timestamptz;
  v_authorizer uuid;
  v_max constant int := 5;
  v_window constant interval := interval '10 minutes';
begin
  v_me := public._require_role(array['waiter', 'cashier', 'manager', 'admin']::public.app_role[]);

  -- Falhas consecutivas recentes (desde o último acerto, dentro da janela)
  select count(*), max(created_at) into v_failures, v_last_failure
    from public.supervisor_pin_attempts a
   where a.actor_id = v_me.id and not a.success and a.created_at > now() - v_window
     and a.created_at > coalesce((select max(created_at) from public.supervisor_pin_attempts s
                                   where s.actor_id = v_me.id and s.success), '-infinity');
  if v_failures >= v_max then
    return jsonb_build_object('ok', false, 'locked', true, 'locked_until', v_last_failure + v_window,
      'message', format('Muitas tentativas de PIN incorretas. Tente novamente às %s.',
                        to_char((v_last_failure + v_window) at time zone
                                (select timezone from public.restaurants where id = v_me.restaurant_id), 'HH24:MI')));
  end if;

  v_authorizer := public._verify_supervisor_pin(v_me.restaurant_id, p_pin);
  insert into public.supervisor_pin_attempts (restaurant_id, actor_id, success)
  values (v_me.restaurant_id, v_me.id, v_authorizer is not null);

  if v_authorizer is null then
    if v_failures + 1 >= v_max then
      perform public._audit(v_me.restaurant_id, 'profile.pin_locked', 'profiles', v_me.id::text,
                            jsonb_build_object('tentativas', v_failures + 1));
    end if;
    return jsonb_build_object('ok', false, 'locked', v_failures + 1 >= v_max, 'remaining', greatest(v_max - v_failures - 1, 0),
      'message', case when v_failures + 1 >= v_max
                      then 'PIN incorreto. Limite de tentativas atingido: aguarde 10 minutos.'
                      else format('PIN incorreto. Restam %s tentativa(s).', v_max - v_failures - 1) end);
  end if;

  insert into public.supervisor_grants (restaurant_id, actor_id, authorizer_id)
  values (v_me.restaurant_id, v_me.id, v_authorizer);
  return jsonb_build_object('ok', true);
end;
$$;

-- Gerente/admin autorizam a si mesmos; os demais consomem uma autorização obtida pelo PIN.
-- (p_pin é mantido na assinatura por compatibilidade, mas não é mais verificado aqui.)
create or replace function public._authorize(p_actor public.profiles, p_pin text)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare v_grant public.supervisor_grants;
begin
  if p_actor.role in ('admin', 'manager') then
    return p_actor.id;
  end if;
  select * into v_grant from public.supervisor_grants
   where actor_id = p_actor.id and used_at is null and created_at > now() - interval '2 minutes'
   order by created_at desc
   limit 1
   for update skip locked;
  if not found then
    raise exception 'Autorização necessária: informe o PIN de um gerente' using errcode = '42501';
  end if;
  update public.supervisor_grants set used_at = now() where id = v_grant.id;
  return v_grant.authorizer_id;
end;
$$;

-- Totais de todas as comandas abertas numa única consulta (tela do caixa)
create or replace function public.staff_open_tabs_summary()
returns table (tab_id uuid, subtotal numeric, service_fee numeric, discount numeric, total numeric, paid numeric, balance numeric)
language plpgsql stable security definer set search_path = public
as $$
declare v_me public.profiles;
begin
  v_me := public._require_role(array['cashier', 'manager', 'admin', 'waiter']::public.app_role[]);
  return query
    select t.id, x.subtotal, x.service_fee, x.discount, x.total, x.paid, x.balance
      from public.tabs t, lateral public.tab_totals(t.id) x
     where t.restaurant_id = v_me.restaurant_id and t.status in ('open', 'closing');
end;
$$;

revoke execute on function public.authorize_supervisor_pin(text), public.staff_open_tabs_summary(), public._authorize(public.profiles, text)
  from public, anon, authenticated;
grant execute on function public.authorize_supervisor_pin(text), public.staff_open_tabs_summary() to authenticated;
