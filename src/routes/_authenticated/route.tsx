import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    return { userId: user.id };
  },
  component: () => <Outlet />,
});
