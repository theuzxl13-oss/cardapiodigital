-- =============================================================================
-- 007 - REALTIME e STORAGE
-- =============================================================================

-- Tabelas transmitidas pelo Supabase Realtime (respeitando RLS de cada usuário)
alter publication supabase_realtime add table
  public.orders, public.order_items, public.tabs, public.service_requests,
  public.payments, public.products, public.dining_tables, public.ingredients;

-- Bucket público para fotos de pratos, modelos 3D (GLB/USDZ) e logo
insert into storage.buckets (id, name, public)
values ('menu-media', 'menu-media', true)
on conflict (id) do nothing;

create policy "menu media public read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'menu-media');
create policy "menu media managers insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-media' and public.has_role(array['admin', 'manager']::public.app_role[]));
create policy "menu media managers update" on storage.objects for update to authenticated
  using (bucket_id = 'menu-media' and public.has_role(array['admin', 'manager']::public.app_role[]));
create policy "menu media managers delete" on storage.objects for delete to authenticated
  using (bucket_id = 'menu-media' and public.has_role(array['admin', 'manager']::public.app_role[]));
