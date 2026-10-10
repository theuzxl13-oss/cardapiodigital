-- =============================================================================
-- SEED DE DEMONSTRAÇÃO
-- Dados fictícios para apresentação comercial. Restaurante marcado is_demo = true.
-- Os usuários (funcionários) são criados por `npm run seed:demo` via Admin API.
-- =============================================================================

insert into public.restaurants (id, name, slug, tagline, address, phone, logo_url, cover_url, service_fee_pct,
                                max_discount_pct, allow_customer_open_tab, is_demo)
values ('00000000-0000-4000-a000-000000000001', 'Sabor & Arte Bistrô', 'sabor-arte',
        'Cozinha contemporânea com alma brasileira', 'Rua Exemplo, 123 - Centro (endereço fictício)',
        '(00) 0000-0000', '/brand/logo.svg', '/brand/cover.svg', 10, 10, true, true)
on conflict (id) do nothing;

-- Mesas 1..15
insert into public.dining_tables (restaurant_id, number, label, seats)
select '00000000-0000-4000-a000-000000000001', n,
       case when n <= 6 then 'Salão' when n <= 12 then 'Varanda' else 'Mezanino' end,
       case when n % 5 = 0 then 6 when n % 3 = 0 then 2 else 4 end
from generate_series(1, 15) n
on conflict (restaurant_id, number) do nothing;

