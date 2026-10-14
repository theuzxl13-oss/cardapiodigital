-- =============================================================================
-- Extras SOMENTE da versão de demonstração estática (GitHub Pages).
-- Executado no PostgreSQL do navegador (PGlite) após migrações e seed.
-- =============================================================================
alter table auth.users add column if not exists demo_password text;

insert into auth.users (id, email, raw_app_meta_data, demo_password) values
('a0000000-0000-4000-8000-000000000001', 'admin@saborarte.demo',    '{"role":"admin","restaurant_id":"00000000-0000-4000-a000-000000000001","full_name":"Ana Administradora"}', 'Demo@1234'),
('a0000000-0000-4000-8000-000000000002', 'caixa1@saborarte.demo',   '{"role":"cashier","restaurant_id":"00000000-0000-4000-a000-000000000001","full_name":"Carlos Caixa"}', 'Demo@1234'),
('a0000000-0000-4000-8000-000000000003', 'caixa2@saborarte.demo',   '{"role":"cashier","restaurant_id":"00000000-0000-4000-a000-000000000001","full_name":"Camila Caixa"}', 'Demo@1234'),
('a0000000-0000-4000-8000-000000000004', 'cozinha1@saborarte.demo', '{"role":"kitchen","restaurant_id":"00000000-0000-4000-a000-000000000001","full_name":"Chef Roberto"}', 'Demo@1234'),
('a0000000-0000-4000-8000-000000000005', 'cozinha2@saborarte.demo', '{"role":"kitchen","restaurant_id":"00000000-0000-4000-a000-000000000001","full_name":"Júlia Cozinha"}', 'Demo@1234'),
('a0000000-0000-4000-8000-000000000006', 'garcom1@saborarte.demo',  '{"role":"waiter","restaurant_id":"00000000-0000-4000-a000-000000000001","full_name":"Gabriel Garçom"}', 'Demo@1234'),
('a0000000-0000-4000-8000-000000000007', 'garcom2@saborarte.demo',  '{"role":"waiter","restaurant_id":"00000000-0000-4000-a000-000000000001","full_name":"Mariana Garçonete"}', 'Demo@1234'),
('a0000000-0000-4000-8000-000000000008', 'garcom3@saborarte.demo',  '{"role":"waiter","restaurant_id":"00000000-0000-4000-a000-000000000001","full_name":"Pedro Garçom"}', 'Demo@1234'),
('a0000000-0000-4000-8000-000000000009', 'garcom4@saborarte.demo',  '{"role":"waiter","restaurant_id":"00000000-0000-4000-a000-000000000001","full_name":"Larissa Garçonete"}', 'Demo@1234'),
('a0000000-0000-4000-8000-000000000010', 'garcom5@saborarte.demo',  '{"role":"waiter","restaurant_id":"00000000-0000-4000-a000-000000000001","full_name":"Thiago Garçom"}', 'Demo@1234')
on conflict (id) do nothing;

-- Demonstração: tokens de QR fixos por mesa, para o link aberto no computador funcionar no celular
-- (cada aparelho tem seu próprio banco no navegador). No sistema real os tokens são aleatórios.
update public.dining_tables set qr_token = md5('cardapio-demo-mesa-' || number);

select public.demo_set_pin('a0000000-0000-4000-8000-000000000001', '1234');
select public.demo_generate_history(21);
select public.demo_generate_live_orders();

create table if not exists public.demo_meta (version text primary key, created_at timestamptz default now());
