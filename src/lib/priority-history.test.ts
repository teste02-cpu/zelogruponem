import { describe, expect, it } from "vitest";
import { formatHistory, pickSimilarCases, type ConfirmedCase } from "./priority-history";

const c = (extra: Partial<ConfirmedCase>): ConfirmedCase => ({
  category: "Climatização", block: "Bloco A", title: "Ar quebrado", description: "Ar-condicionado não liga",
  location: "Bloco A - Sala 1", ai_priority: "media", priority: "media", manager_priority_note: null, ...extra,
});

describe("priority history", () => {
  const input = { category: "Climatização", block: "Bloco A", title: "Ar-condicionado parado", description: "Ar-condicionado não liga na sala" };

  it("ignores unrelated tickets", () => {
    expect(pickSimilarCases([c({ category: "Pintura", block: "Bloco C", title: "Parede", description: "Mancha" })], input)).toHaveLength(0);
  });

  it("prefers manager corrections among similar tickets", () => {
    const plain = c({ title: "Plain" });
    const corrected = c({ title: "Corrected", priority: "alta" });
    expect(pickSimilarCases([plain, corrected], input)[0]?.title).toBe("Corrected");
  });

  it("tells the AI when the manager overrode its suggestion", () => {
    expect(formatHistory([c({ priority: "alta", manager_priority_note: "Sala de prova" })])).toContain("IA sugeriu media; gestor corrigiu");
  });
});
