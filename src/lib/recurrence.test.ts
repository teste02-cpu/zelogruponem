import { describe, expect, it } from "vitest";
import { findRecurrences } from "./recurrence";

const now = new Date("2026-11-24T12:00:00Z");
const row = (id: string, daysAgo: number, extra: Partial<Parameters<typeof findRecurrences>[0][0]> = {}) => ({
  id, user_id: "u1", reporter_email: null, reporter_name: "Marcelo", category: "Ar-condicionado",
  created_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(), ...extra,
});

describe("recurrence", () => {
  it("alerts when the same user reports the same category 2 times in 90 days", () => {
    expect(findRecurrences([row("a", 1), row("b", 30)], now)).toHaveLength(1);
  });
  it("does not alert for only 1 report", () => {
    expect(findRecurrences([row("a", 1)], now)).toHaveLength(0);
  });
  it("ignores reports older than 90 days", () => {
    expect(findRecurrences([row("a", 1), row("b", 120)], now)).toHaveLength(0);
  });
  it("ignores anonymous reports without e-mail", () => {
    const anon = { user_id: "00000000-0000-0000-0000-000000000000" };
    expect(findRecurrences([row("a", 1, anon), row("b", 2, anon), row("c", 3, anon)], now)).toHaveLength(0);
  });
});

describe("recurrence across signed-in and anonymous reports", () => {
  it("counts same e-mail with and without login together", () => {
    const now = new Date("2026-11-24T00:00:00Z");
    const a = findRecurrences([
      { id: "1", user_id: "u1", reporter_email: "m@x.com", reporter_name: "M", category: "Pintura", created_at: "2026-11-03T00:00:00Z" },
      { id: "2", user_id: "00000000-0000-0000-0000-000000000000", reporter_email: "M@x.com", reporter_name: "M", category: "Pintura", created_at: "2026-11-20T00:00:00Z" },
    ], now);
    expect(a.length).toBe(1);
    expect(a[0]?.ids).toEqual(["1", "2"]);
  });
  it("links older account tickets without e-mail through another ticket from that account", () => {
    const rows = [row("a", 1, { reporter_email: " MARCELO@example.test " }), row("b", 20), row("c", 30, { user_id: "00000000-0000-0000-0000-000000000000", reporter_email: "marcelo@example.test" })];
    expect(findRecurrences(rows, now)[0]?.ids).toEqual(["a", "b", "c"]);
  });
  it("does not merge people with different e-mails or categories", () => {
    expect(findRecurrences([row("a", 1, { reporter_email: "a@example.test" }), row("b", 2, { user_id: "u2", reporter_email: "b@example.test" }), row("c", 3, { category: "Pintura" })], now)).toHaveLength(0);
  });
});

