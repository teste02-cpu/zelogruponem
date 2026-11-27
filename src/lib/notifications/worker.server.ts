import type { Database } from "@/integrations/supabase/types";

import { renderIncidentEmail, sendIncidentEmail } from "./email.server";
import {
  isIncidentOverdue,
  notificationIdempotencyKey,
  overdueHoursFromConfig,
  selectNotificationRecipients,
} from "./logic";

type OutboxItem = Database["public"]["Tables"]["notification_outbox"]["Row"];

export async function processNotificationOutbox(
  batchSize = 25,
): Promise<{ claimed: number; sent: number; failed: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: items, error: claimError } = await supabaseAdmin.rpc("claim_notification_outbox", {
    _limit: batchSize,
  });
  if (claimError) throw new Error("Could not claim notification queue items.");

  const claimed = (items ?? []) as OutboxItem[];
  if (!claimed.length) return { claimed: 0, sent: 0, failed: 0 };
  const incidentIds = [...new Set(claimed.map((item) => item.incident_id))];
  const { data: incidents, error: incidentError } = await supabaseAdmin
    .from("incidents")
    .select("id, title, location, created_at, resolution_note")
    .in("id", incidentIds);
  if (incidentError) throw new Error("Could not load incidents for notification delivery.");
  const incidentById = new Map((incidents ?? []).map((incident) => [incident.id, incident]));

  let sent = 0;
  let failed = 0;
  for (const item of claimed) {
    const incident = incidentById.get(item.incident_id);
    try {
      if (!incident) throw new Error("incident_missing");
      if (item.channel !== "email") throw new Error("whatsapp_provider_not_enabled");
      const message = renderIncidentEmail({
        event: item.event_type,
        id: incident.id,
        idempotencyKey: item.idempotency_key,
        title: incident.title,
        location: incident.location,
        createdAt: incident.created_at,
        resolutionNote: item.event_type === "completed" ? incident.resolution_note : null,
      });
      await sendIncidentEmail({ ...message, to: item.recipient_email });
      const { error } = await supabaseAdmin
        .from("notification_outbox")
        .update({ sent_at: new Date().toISOString(), locked_until: null, last_error: null })
        .eq("id", item.id);
      if (error) throw new Error("outbox_mark_sent_failed");
      sent++;
    } catch (error) {
      failed++;
      const attempt = item.attempt_count + 1;
      const retryMinutes = Math.min(360, 2 ** Math.min(attempt, 9));
      const errorCode =
        error instanceof Error
          ? error.name === "EmailConfigurationError"
            ? "email_not_configured"
            : error.message.slice(0, 160)
          : "notification_delivery_failed";
      const { error: updateError } = await supabaseAdmin
        .from("notification_outbox")
        .update({
          attempt_count: attempt,
          next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
          locked_until: null,
          last_error: errorCode,
        })
        .eq("id", item.id);
      if (updateError)
        console.error("[notifications] failed to release outbox item", item.id, updateError);
      if (error instanceof Error && error.name === "EmailConfigurationError") {
        console.error(
          "[notifications] email provider is not configured; delivery remains queued for retry",
        );
      }
    }
  }
  return { claimed: claimed.length, sent, failed };
}

export async function enqueueOverdueIncidentAlerts(now = new Date()): Promise<number> {
  const overdueHours = overdueHoursFromConfig(process.env["INCIDENT_OVERDUE_HOURS"]);
  const threshold = new Date(now.getTime() - overdueHours * 60 * 60_000).toISOString();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: adminRoles, error: adminError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  if (adminError) throw new Error("Could not load overdue notification recipients.");
  const adminIds = [...new Set((adminRoles ?? []).map((row) => row.user_id))];
  if (!adminIds.length) return 0;
  const { data: admins, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .in("id", adminIds)
    .not("email", "is", null);
  if (profileError) throw new Error("Could not load overdue notification recipients.");
  const recipients = selectNotificationRecipients(
    "overdue",
    (admins ?? []).map((admin) => admin.email ?? ""),
  );
  if (!recipients.length) return 0;

  const pageSize = 500;
  let queued = 0;
  for (let offset = 0; ; offset += pageSize) {
    const { data: incidents, error } = await supabaseAdmin
      .from("incidents")
      .select("id, created_at, status")
      .neq("status", "concluido")
      .lte("created_at", threshold)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error("Could not find overdue incidents.");

    const overdueIncidents = (incidents ?? []).filter((incident) =>
      isIncidentOverdue(incident, now, overdueHours),
    );
    const rows = overdueIncidents.flatMap((incident) =>
      recipients.map((recipient_email) => ({
        incident_id: incident.id,
        event_type: "overdue" as const,
        recipient_email,
        idempotency_key: notificationIdempotencyKey("overdue", incident.id, recipient_email),
      })),
    );
    if (rows.length) {
      const { data, error: enqueueError } = await supabaseAdmin
        .from("notification_outbox")
        .upsert(rows, {
          onConflict: "idempotency_key",
          ignoreDuplicates: true,
        })
        .select("id");
      if (enqueueError) throw new Error("Could not enqueue overdue incident alerts.");
      queued += data?.length ?? 0;
    }
    if ((incidents ?? []).length < pageSize) break;
  }
  return queued;
}
