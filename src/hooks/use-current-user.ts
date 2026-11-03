import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type CurrentUser = {
  id: string;
  email: string | null;
  name: string;
  roles: string[];
  isStaff: boolean;
  isAdmin: boolean;
};

export const currentUserQuery = {
  queryKey: ["current-user"],
  queryFn: async (): Promise<CurrentUser | null> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    const roleList = (roles ?? []).map((r) => r.role as string);
    const meta = user.user_metadata as { full_name?: string; name?: string };
    return {
      id: user.id,
      email: user.email ?? profile?.email ?? null,
      name: profile?.full_name || meta?.full_name || meta?.name || user.email?.split("@")[0] || "Colaborador",
      roles: roleList,
      isStaff: roleList.includes("admin"),
      isAdmin: roleList.includes("admin"),
    };
  },
  staleTime: 60_000,
};

export function useCurrentUser() {
  return useQuery(currentUserQuery);
}
