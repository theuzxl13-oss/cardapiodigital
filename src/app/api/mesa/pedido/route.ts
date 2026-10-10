import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, callCustomerRpc, json } from "@/lib/table-session";

const schema = z.object({
  idempotency_key: z.string().min(8).max(100),
  notes: z.string().max(300).nullish(),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(50),
        modifiers: z.array(z.string().uuid()).max(20).default([]),
        notes: z.string().max(200).nullish(),
      }),
    )
    .min(1)
    .max(40),
});

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  const { items, notes, idempotency_key } = parsed.data;
  // Preços NÃO são enviados: o banco calcula a partir do cardápio vigente.
  return json(
    await callCustomerRpc("customer_place_order", {
      p_items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, modifiers: i.modifiers, notes: i.notes ?? null })),
      p_notes: notes ?? null,
      p_idempotency_key: idempotency_key,
    }),
  );
}
