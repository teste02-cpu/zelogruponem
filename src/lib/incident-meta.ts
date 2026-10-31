import type { Priority } from "./priority";

export type IncidentStatus = "pendente" | "em_andamento" | "concluido";

export const CATEGORIES = [
  "Portas e Fechaduras",
  "Elétrica",
  "Hidráulica",
  "Banheiros",
  "Climatização",
  "Iluminação",
  "Mobiliário",
  "Pintura e Acabamento",
  "Estrutura",
  "TI e Equipamentos",
  "Limpeza",
  "Segurança",
  "Outros",
] as const;

export const BLOCKS = ["Bloco A", "Bloco B", "Bloco C", "Bloco D", "Bloco E", "Biblioteca", "Área Externa"] as const;

export const PRIORITY_LABEL: Record<Priority, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
export const STATUS_LABEL: Record<IncidentStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

export const PRIORITY_RANK: Record<Priority, number> = { alta: 0, media: 1, baixa: 2 };

/** Parses QR codes like "Bloco A - Sala 05", "BLOCO-A|SALA-05" or a URL with ?local=... */
export function parseLocationCode(raw: string): { block: string | null; room: string } {
  let text = raw.trim();
  try {
    const url = new URL(text);
    text = url.searchParams.get("local") ?? url.searchParams.get("location") ?? text;
  } catch {
    // not a URL
  }
  text = decodeURIComponent(text).replace(/[|_]/g, " - ").replace(/\s+/g, " ").trim();
  const match = text.match(/bloco[\s-]*([a-z0-9]+)/i);
  if (match) {
    const block = `Bloco ${(match[1] ?? "").toUpperCase()}`;
    const room = text
      .replace(match[0], "")
      .replace(/^[\s\-–,:]+/, "")
      .replace(/sala[\s-]*/i, "Sala ")
      .trim();
    return { block, room };
  }
  return { block: null, room: text };
}
