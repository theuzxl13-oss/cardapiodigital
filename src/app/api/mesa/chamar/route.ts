import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, callCustomerRpc, json } from "@/lib/table-session";

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const parsed = z
    .object({ type: z.enum(["call_waiter", "request_bill"]), note: z.string().max(200).nullish() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  return json(await callCustomerRpc("customer_request_service", { p_type: parsed.data.type, p_note: parsed.data.note ?? null }));
}
