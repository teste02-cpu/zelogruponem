import { describe, expect, it } from "vitest";

import { classifyByRules, finalizePriority } from "./priority";

const base = { category: "Outros", location: "Bloco A - Sala 05" };

describe("priority rule", () => {
  it("classifies a leak as ALTA", () => {
    expect(classifyByRules({ ...base, description: "Vazamento de água no teto do corredor" }).priority).toBe("alta");
  });

  it("classifies exposed wiring as ALTA", () => {
    expect(classifyByRules({ ...base, description: "Fiação exposta perto da tomada" }).priority).toBe("alta");
  });

  it("classifies an inoperative bathroom as ALTA", () => {
    expect(classifyByRules({ ...base, description: "Banheiro masculino entupido e inoperante" }).priority).toBe("alta");
  });

  it("classifies broken A/C on exam day as ALTA", () => {
    expect(classifyByRules({ ...base, description: "Ar-condicionado quebrado e hoje tem prova" }).priority).toBe("alta");
  });

  it("classifies peeling paint as BAIXA", () => {
    expect(classifyByRules({ ...base, description: "Pintura descascada na parede lateral" }).priority).toBe("baixa");
  });

  it("never lets the AI downgrade a high-risk report below ALTA", () => {
    const result = finalizePriority(
      { priority: "baixa", justification: "Parece pequeno." },
      { ...base, description: "Fiação exposta no quadro de luz" },
    );
    expect(result.priority).toBe("alta");
  });

  it("keeps the AI verdict when no high-risk term is present", () => {
    const result = finalizePriority(
      { priority: "baixa", justification: "Lâmpada em corredor externo bem iluminado." },
      { ...base, description: "Lâmpada queimada no corredor externo, local bem iluminado" },
    );
    expect(result.priority).toBe("baixa");
  });
});
