import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/notifications/cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        try {
          const { enqueueOverdueIncidentAlerts, processNotificationOutbox } =
            await import("@/lib/notifications/worker.server");
          const overdueQueued = await enqueueOverdueIncidentAlerts();
          const delivery = await processNotificationOutbox();
          return Response.json({ overdueQueued, ...delivery });
        } catch (error) {
          console.error("[notifications] cron run failed", error);
          return Response.json({ error: "Notification job failed." }, { status: 500 });
        }
      },
    },
  },
});
