"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { Cuboid, ImageUp, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Skeleton, Spinner, Table, Td, Th } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArViewer } from "@/components/menu/ar-viewer";
import { useLiveQuery } from "@/hooks/use-live-query";
import { check, sb } from "@/lib/api";
import { RESTAURANT_ID } from "@/lib/config";
import { money, parseMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Category, Ingredient, ModifierGroup, Product } from "@/lib/types";
import { asset } from "@/lib/asset";

async function loadAdminMenu() {
  const [categories, products, ingredients] = await Promise.all([
    sb().from("categories").select("*").order("sort_order"),
    sb().from("products").select("*, modifier_groups(*, modifier_options(*))").is("deleted_at", null).order("sort_order"),
    sb().from("ingredients").select("*").eq("active", true).order("name"),
  ]);
  return { categories: check(categories) as Category[], products: check(products) as Product[], ingredients: check(ingredients) as Ingredient[] };
}

/** Envia arquivo ao Supabase Storage (bucket público menu-media) e retorna a URL pública. */
export async function uploadMedia(file: File, folder: string) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const contentType = ext === "glb" ? "model/gltf-binary" : ext === "usdz" ? "model/vnd.usdz+zip" : file.type;
  const { error } = await sb().storage.from("menu-media").upload(path, file, { contentType, upsert: false });
  if (error) throw new Error(error.message);
  return sb().storage.from("menu-media").getPublicUrl(path).data.publicUrl;
}

