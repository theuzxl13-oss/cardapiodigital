import { callCustomerRpc, json } from "@/lib/table-session";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(await callCustomerRpc("customer_get_state", {}));
}
