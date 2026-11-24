/** Recurring-problem detection: same reporter + same category within a time window. */
export const RECURRENCE_WINDOW_DAYS = 90;
export const RECURRENCE_MIN_COUNT = 2; // "2 ou mais chamados iguais"
const ANON = "00000000-0000-0000-0000-000000000000";

export type RecurrenceInput = {
  id: string;
  user_id: string;
  reporter_email: string | null;
  reporter_name: string;
  category: string;
  created_at: string;
};

export type RecurrenceAlert = { key: string; reporter: string; category: string; ids: string[] };

/** Same person = same e-mail (signed in or not); falls back to account id. */
function reporterKey(i: RecurrenceInput, emailByUser: Map<string, string>): string | null {
  const hasUser = !!i.user_id && i.user_id !== ANON;
  const email = i.reporter_email?.trim().toLowerCase() || (hasUser ? emailByUser.get(i.user_id) : undefined);
  if (email) return `e:${email}`;
  return hasUser ? `u:${i.user_id}` : null;
}

export function findRecurrences(rows: RecurrenceInput[], now = new Date()): RecurrenceAlert[] {
  const since = now.getTime() - RECURRENCE_WINDOW_DAYS * 86_400_000;
  const groups = new Map<string, RecurrenceAlert>();
  const emailByUser = new Map<string, string>();
  for (const r of rows) {
    const e = r.reporter_email?.trim().toLowerCase();
    if (e && r.user_id && r.user_id !== ANON) emailByUser.set(r.user_id, e);
  }
  for (const r of rows) {
    if (new Date(r.created_at).getTime() < since) continue;
    const who = reporterKey(r, emailByUser);
    if (!who) continue;
    const key = `${who}|${r.category.trim().toLowerCase()}`;
    const g = groups.get(key) ?? { key, reporter: r.reporter_name, category: r.category, ids: [] };
    g.ids.push(r.id);
    groups.set(key, g);
  }
  return [...groups.values()].filter((g) => g.ids.length >= RECURRENCE_MIN_COUNT);
}
