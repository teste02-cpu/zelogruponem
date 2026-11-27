export type IncidentTimelineEntry = {
  id: string;
  author_id: string | null;
  note: string;
  created_at: string;
};

export function normalizeIncidentNote(value: string | undefined): string | null {
  const note = value?.trim().slice(0, 1000) ?? "";
  return note || null;
}

export function orderIncidentNotes(entries: IncidentTimelineEntry[]): IncidentTimelineEntry[] {
  return [...entries].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}
