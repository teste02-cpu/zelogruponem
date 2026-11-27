import { describe, expect, it } from "vitest";

import { buildDescriptionFromTitlePrompt } from "./incident-ai.server";

describe("title-to-description prompt", () => {
  it("includes the manually edited title and incident context", () => {
    const prompt = buildDescriptionFromTitlePrompt({
      category: "Pintura e Acabamento",
      title: "Paredes do corredor com manchas de infiltração",
      location: "Bloco A - Sala 05",
    });

    expect(prompt).toContain("Paredes do corredor com manchas de infiltração");
    expect(prompt).toContain("Pintura e Acabamento");
    expect(prompt).toContain("Bloco A - Sala 05");
  });

  it("uses a neutral location when the location is absent", () => {
    const prompt = buildDescriptionFromTitlePrompt({
      category: "Outros",
      title: "Lâmpada queimada",
      location: "",
    });

    expect(prompt).toContain("Não informado");
  });
});
