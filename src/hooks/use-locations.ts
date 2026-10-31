import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type CampusLocation = { id: string; block: string; room: string | null; active: boolean };

export const locationsQueryKey = ["locations"] as const;

/** Campus locations registered by the team in the dashboard (public read of active ones). */
export function useLocations() {
  const query = useQuery({
    queryKey: locationsQueryKey,
    queryFn: async (): Promise<CampusLocation[]> => {
      const { data, error } = await supabase.from("locations").select("id, block, room, active").order("block").order("room");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
  const all = query.data ?? [];
  const active = all.filter((l) => l.active);
  const blocks = Array.from(new Set(active.map((l) => l.block))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const roomsOf = (block: string) =>
    active
      .filter((l) => l.block === block && l.room)
      .map((l) => l.room as string)
      .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  return { ...query, all, blocks, roomsOf };
}