export function ProductsAdmin() {
  const { data, reload } = useLiveQuery("admin-products", loadAdminMenu, ["products", "categories"]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [catDialog, setCatDialog] = useState<Category | "new" | null>(null);

  const list = useMemo(() => {
    const order = new Map((data?.categories ?? []).map((c) => [c.id, c.sort_order]));
    return (data?.products ?? [])
      .filter((p) => (cat === "all" || p.category_id === cat) && p.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (order.get(a.category_id) ?? 0) - (order.get(b.category_id) ?? 0) || a.sort_order - b.sort_order);
  }, [data, q, cat]);

  if (!data) return <div className="p-8"><Skeleton className="h-96" /></div>;

  async function quickToggle(p: Product, field: "available" | "featured" | "active", value: boolean) {
    const { error } = await sb().from("products").update({ [field]: value }).eq("id", p.id);
    if (error) toast.error(error.message); else reload();
  }

  async function softDelete(p: Product) {
    if (!confirm(`Excluir "${p.name}" do cardápio? O histórico de pedidos é preservado.`)) return;
    const { error } = await sb().from("products").update({ deleted_at: new Date().toISOString(), active: false }).eq("id", p.id);
    if (error) toast.error(error.message); else { toast.success("Produto excluído (exclusão lógica)"); reload(); }
  }

  return (
    <main className="space-y-5 p-5 md:p-8">
      <Tabs defaultValue="produtos">
        <TabsList>
          <TabsTrigger value="produtos">Produtos ({data.products.length})</TabsTrigger>
          <TabsTrigger value="categorias">Categorias ({data.categories.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="produtos" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-60 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar produto" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select className="w-52" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">Todas as categorias</option>
              {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Button onClick={() => setEditing("new")}><Plus /> Novo produto</Button>
          </div>
          <Card>
            <Table>
              <thead><tr><Th>Produto</Th><Th>Categoria</Th><Th className="text-right">Preço</Th><Th>Disponível</Th><Th>Destaque</Th><Th>Ativo</Th><Th>3D</Th><Th /></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {p.image_url && <Image src={asset(p.image_url)} alt="" fill sizes="44px" className="object-cover" unoptimized={p.image_url.startsWith("http")} />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{(p.modifier_groups ?? []).length} grupos de adicionais</p>
                        </div>
                      </div>
                    </Td>
                    <Td>{data.categories.find((c) => c.id === p.category_id)?.name}</Td>
                    <Td className="tabular text-right font-medium">{money(p.price)}</Td>
                    <Td><Switch checked={p.available} onCheckedChange={(v) => quickToggle(p, "available", v)} /></Td>
                    <Td><Switch checked={p.featured} onCheckedChange={(v) => quickToggle(p, "featured", v)} /></Td>
                    <Td><Switch checked={p.active} onCheckedChange={(v) => quickToggle(p, "active", v)} /></Td>
                    <Td>{p.model_glb_url ? <Badge variant="info"><Cuboid className="size-3" /> AR</Badge> : <span className="text-xs text-muted-foreground">—</span>}</Td>
                    <Td className="whitespace-nowrap text-right">
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditing(p)} aria-label="Editar"><Pencil /></Button>
                      <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => softDelete(p)} aria-label="Excluir"><Trash2 /></Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="categorias">
          <Card>
            <CardContent className="p-0">
              <Table>
                <thead><tr><Th>Ordem</Th><Th>Nome</Th><Th>Produtos</Th><Th>Ativa</Th><Th className="text-right"><Button size="sm" onClick={() => setCatDialog("new")}><Plus /> Nova</Button></Th></tr></thead>
                <tbody>
                  {data.categories.map((c) => (
                    <tr key={c.id}>
                      <Td>{c.sort_order}</Td>
                      <Td className="font-medium">{c.name}</Td>
                      <Td>{data.products.filter((p) => p.category_id === c.id).length}</Td>
                      <Td><Switch checked={c.active} onCheckedChange={async (v) => { const { error } = await sb().from("categories").update({ active: v }).eq("id", c.id); if (error) toast.error(error.message); else reload(); }} /></Td>
                      <Td className="text-right"><Button size="icon-sm" variant="ghost" onClick={() => setCatDialog(c)}><Pencil /></Button></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {editing && <ProductEditor product={editing === "new" ? null : editing} categories={data.categories} ingredients={data.ingredients}
        onClose={() => setEditing(null)} onSaved={reload} />}
      {catDialog && <CategoryDialog category={catDialog === "new" ? null : catDialog} onClose={() => setCatDialog(null)} onSaved={reload} nextOrder={data.categories.length + 1} />}
    </main>
  );
}

function CategoryDialog({ category, onClose, onSaved, nextOrder }: { category: Category | null; onClose: () => void; onSaved: () => void; nextOrder: number }) {
  const [name, setName] = useState(category?.name ?? "");
  const [order, setOrder] = useState(String(category?.sort_order ?? nextOrder));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const slug = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
          const payload = { name, slug, sort_order: Number(order) || 0 };
          const { error } = category
            ? await sb().from("categories").update(payload).eq("id", category.id)
            : await sb().from("categories").insert({ ...payload, restaurant_id: RESTAURANT_ID });
          if (error) return toast.error(error.message);
          toast.success("Categoria salva"); onSaved(); onClose();
        }}>
          <DialogHeader><DialogTitle>{category ? "Editar categoria" : "Nova categoria"}</DialogTitle></DialogHeader>
          <Field label="Nome"><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Ordem de exibição"><Input type="number" value={order} onChange={(e) => setOrder(e.target.value)} /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProductEditor({ product, categories, ingredients, onClose, onSaved }: {
  product: Product | null; categories: Category[]; ingredients: Ingredient[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: product?.name ?? "", description: product?.description ?? "", price: product ? String(product.price).replace(".", ",") : "",
    category_id: product?.category_id ?? categories[0]?.id ?? "", image_url: product?.image_url ?? "", ingredients: product?.ingredients ?? "",
    allergens: (product?.allergens ?? []).join(", "), tags: (product?.tags ?? []).join(", "), prep_minutes: String(product?.prep_minutes ?? ""),
    available: product?.available ?? true, featured: product?.featured ?? false, sort_order: String(product?.sort_order ?? 0),
    model_glb_url: product?.model_glb_url ?? "", model_usdz_url: product?.model_usdz_url ?? "",
    model_is_illustrative: product?.model_is_illustrative ?? true, model_credit: product?.model_credit ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [productId, setProductId] = useState(product?.id ?? null);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function upload(field: "image_url" | "model_glb_url" | "model_usdz_url", file?: File) {
    if (!file) return;
    const max = field === "image_url" ? 5 : 25;
    if (file.size > max * 1024 * 1024) return toast.error(`Arquivo maior que ${max} MB`);
    setUploading(field);
    try {
      const url = await uploadMedia(file, field === "image_url" ? "images" : "models");
      set(field, url);
      toast.success("Arquivo enviado. Salve o produto para aplicar.");
    } catch (e) {
      toast.error(`Falha no upload: ${(e as Error).message}`);
    } finally {
      setUploading(null);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const price = parseMoney(form.price);
    if (Number.isNaN(price) || price < 0) return toast.error("Preço inválido");
    setSaving(true);
    const payload = {
      name: form.name.trim(), description: form.description.trim() || null, price, category_id: form.category_id,
      image_url: form.image_url || null, ingredients: form.ingredients.trim() || null,
      allergens: form.allergens.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
      tags: form.tags.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
      prep_minutes: form.prep_minutes ? Number(form.prep_minutes) : null, available: form.available, featured: form.featured,
      sort_order: Number(form.sort_order) || 0, model_glb_url: form.model_glb_url || null, model_usdz_url: form.model_usdz_url || null,
      model_is_illustrative: form.model_is_illustrative, model_credit: form.model_credit.trim() || null,
    };
    const res = productId
      ? await sb().from("products").update(payload).eq("id", productId).select("id").single()
      : await sb().from("products").insert({ ...payload, restaurant_id: RESTAURANT_ID }).select("id").single();
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(productId ? "Produto atualizado (pedidos anteriores mantêm o preço original)" : "Produto criado. Configure adicionais e ficha técnica.");
    setProductId(res.data.id);
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{productId ? `Editar: ${form.name}` : "Novo produto"}</DialogTitle>
          <DialogDescription>Alterações de preço valem apenas para novos pedidos.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="dados">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="ar">Imagem e 3D/AR</TabsTrigger>
            <TabsTrigger value="adicionais" disabled={!productId}>Adicionais</TabsTrigger>
            <TabsTrigger value="ficha" disabled={!productId}>Ficha técnica</TabsTrigger>
          </TabsList>
          <form onSubmit={save}>
            <TabsContent value="dados" className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome" className="sm:col-span-2"><Input required minLength={2} value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
              <Field label="Descrição" className="sm:col-span-2"><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
              <Field label="Preço (R$)"><Input required inputMode="decimal" value={form.price} onChange={(e) => set("price", e.target.value)} /></Field>
              <Field label="Categoria">
                <Select value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Ingredientes" className="sm:col-span-2"><Input value={form.ingredients} onChange={(e) => set("ingredients", e.target.value)} /></Field>
              <Field label="Alergênicos (separados por vírgula)"><Input value={form.allergens} onChange={(e) => set("allergens", e.target.value)} placeholder="glúten, lactose" /></Field>
              <Field label="Etiquetas"><Input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="vegetariano, mais pedido" /></Field>
              <Field label="Tempo de preparo (min)"><Input type="number" min={0} value={form.prep_minutes} onChange={(e) => set("prep_minutes", e.target.value)} /></Field>
              <Field label="Ordem"><Input type="number" value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} /></Field>
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.available} onCheckedChange={(v) => set("available", v)} /> Disponível</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.featured} onCheckedChange={(v) => set("featured", v)} /> Destaque</label>
            </TabsContent>

            <TabsContent value="ar" className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <Field label="Foto do prato (URL ou upload)"><Input value={form.image_url} onChange={(e) => set("image_url", e.target.value)} /></Field>
                <UploadButton label="Enviar foto (JPG/PNG/WebP)" accept="image/*" busy={uploading === "image_url"} onFile={(f) => upload("image_url", f)} icon={<ImageUp />} />
                <Field label="Modelo 3D GLB/GLTF (Android, WebXR, 3D)" hint="Modelado em metros (escala real)."><Input value={form.model_glb_url} onChange={(e) => set("model_glb_url", e.target.value)} /></Field>
                <UploadButton label="Enviar .glb" accept=".glb,model/gltf-binary" busy={uploading === "model_glb_url"} onFile={(f) => upload("model_glb_url", f)} icon={<Upload />} />
                <Field label="Modelo USDZ (iPhone / AR Quick Look)" hint="Opcional: sem USDZ o visualizador gera um a partir do GLB."><Input value={form.model_usdz_url} onChange={(e) => set("model_usdz_url", e.target.value)} /></Field>
                <UploadButton label="Enviar .usdz" accept=".usdz" busy={uploading === "model_usdz_url"} onFile={(f) => upload("model_usdz_url", f)} icon={<Upload />} />
                <label className="flex items-center gap-2 text-sm"><Switch checked={form.model_is_illustrative} onCheckedChange={(v) => set("model_is_illustrative", v)} /> Modelo ilustrativo (exibe aviso ao cliente)</label>
                <Field label="Créditos / licença do modelo"><Input value={form.model_credit} onChange={(e) => set("model_credit", e.target.value)} /></Field>
              </div>
              <div className="space-y-3">
                {form.image_url && (
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
                    <Image src={asset(form.image_url)} alt="" fill className="object-cover" unoptimized={form.image_url.startsWith("http")} />
                  </div>
                )}
                {form.model_glb_url ? <ArViewer key={form.model_glb_url} glb={form.model_glb_url} usdz={form.model_usdz_url || null} alt="Pré-visualização" illustrative={form.model_is_illustrative} />
                  : <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Sem modelo 3D: o botão “Visualizar na minha mesa” não aparece para este produto.</p>}
              </div>
            </TabsContent>

            <TabsContent value="adicionais">{productId && <ModifiersEditor productId={productId} />}</TabsContent>
            <TabsContent value="ficha">{productId && <RecipeEditor productId={productId} ingredients={ingredients} />}</TabsContent>

            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
              <Button type="submit" disabled={saving}>{saving && <Spinner />} Salvar dados</Button>
            </DialogFooter>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function UploadButton({ label, accept, busy, onFile, icon }: { label: string; accept: string; busy: boolean; onFile: (f?: File) => void; icon: React.ReactNode }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted", busy && "pointer-events-none opacity-60")}>
      {busy ? <Spinner /> : icon} {label}
      <input type="file" accept={accept} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
    </label>
  );
}

function ModifiersEditor({ productId }: { productId: string }) {
  const fetchGroups = useCallback(async () =>
    check(await sb().from("modifier_groups").select("*, modifier_options(*)").eq("product_id", productId).order("sort_order")) as ModifierGroup[],
  [productId]);
  const { data: groups, reload: load } = useLiveQuery(`modifiers:${productId}`, fetchGroups, [], { intervalMs: 60000 });

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p;
    if (error) toast.error(error.message); else load();
  }

  if (!groups) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.id} className="rounded-xl border p-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_90px_90px_auto]">
            <Input defaultValue={g.name} onBlur={(e) => e.target.value !== g.name && run(sb().from("modifier_groups").update({ name: e.target.value }).eq("id", g.id))} />
            <Input type="number" min={0} title="Mínimo" defaultValue={g.min_select} onBlur={(e) => run(sb().from("modifier_groups").update({ min_select: Number(e.target.value) }).eq("id", g.id))} />
            <Input type="number" min={1} title="Máximo" defaultValue={g.max_select} onBlur={(e) => run(sb().from("modifier_groups").update({ max_select: Number(e.target.value) }).eq("id", g.id))} />
            <Button type="button" variant="ghost" className="text-destructive" onClick={() => confirm("Excluir grupo?") && run(sb().from("modifier_groups").delete().eq("id", g.id))}><Trash2 /></Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Mín. 1 = escolha obrigatória. Máx. = quantidade de opções permitidas.</p>
          <div className="mt-3 space-y-2">
            {[...g.modifier_options].sort((a, b) => a.sort_order - b.sort_order).map((o) => (
              <div key={o.id} className="grid grid-cols-[1fr_110px_auto_auto] items-center gap-2">
                <Input defaultValue={o.name} onBlur={(e) => e.target.value !== o.name && run(sb().from("modifier_options").update({ name: e.target.value }).eq("id", o.id))} />
                <Input inputMode="decimal" defaultValue={String(o.price_delta).replace(".", ",")} title="Acréscimo (R$)"
                  onBlur={(e) => { const v = parseMoney(e.target.value || "0"); if (!Number.isNaN(v)) run(sb().from("modifier_options").update({ price_delta: v }).eq("id", o.id)); }} />
                <Switch checked={o.active} onCheckedChange={(v) => run(sb().from("modifier_options").update({ active: v }).eq("id", o.id))} />
                <Button type="button" size="icon-sm" variant="ghost" onClick={() => run(sb().from("modifier_options").delete().eq("id", o.id))}><Trash2 /></Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => run(sb().from("modifier_options").insert({ group_id: g.id, restaurant_id: RESTAURANT_ID, name: "Nova opção", price_delta: 0, sort_order: g.modifier_options.length + 1 }))}><Plus /> Opção</Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => run(sb().from("modifier_groups").insert({ product_id: productId, restaurant_id: RESTAURANT_ID, name: "Novo grupo", min_select: 0, max_select: 1, sort_order: groups.length + 1 }))}><Plus /> Grupo de adicionais</Button>
    </div>
  );
}

function RecipeEditor({ productId, ingredients }: { productId: string; ingredients: Ingredient[] }) {
  const fetchRows = useCallback(async () =>
    check(await sb().from("product_ingredients").select("ingredient_id, quantity").eq("product_id", productId)) as { ingredient_id: string; quantity: number }[],
  [productId]);
  const { data: rows, reload: load } = useLiveQuery(`recipe:${productId}`, fetchRows, [], { intervalMs: 60000 });
  const [newIng, setNewIng] = useState(ingredients[0]?.id ?? "");
  const [newQty, setNewQty] = useState("");
  if (!rows) return <Skeleton className="h-40" />;
  const cost = rows.reduce((s, r) => s + Number(r.quantity) * Number(ingredients.find((i) => i.id === r.ingredient_id)?.cost_per_unit ?? 0), 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Cada venda baixa automaticamente estes insumos do estoque; cancelamentos devolvem.</p>
      <Table>
        <thead><tr><Th>Insumo</Th><Th className="text-right">Quantidade</Th><Th className="text-right">Custo</Th><Th /></tr></thead>
        <tbody>
          {rows.map((r) => {
            const ing = ingredients.find((i) => i.id === r.ingredient_id);
            return (
              <tr key={r.ingredient_id}>
                <Td>{ing?.name}</Td>
                <Td className="tabular text-right">{Number(r.quantity)} {ing?.unit}</Td>
                <Td className="tabular text-right">{money(Number(r.quantity) * Number(ing?.cost_per_unit ?? 0))}</Td>
                <Td className="text-right"><Button type="button" size="icon-sm" variant="ghost" onClick={async () => {
                  const { error } = await sb().from("product_ingredients").delete().eq("product_id", productId).eq("ingredient_id", r.ingredient_id);
                  if (error) toast.error(error.message); else load();
                }}><Trash2 /></Button></Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <p className="text-right text-sm">Custo estimado por porção: <b className="tabular">{money(cost)}</b></p>
      <div className="flex gap-2">
        <Select value={newIng} onChange={(e) => setNewIng(e.target.value)}>{ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</Select>
        <Input className="w-32" inputMode="decimal" placeholder="Qtd." value={newQty} onChange={(e) => setNewQty(e.target.value)} />
        <Button type="button" onClick={async () => {
          const qty = parseMoney(newQty);
          if (!newIng || Number.isNaN(qty) || qty <= 0) return toast.error("Informe insumo e quantidade");
          const { error } = await sb().from("product_ingredients").upsert({ product_id: productId, ingredient_id: newIng, restaurant_id: RESTAURANT_ID, quantity: qty });
          if (error) toast.error(error.message); else { setNewQty(""); load(); }
        }}><Plus /> Adicionar</Button>
      </div>
    </div>
  );
}
