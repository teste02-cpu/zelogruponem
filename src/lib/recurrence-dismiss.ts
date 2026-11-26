/**
 * "Problemas recorrentes" is a dashboard heads-up, not a record: the same information
 * stays in the reports. The manager can close it here, and the choice is kept on this
 * device only. A dismissal is tied to the current report count, so a new report of the
 * same problem raises the alert again.
 */
import type { RecurrenceAlert } from "./recurrence";

const KEY = "zelo:recurrence-dismissed";

export function dismissalKey(alert: RecurrenceAlert): string {
  return `${alert.key}::${alert.ids.length}`;
}

export function readDismissedRecurrences(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissedRecurrences(keys: string[]): string[] {
  const unique = Array.from(new Set(keys));
  localStorage.setItem(KEY, JSON.stringify(unique));
  return unique;
}

/** Hides the given alerts. Dismissals of problems that stopped recurring are dropped. */
export function dismissRecurrences(active: RecurrenceAlert[], keys: string[]): string[] {
  const activeKeys = new Set(active.map(dismissalKey));
  const next = Array.from(new Set([...readDismissedRecurrences(), ...keys])).filter((k) =>
    activeKeys.has(k),
  );
  return writeDismissedRecurrences(next);
}

/** Brings back alerts the manager had closed. */
export function restoreRecurrences(keys: string[]): string[] {
  const drop = new Set(keys);
  return writeDismissedRecurrences(readDismissedRecurrences().filter((k) => !drop.has(k)));
}

/** Splits recurrences into the ones to show and the ones the manager closed. */
export function splitRecurrences(alerts: RecurrenceAlert[], dismissed: string[]) {
  const closed = new Set(dismissed);
  const visible: RecurrenceAlert[] = [];
  const hidden: RecurrenceAlert[] = [];
  for (const a of alerts) (closed.has(dismissalKey(a)) ? hidden : visible).push(a);
  return { visible, hidden };
}
