import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/** Batch-signs private incident photo paths (valid 5 min, refreshed before they expire). */
export function useSignedUrls(paths: (string | null | undefined)[]) {
  const unique = Array.from(new Set(paths.filter((p): p is string => !!p))).sort();
  return useQuery({
    queryKey: ["signed-urls", unique],
    enabled: unique.length > 0,
    staleTime: 4 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.storage.from("incident-photos").createSignedUrls(unique, 300);
      const map: Record<string, string> = {};
      for (const item of data ?? []) if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
      return map;
    },
  });
}
