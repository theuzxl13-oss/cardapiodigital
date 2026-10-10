"use client";

import { useEffect, useState } from "react";
import { KitchenBoard } from "@/components/kitchen/kitchen-board";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { RESTAURANT_ID } from "@/lib/config";

export default function KitchenPage() {
  const [cfg, setCfg] = useState<{ kitchen_sound_enabled: boolean; kitchen_late_minutes: number } | null>(null);
  useEffect(() => {
    getBrowserSupabase().from("restaurants").select("kitchen_sound_enabled, kitchen_late_minutes").eq("id", RESTAURANT_ID).single()
      .then(({ data }: { data: typeof cfg }) => setCfg(data ?? { kitchen_sound_enabled: true, kitchen_late_minutes: 20 }));
  }, []);
  if (!cfg) return null;
  return <KitchenBoard soundDefault={cfg.kitchen_sound_enabled} lateMinutes={cfg.kitchen_late_minutes} />;
}
