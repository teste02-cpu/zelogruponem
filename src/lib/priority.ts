/**
 * Business rule for incident priority (shared by the AI prompt and the deterministic safety net).
 *
 * ALTA: anything that directly affects the experience, safety or continuity of activities of
 *       students/staff — inoperative bathrooms, leaks, doors jammed in classrooms, broken A/C on
 *       exam day, exposed wiring.
 * MÉDIA/BAIXA: aesthetic damage or items that do not prevent immediate use of the space —
 *       peeling paint, burnt-out lamp in a well-lit outdoor corridor.
 */
export type Priority = "alta" | "media" | "baixa";

const PRIORITY_ORDER: Record<Priority, number> = { baixa: 0, media: 1, alta: 2 };

export const PRIORITY_RULE_TEXT = `REGRA DE PRIORIDADE DA UNIVERSIDADE
- ALTA: tudo que afeta diretamente a experiência, a segurança ou a continuidade das atividades de alunos ou colaboradores.
  Exemplos: banheiros inoperantes ou entupidos, vazamentos/infiltrações ativas, portas travadas ou fechaduras quebradas em salas de aula,
  ar-condicionado quebrado em dia de prova ou em sala ocupada, fiação exposta, curto-circuito, risco de queda, vidro quebrado, falta de energia ou água.
- MÉDIA: problemas funcionais que incomodam mas não impedem o uso imediato do espaço (ex.: tomada solta numa sala com outras tomadas, cadeira quebrada isolada, lâmpada queimada em sala de aula com outras acesas).
- BAIXA: avarias estéticas ou itens que não impedem o uso (ex.: pintura descascada, risco na parede, lâmpada queimada em corredor externo bem iluminado, rodapé solto).`;

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Terms that always mean ALTA (safety / continuity). */
const HIGH_RISK_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /fia(cao|coes)\s+expost|fio(s)?\s+(expost|desencapad|solt)|curto[- ]?circuito|choque eletric|faisca/, reason: "risco elétrico (fiação exposta/curto)" },
  { pattern: /vazament|vazando|infiltra|alagad|inunda|cano estourad/, reason: "vazamento ou infiltração ativa" },
  { pattern: /(banheiro|sanitario|vaso|privada|descarga)[^.]{0,40}(entupid|inoperant|quebrad|nao funciona|interditad|sem agua)|(entupid|inoperant)[^.]{0,30}(banheiro|sanitario|vaso|privada)/, reason: "banheiro inoperante" },
  { pattern: /porta[^.]{0,40}(travad|emperrad|nao abre|presa)|(macaneta|fechadura|trinco)[^.]{0,60}sala de aula/, reason: "porta travada/fechadura em sala de aula" },
  { pattern: /(ar[- ]?condicionado|climatiza)[^.]{0,60}(prova|exame|avaliacao)/, reason: "climatização quebrada em dia de prova" },
  { pattern: /risco de (queda|desabamento|acidente)|vidro quebrad|teto (caindo|cedendo)|sem energia|falta de energia|sem agua|cheiro de gas|vazamento de gas|incendio|fumaca/, reason: "risco à segurança ou interrupção de serviço essencial" },
];

/** Terms that indicate purely aesthetic damage. */
const AESTHETIC_PATTERNS = /pintura|descascad|risco na parede|riscad|mancha|rodape|estetic|desbotad|pichac|grafite|arranhad/;

export function detectHighRiskReason(text: string): string | null {
  const t = normalize(text);
  for (const { pattern, reason } of HIGH_RISK_PATTERNS) if (pattern.test(t)) return reason;
  return null;
}

/** Deterministic classification used when the AI is unavailable. */
export function classifyByRules(input: { category: string; description: string; location: string }): {
  priority: Priority;
  justification: string;
} {
  const text = `${input.category}. ${input.description}. ${input.location}`;
  const risk = detectHighRiskReason(text);
  if (risk) return { priority: "alta", justification: `Classificação automática por regra: ${risk}.` };
  if (AESTHETIC_PATTERNS.test(normalize(text)))
    return { priority: "baixa", justification: "Classificação automática por regra: avaria estética que não impede o uso do espaço." };
  return { priority: "media", justification: "Classificação automática por regra: problema funcional sem risco imediato identificado." };
}

/**
 * Combines the AI verdict with the safety net: if a high-risk term is present the result is never
 * below ALTA, regardless of what the model said.
 */
export function finalizePriority(
  ai: { priority: Priority; justification: string },
  input: { category: string; description: string; location: string },
): { priority: Priority; justification: string } {
  const risk = detectHighRiskReason(`${input.category}. ${input.description}. ${input.location}`);
  if (risk && PRIORITY_ORDER[ai.priority] < PRIORITY_ORDER.alta) {
    return {
      priority: "alta",
      justification: `${ai.justification} Elevada para ALTA pela regra institucional: ${risk}.`,
    };
  }
  return ai;
}
