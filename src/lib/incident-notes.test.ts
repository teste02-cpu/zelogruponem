import { describe, expect, it } from "vitest";

import { normalizeIncidentNote, orderIncidentNotes } from "./incident-notes";

describe("incident notes", () => {
  it("trims text, ignores blank notes, and keeps the existing length limit", () => {
    expect(normalizeIncidentNote("  A equipe iniciou o reparo.  ")).toBe(
      "A equipe iniciou o reparo.",
    );
    expect(normalizeIncidentNote("   ")).toBeNull();
    expect(normalizeIncidentNote("x".repeat(1001))).toBe("x".repeat(1000));
  });

  it("orders the timeline chronologically so new notes appear at the bottom", () => {
    const newest = {
      id: "b",
      author_id: "admin",
      note: "Concluído",
      created_at: "2026-11-27T12:00:00Z",
    };
    const oldest = {
      id: "a",
      author_id: null,
      note: "Chamado recebido",
      created_at: "2026-11-26T12:00:00Z",
    };

    expect(orderIncidentNotes([newest, oldest])).toEqual([oldest, newest]);
  });
});
