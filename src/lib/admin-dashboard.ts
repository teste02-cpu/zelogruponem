import type { IncidentRow } from "@/components/admin/types";

export function isVisibleOnAdminDashboard(
  incident: Pick<IncidentRow, "status" | "resolved_at">,
  now: Date,
): boolean {
  if (incident.status !== "concluido") return true;
  if (!incident.resolved_at) return false;

  const resolvedAt = new Date(incident.resolved_at);
  return (
    resolvedAt.getFullYear() === now.getFullYear() &&
    resolvedAt.getMonth() === now.getMonth() &&
    resolvedAt.getDate() === now.getDate()
  );
}
