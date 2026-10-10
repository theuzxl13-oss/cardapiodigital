import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, callCustomerRpc, json } from "@/lib/table-session";

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const parsed = z.object({ order_id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  return json(await callCustomerRpc("customer_cancel_order", { p_order_id: parsed.data.order_id }));
}
