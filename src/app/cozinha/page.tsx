import { KitchenBoard } from "@/components/kitchen/kitchen-board";
import { getServerSupabase } from "@/lib/supabase/server";
import { RESTAURANT_ID } from "@/lib/config";

export default async function KitchenPage() {
  const supabase = await getServerSupabase();
  const { data } = await supabase.from("restaurants").select("kitchen_sound_enabled, kitchen_late_minutes").eq("id", RESTAURANT_ID).single();
  return <KitchenBoard soundDefault={data?.kitchen_sound_enabled ?? true} lateMinutes={data?.kitchen_late_minutes ?? 20} />;
}
