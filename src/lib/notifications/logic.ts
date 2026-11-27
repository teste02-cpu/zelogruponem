export type NotificationEvent = "new_incident" | "overdue" | "completed";
export type IncidentForOverdue = { id: string; status: string; created_at: string };

export function notificationIdempotencyKey(
  event: NotificationEvent,
  incidentId: string,
  recipientEmail: string,
  occurrence?: string,
): string {
  const occurrenceKey = event === "completed" && occurrence ? `:${occurrence}` : "";
  return `${event}:${incidentId}${occurrenceKey}:${recipientEmail.trim().toLowerCase()}`;
}

export function selectNotificationRecipients(
  event: NotificationEvent,
  admins: readonly string[],
  reporterEmail?: string | null,
): string[] {
  const recipients = event === "completed" ? [...admins, reporterEmail ?? ""] : [...admins];
  return [...new Set(recipients.map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

export function isIncidentOverdue(
  incident: IncidentForOverdue,
  now: Date,
  overdueHours: number,
): boolean {
  if (incident.status === "concluido" || !Number.isFinite(overdueHours) || overdueHours <= 0)
    return false;
  const createdAt = Date.parse(incident.created_at);
  return Number.isFinite(createdAt) && createdAt <= now.getTime() - overdueHours * 60 * 60_000;
}

export function newlyCompleted(previousStatus: string, nextStatus: string): boolean {
  return previousStatus !== "concluido" && nextStatus === "concluido";
}

export function overdueHoursFromConfig(value: string | undefined): number {
  if (!value) return 24;
  const hours = Number(value);
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
    throw new Error("INCIDENT_OVERDUE_HOURS must be an integer between 1 and 720.");
  }
  return hours;
}
