import { describe, expect, it } from "vitest";

import { canReporterEdit, cleanReporterEdit, diffReporterEdit } from "./reporter-edit";

describe("reporter edits", () => {
  it("allows editing while pending or in progress", () => {
    expect(canReporterEdit("pendente")).toBe(true);
    expect(canReporterEdit("em_andamento")).toBe(true);
  });

  it("blocks editing once concluded", () => {
    expect(canReporterEdit("concluido")).toBe(false);
  });

  it("lists only the fields that changed", () => {
    const before = { title: "Porta", description: "Trinco solto", location: "Bloco A - Sala 05" };
    const after = { ...before, description: "Trinco caiu" };
    expect(diffReporterEdit(before, after)).toEqual([
      { field: "description", from: "Trinco solto", to: "Trinco caiu" },
    ]);
  });

  it("rejects an empty location", () => {
    expect(() => cleanReporterEdit({ title: "Porta", description: "Trinco solto", location: " " })).toThrow();
  });
});
