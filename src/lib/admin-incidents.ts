import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { IncidentRow } from "@/components/admin/types";

/** RLS enforces administrator access. Fetch every page so totals and alerts are not truncated. */
export const adminIncidentsOptions = queryOptions({
  queryKey: ["admin-incidents"],
  queryFn: async ({ signal }): Promise<IncidentRow[]> => {
    const rows: IncidentRow[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("incidents")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + pageSize - 1)
        .abortSignal(signal);
      if (error) throw error;
      rows.push(...data);
      if (data.length < pageSize) return rows;
    }
  },
});