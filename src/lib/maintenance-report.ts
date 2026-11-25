import type { IncidentRow } from "@/components/admin/types";
import { PRIORITY_LABEL, STATUS_LABEL } from "./incident-meta";
import { findRecurrences, RECURRENCE_MIN_COUNT } from "./recurrence";

export type ReportFilters = { from: string; to: string; block: string; category: string; status: string };

export function filterReport(rows: IncidentRow[], filters: ReportFilters): IncidentRow[] {
  const start = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : -Infinity;
  const end = filters.to ? new Date(`${filters.to}T23:59:59.999`).getTime() : Infinity;
  return rows.filter((row) => {
    const date = new Date(row.created_at).getTime();
    return date >= start && date <= end &&
      (filters.block === "all" || row.block === filters.block) &&
      (filters.category === "all" || row.category === filters.category) &&
      (filters.status === "all" || row.status === filters.status);
  });
}

export function summarizeReport(rows: IncidentRow[]) {
  const categories = new Map<string, number>();
  for (const row of rows) categories.set(row.category, (categories.get(row.category) ?? 0) + 1);
  return {
    total: rows.length,
    pending: rows.filter((r) => r.status === "pendente").length,
    progress: rows.filter((r) => r.status === "em_andamento").length,
    done: rows.filter((r) => r.status === "concluido").length,
    triage: rows.filter((r) => !r.priority_confirmed).length,
    high: rows.filter((r) => r.priority_confirmed && r.priority === "alta").length,
    categories: [...categories].sort((a, b) => b[1] - a[1]),
  };
}

/** Recurrence always uses the same rolling window as the dashboard, not the report's date/status filter. */
export function reportRecurrences(rows: IncidentRow[], filters: ReportFilters, now = new Date()) {
  return findRecurrences(rows, now).flatMap((alert) => {
    const scopedIds = alert.ids.filter((id) => rows.some((r) => r.id === id &&
      (filters.block === "all" || r.block === filters.block) &&
      (filters.category === "all" || r.category === filters.category)));
    return scopedIds.length >= RECURRENCE_MIN_COUNT ? [{ ...alert, ids: scopedIds }] : [];
  });
}

/** Quote every cell and neutralize spreadsheet formulas supplied through reporter fields. */
export function csvCell(value: string): string {
  const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function maintenanceCsv(rows: IncidentRow[], recurringIds: Set<string>): string {
  const header = ["Protocolo", "Abertura", "Conclusão", "Título", "Categoria", "Local", "Colaborador", "Status", "Prioridade final", "Problema recorrente", "Nota de resolução"];
  const data = rows.map((r) => [
    r.id.slice(0, 8).toUpperCase(), r.created_at, r.resolved_at ?? "", r.title,
    r.category, r.location, r.reporter_name, STATUS_LABEL[r.status],
    r.priority_confirmed ? PRIORITY_LABEL[r.priority] : "Aguardando triagem",
    recurringIds.has(r.id) ? "Sim" : "Não", r.resolution_note ?? "",
  ]);
  return "\uFEFF" + [header, ...data].map((row) => row.map(csvCell).join(";")).join("\r\n");
}