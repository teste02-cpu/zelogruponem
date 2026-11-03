import type { IncidentStatus } from "./incident-meta";

/** Reporters may edit their own ticket only while it is not concluded. */
export function canReporterEdit(status: IncidentStatus): boolean {
  return status !== "concluido";
}

export type ReporterEditFields = { title: string; description: string; location: string };
export type ReporterEditChange = { field: keyof ReporterEditFields; from: string; to: string };

export const REPORTER_FIELD_LABEL: Record<keyof ReporterEditFields, string> = {
  title: "Título",
  description: "Descrição",
  location: "Local",
};

/** Trims and validates what the reporter typed; throws a pt-BR message when invalid. */
export function cleanReporterEdit(input: Partial<ReporterEditFields>): ReporterEditFields {
  const clean = {
    title: String(input?.title ?? "").trim().slice(0, 120),
    description: String(input?.description ?? "").trim().slice(0, 2000),
    location: String(input?.location ?? "").trim().slice(0, 140),
  };
  if (!clean.title) throw new Error("Informe o título.");
  if (clean.description.length < 5) throw new Error("Descreva o problema.");
  if (!clean.location) throw new Error("Informe a localização.");
  return clean;
}

/** Field-by-field list of what actually changed. */
export function diffReporterEdit(
  before: ReporterEditFields,
  after: ReporterEditFields,
): ReporterEditChange[] {
  return (Object.keys(REPORTER_FIELD_LABEL) as (keyof ReporterEditFields)[])
    .filter((field) => before[field] !== after[field])
    .map((field) => ({ field, from: before[field], to: after[field] }));
}
