/** Tickets reported from this device, kept in the browser so reporters can follow them without login. */
const KEY = "zelo:tickets";

export type TrackedTicket = { token: string; protocol: string; title: string; createdAt: string };

export function readTrackedTickets(): TrackedTicket[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((t) => t && typeof t.token === "string") : [];
  } catch {
    return [];
  }
}

export function addTrackedTicket(ticket: TrackedTicket) {
  const list = [ticket, ...readTrackedTickets().filter((t) => t.token !== ticket.token)].slice(0, 50);
  localStorage.setItem(KEY, JSON.stringify(list));
}

const SEEN_KEY = "zelo:tickets-seen-resolved";

export function readSeenResolved(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function markResolvedSeen(tokens: string[]) {
  localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(new Set([...readSeenResolved(), ...tokens]))));
}

const REPORTER_KEY = "zelo:reporter";

export function readReporter(): { name: string; email: string } {
  try {
    const v = JSON.parse(localStorage.getItem(REPORTER_KEY) ?? "{}");
    return { name: typeof v.name === "string" ? v.name : "", email: typeof v.email === "string" ? v.email : "" };
  } catch {
    return { name: "", email: "" };
  }
}

export function saveReporter(value: { name: string; email: string }) {
  localStorage.setItem(REPORTER_KEY, JSON.stringify(value));
}
