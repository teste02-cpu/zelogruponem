import type { Priority } from "./priority";

/** A past ticket whose final priority the manager confirmed. */
export type ConfirmedCase = {
  category: string;
  block: string | null;
  title: string;
  description: string;
  location: string;
  ai_priority: Priority | null;
  priority: Priority;
  manager_priority_note: string | null;
};

export const HISTORY_MAX_EXAMPLES = 12;

const words = (s: string) =>
  new Set(
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 3),
  );

/** Ranks confirmed cases by similarity (category, block, shared words); manager overrides count extra. */
export function pickSimilarCases(
  cases: ConfirmedCase[],
  input: { category: string; block: string | null; title: string; description: string },
  max = HISTORY_MAX_EXAMPLES,
): ConfirmedCase[] {
  const target = words(`${input.title} ${input.description}`);
  return cases
    .map((c, index) => {
      let score = 0;
      if (c.category === input.category) score += 3;
      if (input.block && c.block === input.block) score += 1;
      for (const w of words(`${c.title} ${c.description}`)) if (target.has(w)) score += 1;
      if (c.ai_priority && c.ai_priority !== c.priority) score += 1;
      return { c, score, index };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, max)
    .map((x) => x.c);
}

/** Text block given to the AI: how managers actually decided similar tickets. */
export function formatHistory(cases: ConfirmedCase[]): string {
  if (cases.length === 0) return "";
  const lines = cases.map((c) => {
    const changed = c.ai_priority && c.ai_priority !== c.priority ? ` (IA sugeriu ${c.ai_priority}; gestor corrigiu)` : "";
    const note = c.manager_priority_note ? ` Motivo do gestor: ${c.manager_priority_note.slice(0, 200)}` : "";
    return `- [${c.category} | ${c.location || "sem local"}] ${c.title}: ${c.description.slice(0, 200)} → decisão final: ${c.priority}${changed}.${note}`;
  });
  return `HISTÓRICO DE DECISÕES DOS GESTORES EM CHAMADOS PARECIDOS (use como referência da rotina desta universidade; a regra institucional continua valendo):\n${lines.join("\n")}`;
}