-- Categorias
insert into public.categories (id, restaurant_id, name, slug, icon, sort_order) values
('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'Entradas', 'entradas', 'salad', 1),
('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000001', 'Pratos Principais', 'pratos-principais', 'utensils', 2),
('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000001', 'Porções', 'porcoes', 'drumstick', 3),
('00000000-0000-4000-b000-000000000004', '00000000-0000-4000-a000-000000000001', 'Bebidas', 'bebidas', 'cup-soda', 4),
('00000000-0000-4000-b000-000000000005', '00000000-0000-4000-a000-000000000001', 'Sobremesas', 'sobremesas', 'cake-slice', 5)
on conflict (id) do nothing;

-- Produtos (30). key -> /models/<key>.glb e /images/products/<key>.webp
drop table if exists _p;
create temporary table _p (
  key text, cat int, name text, descr text, price numeric, ingredients text, allergens text[],
  prep int, featured boolean, sort int, tags text[]
);

insert into _p values
('bruschetta', 1, 'Bruschetta de Tomate e Manjericão', 'Pão italiano tostado com tomates frescos, manjericão, alho e azeite extravirgem. 4 unidades.', 29.90, 'Pão italiano, tomate, manjericão, alho, azeite', '{glúten}', 10, false, 1, '{vegetariano}'),
('carpaccio', 1, 'Carpaccio Clássico', 'Finas lâminas de filé mignon, molho de mostarda, alcaparras, rúcula e lascas de parmesão.', 42.00, 'Filé mignon, mostarda, alcaparras, rúcula, parmesão', '{lactose,mostarda}', 10, false, 2, '{}'),
('bolinho-bacalhau', 1, 'Bolinho de Bacalhau', 'Seis bolinhos crocantes de bacalhau desfiado com batata e salsinha. Acompanha limão.', 38.00, 'Bacalhau, batata, ovo, salsinha', '{peixe,ovo,glúten}', 15, true, 3, '{}'),
('salada-caesar', 1, 'Salada Caesar', 'Alface romana, croutons, parmesão e molho caesar da casa. Opção com frango grelhado.', 36.00, 'Alface romana, croutons, parmesão, molho caesar', '{lactose,glúten,ovo}', 10, false, 4, '{}'),
('caldo-feijao', 1, 'Caldo de Feijão', 'Caldo cremoso de feijão com bacon crocante, cebolinha e torradinhas.', 18.00, 'Feijão, bacon, cebolinha, torradas', '{glúten}', 5, false, 5, '{}'),
('burger', 2, 'Hambúrguer Artesanal Clássico', 'Blend bovino de 180g, queijo cheddar, alface, tomate, cebola roxa e molho especial no pão brioche. Acompanha fritas.', 39.90, 'Pão brioche, blend bovino 180g, cheddar, alface, tomate, cebola roxa, molho especial', '{glúten,lactose,ovo}', 20, true, 1, '{mais pedido}'),
('burger-duplo', 2, 'Cheeseburger Duplo', 'Dois blends de 150g, dobro de cheddar, bacon crocante e picles no pão brioche.', 49.90, 'Pão brioche, 2 blends bovinos 150g, cheddar, bacon, picles', '{glúten,lactose}', 22, false, 2, '{}'),
('pizza-margherita', 2, 'Pizza Margherita Individual', 'Massa de fermentação natural, molho de tomate pelado, mussarela de búfala e manjericão. 25 cm.', 59.90, 'Massa de fermentação natural, tomate pelado, mussarela de búfala, manjericão', '{glúten,lactose}', 18, true, 3, '{vegetariano}'),
('parmegiana', 2, 'Filé à Parmegiana', 'Filé mignon empanado, molho de tomate e queijo gratinado. Acompanha arroz e batata frita.', 68.90, 'Filé mignon, farinha de rosca, ovo, molho de tomate, mussarela, arroz, batata', '{glúten,lactose,ovo}', 25, false, 4, '{}'),
('risoto-cogumelos', 2, 'Risoto de Cogumelos', 'Arroz arbóreo cremoso com mix de cogumelos frescos, vinho branco e parmesão.', 58.00, 'Arroz arbóreo, shiitake, champignon, vinho branco, parmesão, manteiga', '{lactose}', 25, false, 5, '{vegetariano}'),
('picanha', 2, 'Picanha na Chapa', 'Picanha grelhada (300g) com farofa, vinagrete e arroz. Serve 1 pessoa.', 89.90, 'Picanha, farofa, vinagrete, arroz', '{}', 25, true, 6, '{}'),
('salmao', 2, 'Salmão Grelhado', 'Filé de salmão grelhado com legumes salteados e purê de batata-doce.', 79.90, 'Salmão, abobrinha, cenoura, brócolis, batata-doce', '{peixe,lactose}', 22, false, 7, '{}'),
('spaghetti', 2, 'Spaghetti à Bolonhesa', 'Massa grano duro com molho bolonhesa de cozimento lento e parmesão.', 46.90, 'Spaghetti, carne moída, molho de tomate, parmesão', '{glúten,lactose}', 18, false, 8, '{}'),
('batata-frita', 3, 'Batata Frita', 'Porção de batatas crocantes (400g) com sal e alecrim.', 28.00, 'Batata, sal, alecrim', '{}', 12, true, 1, '{vegano}'),
('mandioca', 3, 'Mandioca Frita', 'Mandioca frita sequinha (400g) com maionese de alho.', 26.00, 'Mandioca, maionese de alho', '{ovo}', 12, false, 2, '{}'),
('calabresa', 3, 'Calabresa Acebolada', 'Linguiça calabresa fatiada e salteada com cebola. Acompanha pão.', 34.00, 'Calabresa, cebola, pão', '{glúten}', 12, false, 3, '{}'),
('isca-frango', 3, 'Isca de Frango Empanada', 'Tiras de frango empanadas e crocantes com molho barbecue.', 39.00, 'Peito de frango, farinha panko, molho barbecue', '{glúten,ovo}', 15, false, 4, '{}'),
('aneis-cebola', 3, 'Anéis de Cebola', 'Anéis de cebola empanados na cerveja com molho ranch.', 27.00, 'Cebola, massa de cerveja, molho ranch', '{glúten,lactose}', 12, false, 5, '{vegetariano}'),
('refrigerante', 4, 'Refrigerante Lata 350ml', 'Escolha o sabor. Servido com gelo e limão.', 7.00, null, '{}', 1, false, 1, '{}'),
('suco', 4, 'Suco Natural 400ml', 'Suco da fruta, feito na hora.', 12.00, 'Fruta natural', '{}', 5, false, 2, '{}'),
('agua', 4, 'Água Mineral 500ml', 'Com ou sem gás.', 5.00, null, '{}', 1, false, 3, '{}'),
('cerveja', 4, 'Cerveja Long Neck 355ml', 'Cerveja pilsen bem gelada. Venda proibida para menores de 18 anos.', 13.00, null, '{glúten}', 1, false, 4, '{alcoólico}'),
('caipirinha', 4, 'Caipirinha de Limão', 'Cachaça artesanal, limão taiti, açúcar e gelo.', 22.00, 'Cachaça, limão, açúcar', '{}', 5, true, 5, '{alcoólico}'),
('cha-gelado', 4, 'Chá Gelado da Casa', 'Chá preto com pêssego e hortelã, levemente adoçado.', 9.00, 'Chá preto, pêssego, hortelã', '{}', 3, false, 6, '{}'),
('cafe', 4, 'Café Expresso', 'Café 100% arábica, extração curta.', 6.00, 'Café arábica', '{}', 3, false, 7, '{}'),
('petit-gateau', 5, 'Petit Gâteau', 'Bolinho de chocolate com interior cremoso e sorvete de creme.', 29.00, 'Chocolate meio amargo, ovos, manteiga, farinha, sorvete de creme', '{glúten,lactose,ovo}', 12, true, 1, '{}'),
('pudim', 5, 'Pudim de Leite', 'Pudim tradicional com calda de caramelo.', 16.00, 'Leite condensado, leite, ovos, açúcar', '{lactose,ovo}', 3, false, 2, '{}'),
('brownie', 5, 'Brownie com Sorvete', 'Brownie de chocolate com nozes e uma bola de sorvete de creme.', 26.00, 'Chocolate, nozes, ovos, farinha, sorvete', '{glúten,lactose,ovo,nozes}', 5, false, 3, '{}'),
('cheesecake', 5, 'Cheesecake de Frutas Vermelhas', 'Base crocante, creme de cream cheese e calda de frutas vermelhas.', 24.00, 'Cream cheese, biscoito, manteiga, frutas vermelhas', '{glúten,lactose}', 3, false, 4, '{}'),
('sorvete', 5, 'Taça de Sorvete', 'Duas bolas de sorvete com calda de chocolate e farofa crocante.', 15.00, 'Sorvete, calda de chocolate, farofa doce', '{lactose,glúten}', 3, false, 5, '{}');

insert into public.products (restaurant_id, category_id, name, description, price, image_url, ingredients, allergens,
                             prep_minutes, featured, sort_order, tags, model_glb_url, model_usdz_url,
                             model_is_illustrative, model_credit)
select '00000000-0000-4000-a000-000000000001',
       ('00000000-0000-4000-b000-00000000000' || cat)::uuid,
       name, descr, price, '/images/products/' || key || '.webp', ingredients, allergens, prep, featured, sort, tags,
       '/models/' || key || '.glb', '/models/' || key || '.usdz', true,
       'Modelo 3D ilustrativo gerado proceduralmente pelo projeto (licença MIT). Substitua por fotogrametria do prato real.'
from _p
where not exists (select 1 from public.products p where p.name = _p.name);

drop table _p;

-- Adicionais / personalização
do $$
declare r uuid := '00000000-0000-4000-a000-000000000001'; g uuid; pid uuid;
begin
  if exists (select 1 from public.modifier_groups where restaurant_id = r) then return; end if;

  for pid in select id from public.products where name in ('Hambúrguer Artesanal Clássico', 'Cheeseburger Duplo') loop
    insert into public.modifier_groups (restaurant_id, product_id, name, min_select, max_select, sort_order)
    values (r, pid, 'Ponto da carne', 1, 1, 1) returning id into g;
    insert into public.modifier_options (restaurant_id, group_id, name, price_delta, sort_order) values
      (r, g, 'Mal passado', 0, 1), (r, g, 'Ao ponto', 0, 2), (r, g, 'Bem passado', 0, 3);
    insert into public.modifier_groups (restaurant_id, product_id, name, min_select, max_select, sort_order)
    values (r, pid, 'Adicionais', 0, 4, 2) returning id into g;
    insert into public.modifier_options (restaurant_id, group_id, name, price_delta, sort_order) values
      (r, g, 'Bacon extra', 6, 1), (r, g, 'Queijo extra', 5, 2), (r, g, 'Ovo', 4, 3), (r, g, 'Cebola caramelizada', 4, 4);
  end loop;

  select id into pid from public.products where name = 'Picanha na Chapa';
  insert into public.modifier_groups (restaurant_id, product_id, name, min_select, max_select, sort_order)
  values (r, pid, 'Ponto da carne', 1, 1, 1) returning id into g;
  insert into public.modifier_options (restaurant_id, group_id, name, price_delta, sort_order) values
    (r, g, 'Mal passado', 0, 1), (r, g, 'Ao ponto', 0, 2), (r, g, 'Bem passado', 0, 3);

  select id into pid from public.products where name = 'Salada Caesar';
  insert into public.modifier_groups (restaurant_id, product_id, name, min_select, max_select, sort_order)
  values (r, pid, 'Proteína', 0, 1, 1) returning id into g;
  insert into public.modifier_options (restaurant_id, group_id, name, price_delta, sort_order) values
    (r, g, 'Frango grelhado', 12, 1), (r, g, 'Camarão', 18, 2);

  select id into pid from public.products where name = 'Batata Frita';
  insert into public.modifier_groups (restaurant_id, product_id, name, min_select, max_select, sort_order)
  values (r, pid, 'Cobertura', 0, 1, 1) returning id into g;
  insert into public.modifier_options (restaurant_id, group_id, name, price_delta, sort_order) values
    (r, g, 'Cheddar e bacon', 8, 1), (r, g, 'Parmesão e trufa', 10, 2);

  select id into pid from public.products where name = 'Pizza Margherita Individual';
  insert into public.modifier_groups (restaurant_id, product_id, name, min_select, max_select, sort_order)
  values (r, pid, 'Borda', 0, 1, 1) returning id into g;
  insert into public.modifier_options (restaurant_id, group_id, name, price_delta, sort_order) values
    (r, g, 'Borda recheada de catupiry', 9, 1);

  select id into pid from public.products where name = 'Refrigerante Lata 350ml';
  insert into public.modifier_groups (restaurant_id, product_id, name, min_select, max_select, sort_order)
  values (r, pid, 'Sabor', 1, 1, 1) returning id into g;
  insert into public.modifier_options (restaurant_id, group_id, name, price_delta, sort_order) values
    (r, g, 'Cola', 0, 1), (r, g, 'Cola Zero', 0, 2), (r, g, 'Guaraná', 0, 3), (r, g, 'Limão', 0, 4);

  select id into pid from public.products where name = 'Suco Natural 400ml';
  insert into public.modifier_groups (restaurant_id, product_id, name, min_select, max_select, sort_order)
  values (r, pid, 'Fruta', 1, 1, 1) returning id into g;
  insert into public.modifier_options (restaurant_id, group_id, name, price_delta, sort_order) values
    (r, g, 'Laranja', 0, 1), (r, g, 'Limão', 0, 2), (r, g, 'Maracujá', 0, 3), (r, g, 'Abacaxi com hortelã', 1.5, 4);
  insert into public.modifier_groups (restaurant_id, product_id, name, min_select, max_select, sort_order)
  values (r, pid, 'Preparo', 0, 1, 2) returning id into g;
  insert into public.modifier_options (restaurant_id, group_id, name, price_delta, sort_order) values
    (r, g, 'Sem açúcar', 0, 1), (r, g, 'Com leite', 2, 2);

  select id into pid from public.products where name = 'Água Mineral 500ml';
  insert into public.modifier_groups (restaurant_id, product_id, name, min_select, max_select, sort_order)
  values (r, pid, 'Tipo', 1, 1, 1) returning id into g;
  insert into public.modifier_options (restaurant_id, group_id, name, price_delta, sort_order) values
    (r, g, 'Sem gás', 0, 1), (r, g, 'Com gás', 0, 2);
end $$;

-- Estoque: insumos
insert into public.ingredients (restaurant_id, name, unit, current_qty, min_qty, cost_per_unit)
select '00000000-0000-4000-a000-000000000001', n, u, q, m, c from (values
  ('Pão brioche', 'un', 80, 20, 1.80),
  ('Blend bovino 180g', 'un', 60, 15, 7.50),
  ('Blend bovino 150g', 'un', 50, 15, 6.30),
  ('Queijo cheddar', 'g', 4000, 800, 0.06),
  ('Bacon', 'g', 3000, 600, 0.07),
  ('Batata', 'g', 20000, 4000, 0.008),
  ('Mandioca', 'g', 8000, 2000, 0.007),
  ('Massa de pizza', 'un', 30, 8, 3.20),
  ('Mussarela de búfala', 'g', 3000, 600, 0.09),
  ('Molho de tomate', 'ml', 8000, 1500, 0.012),
  ('Filé mignon', 'g', 9000, 2000, 0.11),
  ('Picanha', 'g', 7000, 1500, 0.09),
  ('Salmão', 'g', 5000, 1200, 0.12),
  ('Arroz arbóreo', 'g', 5000, 1000, 0.025),
  ('Cogumelos', 'g', 2500, 500, 0.06),
  ('Spaghetti', 'g', 5000, 1000, 0.012),
  ('Calabresa', 'g', 4000, 800, 0.03),
  ('Peito de frango', 'g', 6000, 1500, 0.025),
  ('Cebola', 'g', 6000, 1000, 0.006),
  ('Bacalhau', 'g', 3000, 800, 0.14),
  ('Refrigerante lata', 'un', 120, 36, 3.20),
  ('Água mineral', 'un', 96, 24, 1.20),
  ('Cerveja long neck', 'un', 96, 24, 4.80),
  ('Cachaça', 'ml', 5000, 1000, 0.05),
  ('Limão', 'un', 150, 40, 0.40),
  ('Fruta para suco', 'g', 10000, 2000, 0.012),
  ('Café em grãos', 'g', 3000, 500, 0.09),
  ('Chocolate meio amargo', 'g', 3000, 600, 0.05),
  ('Sorvete de creme', 'ml', 8000, 1500, 0.02),
  ('Leite condensado', 'g', 4000, 800, 0.02),
  ('Cream cheese', 'g', 3000, 600, 0.05),
  ('Alface romana', 'g', 3000, 500, 0.02),
  ('Pão italiano', 'g', 3000, 600, 0.015),
  ('Tomate', 'g', 6000, 1000, 0.008),
  ('Feijão', 'g', 5000, 1000, 0.01),
  ('Chá preto', 'g', 1000, 200, 0.08)
) v(n, u, q, m, c)
on conflict (restaurant_id, name) do nothing;

-- Fichas técnicas
insert into public.product_ingredients (product_id, ingredient_id, restaurant_id, quantity)
select p.id, i.id, p.restaurant_id, v.q
from (values
  ('Hambúrguer Artesanal Clássico', 'Pão brioche', 1), ('Hambúrguer Artesanal Clássico', 'Blend bovino 180g', 1),
  ('Hambúrguer Artesanal Clássico', 'Queijo cheddar', 30), ('Hambúrguer Artesanal Clássico', 'Batata', 150),
  ('Cheeseburger Duplo', 'Pão brioche', 1), ('Cheeseburger Duplo', 'Blend bovino 150g', 2),
  ('Cheeseburger Duplo', 'Queijo cheddar', 60), ('Cheeseburger Duplo', 'Bacon', 40),
  ('Pizza Margherita Individual', 'Massa de pizza', 1), ('Pizza Margherita Individual', 'Mussarela de búfala', 150),
  ('Pizza Margherita Individual', 'Molho de tomate', 120),
  ('Filé à Parmegiana', 'Filé mignon', 220), ('Filé à Parmegiana', 'Molho de tomate', 150), ('Filé à Parmegiana', 'Batata', 150),
  ('Risoto de Cogumelos', 'Arroz arbóreo', 120), ('Risoto de Cogumelos', 'Cogumelos', 100),
  ('Picanha na Chapa', 'Picanha', 300), ('Salmão Grelhado', 'Salmão', 220),
  ('Spaghetti à Bolonhesa', 'Spaghetti', 140), ('Spaghetti à Bolonhesa', 'Molho de tomate', 150),
  ('Carpaccio Clássico', 'Filé mignon', 90), ('Bolinho de Bacalhau', 'Bacalhau', 120),
  ('Salada Caesar', 'Alface romana', 150), ('Bruschetta de Tomate e Manjericão', 'Pão italiano', 120),
  ('Bruschetta de Tomate e Manjericão', 'Tomate', 120), ('Caldo de Feijão', 'Feijão', 120), ('Caldo de Feijão', 'Bacon', 20),
  ('Batata Frita', 'Batata', 400), ('Mandioca Frita', 'Mandioca', 400), ('Calabresa Acebolada', 'Calabresa', 300),
  ('Calabresa Acebolada', 'Cebola', 100), ('Isca de Frango Empanada', 'Peito de frango', 350), ('Anéis de Cebola', 'Cebola', 250),
  ('Refrigerante Lata 350ml', 'Refrigerante lata', 1), ('Água Mineral 500ml', 'Água mineral', 1),
  ('Cerveja Long Neck 355ml', 'Cerveja long neck', 1), ('Caipirinha de Limão', 'Cachaça', 60), ('Caipirinha de Limão', 'Limão', 1),
  ('Suco Natural 400ml', 'Fruta para suco', 300), ('Café Expresso', 'Café em grãos', 8), ('Chá Gelado da Casa', 'Chá preto', 5),
  ('Petit Gâteau', 'Chocolate meio amargo', 60), ('Petit Gâteau', 'Sorvete de creme', 80),
  ('Pudim de Leite', 'Leite condensado', 80), ('Brownie com Sorvete', 'Chocolate meio amargo', 50),
  ('Brownie com Sorvete', 'Sorvete de creme', 80), ('Cheesecake de Frutas Vermelhas', 'Cream cheese', 90),
  ('Taça de Sorvete', 'Sorvete de creme', 160)
) v(pn, iname, q)
join public.products p on p.name = v.pn and p.restaurant_id = '00000000-0000-4000-a000-000000000001'
join public.ingredients i on i.name = v.iname and i.restaurant_id = p.restaurant_id
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Gerador de histórico fictício (relatórios). Executado após a criação dos
-- funcionários (npm run seed:demo). Somente service_role.
-- Todos os registros gerados possuem is_demo = true.
-- -----------------------------------------------------------------------------
create or replace function public.demo_generate_history(p_days int default 30)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  r uuid := '00000000-0000-4000-a000-000000000001';
  v_tz text := 'America/Sao_Paulo';
  d int; v_day date; n_tabs int; k int; j int; m int;
  v_table record; v_tab public.tabs; v_order public.orders; v_prod record; v_qty int;
  v_open timestamptz; v_t timestamptz; v_sub numeric; v_tot record; v_method public.payment_method;
  v_cashier uuid; v_waiter uuid; v_cook uuid; v_session uuid; v_split int; v_part numeric; v_amount numeric;
  v_cashiers uuid[]; v_waiters uuid[]; v_cooks uuid[];
  v_tabs_count int := 0; v_orders_count int := 0;
begin
  if exists (select 1 from public.tabs where restaurant_id = r and is_demo and status = 'closed') then
    return jsonb_build_object('skipped', true, 'reason', 'Histórico de demonstração já gerado');
  end if;
  select array_agg(id) into v_cashiers from public.profiles where restaurant_id = r and role = 'cashier';
  select array_agg(id) into v_waiters from public.profiles where restaurant_id = r and role = 'waiter';
  select array_agg(id) into v_cooks from public.profiles where restaurant_id = r and role = 'kitchen';
  if v_cashiers is null or v_waiters is null or v_cooks is null then
    raise exception 'Crie os funcionários de demonstração antes de gerar o histórico';
  end if;
  perform setseed(0.42);

  for d in reverse p_days..1 loop
    v_day := (now() at time zone v_tz)::date - d;
    v_cashier := v_cashiers[1 + (d % cardinality(v_cashiers))];
    insert into public.cash_sessions (restaurant_id, operator_id, status, opening_amount, opened_at, is_demo)
    values (r, v_cashier, 'closed', 200, (v_day + time '11:00') at time zone v_tz, true) returning id into v_session;
    insert into public.cash_movements (restaurant_id, cash_session_id, type, amount, reason, created_by, created_at)
    values (r, v_session, 'opening', 200, 'Fundo de troco', v_cashier, (v_day + time '11:00') at time zone v_tz);

    n_tabs := 10 + floor(random() * 14)::int + case when extract(isodow from v_day) in (5, 6, 7) then 10 else 0 end;
    for k in 1..n_tabs loop
      select * into v_table from public.dining_tables where restaurant_id = r order by random() limit 1;
      v_open := (v_day + time '11:30') at time zone v_tz + (random() * interval '10 hours');
      v_waiter := v_waiters[1 + floor(random() * cardinality(v_waiters))::int];
      v_cook := v_cooks[1 + floor(random() * cardinality(v_cooks))::int];
      -- Inserida já como encerrada (histórico) para não conflitar com comandas ativas
      insert into public.tabs (restaurant_id, table_id, number, status, customer_count, opened_by, opened_at,
                               service_fee_pct, service_fee_enabled, is_demo, closed_at, closed_by, closing_requested_at)
      values (r, v_table.id, public._next_counter(r, 'tab'), 'closed', 1 + floor(random() * 5)::int,
              case when random() < 0.5 then v_waiter else null end, v_open, 10, random() < 0.9, true,
              v_open + interval '85 minutes', v_cashier, v_open + interval '75 minutes')
      returning * into v_tab;
      v_tabs_count := v_tabs_count + 1;

      for j in 1..(1 + floor(random() * 3)::int) loop
        v_t := v_open + (j - 1) * interval '25 minutes' + random() * interval '5 minutes';
        insert into public.orders (restaurant_id, tab_id, table_id, number, source, created_by, status, idempotency_key,
                                   created_at, started_at, started_by, ready_at, ready_by, delivered_at, delivered_by, is_demo)
        values (r, v_tab.id, v_table.id, public._next_counter(r, 'order'),
                case when random() < 0.6 then 'customer' else 'waiter' end::public.order_source,
                null, 'delivered', 'demo-' || gen_random_uuid(), v_t, v_t + interval '2 minutes', v_cook,
                v_t + interval '12 minutes' + random() * interval '15 minutes', v_cook,
                v_t + interval '30 minutes', v_waiter, true)
        returning * into v_order;
        if v_order.source = 'waiter' then update public.orders set created_by = v_waiter where id = v_order.id; end if;
        v_sub := 0;
        for m in 1..(1 + floor(random() * 4)::int) loop
          select id, name, price, featured into v_prod from public.products
           where restaurant_id = r and deleted_at is null
           order by random() * (case when featured then 2.5 else 1 end) desc limit 1;
          v_qty := 1 + floor(random() * 2)::int;
          insert into public.order_items (restaurant_id, order_id, product_id, product_name, unit_price, quantity, line_total)
          values (r, v_order.id, v_prod.id, v_prod.name, v_prod.price, v_qty, v_prod.price * v_qty);
          v_sub := v_sub + v_prod.price * v_qty;
        end loop;
        update public.orders set subtotal = v_sub where id = v_order.id;
        v_orders_count := v_orders_count + 1;
      end loop;

      -- Ocasionalmente um pedido cancelado
      if random() < 0.04 then
        update public.orders set status = 'cancelled', cancelled_at = created_at + interval '3 minutes',
               cancel_reason = 'Cliente desistiu (demonstração)', delivered_at = null, delivered_by = null
         where id = v_order.id;
      end if;

      select * into v_tot from public.tab_totals(v_tab.id);
      v_split := case when random() < 0.25 then 2 else 1 end;
      v_amount := v_tot.balance;
      for m in 1..v_split loop
        v_part := case when m = v_split then v_amount else round(v_tot.balance / v_split, 2) end;
        v_amount := v_amount - v_part;
        exit when v_part <= 0;
        v_method := (array['pix', 'pix', 'credit', 'credit', 'debit', 'cash'])[1 + floor(random() * 6)::int]::public.payment_method;
        insert into public.payments (restaurant_id, tab_id, cash_session_id, method, amount, received_amount, change_amount,
                                     idempotency_key, created_by, created_at, payer_label, is_demo)
        values (r, v_tab.id, v_session, v_method, v_part,
                case when v_method = 'cash' then ceil(v_part / 10) * 10 else v_part end,
                case when v_method = 'cash' then ceil(v_part / 10) * 10 - v_part else 0 end,
                'demo-' || gen_random_uuid(), v_cashier, v_open + interval '80 minutes',
                case when v_split > 1 then 'Pessoa ' || m else null end, true);
        insert into public.cash_movements (restaurant_id, cash_session_id, type, method, amount, created_by, created_at, reason)
        values (r, v_session, 'sale', v_method, v_part, v_cashier, v_open + interval '80 minutes', 'Comanda #' || v_tab.number);
      end loop;
    end loop;

    -- Sangria e fechamento do caixa com pequena divergência ocasional
    insert into public.cash_movements (restaurant_id, cash_session_id, type, amount, reason, created_by, created_at)
    values (r, v_session, 'withdrawal', -100, 'Sangria para cofre (demonstração)', v_cashier, (v_day + time '18:00') at time zone v_tz);
    update public.cash_sessions cs set
      closed_at = (v_day + time '23:30') at time zone v_tz,
      expected_cash = x.expected,
      counted_cash = x.expected + case when random() < 0.2 then -round((random() * 15)::numeric, 2) else 0 end,
      closing_notes = 'Fechamento de demonstração'
    from (select coalesce(sum(amount), 0) expected from public.cash_movements where cash_session_id = v_session and method = 'cash') x
    where cs.id = v_session;
    update public.cash_sessions set difference = counted_cash - expected_cash where id = v_session;
  end loop;

  return jsonb_build_object('tabs', v_tabs_count, 'orders', v_orders_count);
end;
$$;

-- Pedidos "ao vivo" para demonstrar cozinha/garçom/caixa (mesas 2, 3, 8 e 11; Mesa 05 fica livre)
create or replace function public.demo_generate_live_orders()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  r uuid := '00000000-0000-4000-a000-000000000001';
  v_waiter uuid; v_cook uuid; v_table public.dining_tables; v_tab public.tabs; v_order public.orders;
  v_spec record; v_items jsonb; n int := 0;
begin
  select id into v_waiter from public.profiles where restaurant_id = r and role = 'waiter' order by full_name limit 1;
  select id into v_cook from public.profiles where restaurant_id = r and role = 'kitchen' order by full_name limit 1;
  if v_waiter is null then raise exception 'Crie os funcionários antes'; end if;

  for v_spec in select * from (values
      (2, 'ready', array['Pizza Margherita Individual', 'Suco Natural 400ml'], 35),
      (3, 'preparing', array['Picanha na Chapa', 'Batata Frita', 'Cerveja Long Neck 355ml'], 14),
      (8, 'received', array['Hambúrguer Artesanal Clássico', 'Refrigerante Lata 350ml'], 3),
      (11, 'received', array['Risoto de Cogumelos', 'Caipirinha de Limão', 'Petit Gâteau'], 1),
      (11, 'delivered', array['Bolinho de Bacalhau'], 40)
    ) s(mesa, st, prods, mins_ago)
  loop
    select * into v_table from public.dining_tables where restaurant_id = r and number = v_spec.mesa;
    v_tab := public._get_or_open_tab(v_table, v_waiter, 2);
    update public.tabs set is_demo = true where id = v_tab.id;
    select jsonb_agg(jsonb_build_object('product_id', p.id, 'quantity', 1, 'modifiers',
             coalesce((select jsonb_agg(o.id) from public.modifier_groups g
                        join lateral (select id from public.modifier_options where group_id = g.id order by sort_order limit 1) o on true
                       where g.product_id = p.id and g.min_select > 0), '[]'::jsonb)))
      into v_items from public.products p where p.restaurant_id = r and p.name = any (v_spec.prods);
    v_order := public._place_order(v_tab.id, v_items, null, 'waiter', v_waiter, null, 'demo-live-' || gen_random_uuid(), false);
    update public.orders set
      is_demo = true,
      created_at = now() - make_interval(mins => v_spec.mins_ago),
      status = v_spec.st::public.order_status,
      started_at = case when v_spec.st <> 'received' then now() - make_interval(mins => v_spec.mins_ago - 2) end,
      started_by = case when v_spec.st <> 'received' then v_cook end,
      ready_at = case when v_spec.st in ('ready', 'delivered') then now() - make_interval(mins => 5) end,
      ready_by = case when v_spec.st in ('ready', 'delivered') then v_cook end,
      delivered_at = case when v_spec.st = 'delivered' then now() - make_interval(mins => 2) end,
      delivered_by = case when v_spec.st = 'delivered' then v_waiter end
    where id = v_order.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('orders', n);
end;
$$;

revoke execute on function public.demo_generate_history(int), public.demo_generate_live_orders() from public, anon, authenticated;
grant execute on function public.demo_generate_history(int), public.demo_generate_live_orders() to service_role;

-- Define PIN de supervisor durante o seed (somente service_role)
create or replace function public.demo_set_pin(p_user_id uuid, p_pin text)
returns void language sql security definer set search_path = public, extensions as $$
  update public.profiles set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)) where id = p_user_id;
$$;
revoke execute on function public.demo_set_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.demo_set_pin(uuid, text) to service_role;
