import { CATEGORIES } from "../incident-meta";
import { classifyByRules, finalizePriority, PRIORITY_RULE_TEXT, type Priority } from "../priority";
import { runStructured } from "./gateway.server";

export type PhotoAnalysis = {
  is_maintenance_issue: boolean;
  category: string;
  title: string;
  description: string;
};

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["is_maintenance_issue", "category", "title", "description"],
  properties: {
    is_maintenance_issue: { type: "boolean" },
    category: { type: "string", enum: [...CATEGORIES] },
    title: { type: "string" },
    description: { type: "string" },
  },
};

export async function analyzePhoto(imageDataUrl: string): Promise<PhotoAnalysis> {
  const [, mediaType = "image/jpeg", base64 = ""] = imageDataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/) ?? [];
  if (!base64) throw new Error("Imagem inválida");
  const result = await runStructured<PhotoAnalysis>({
    instructions: `Você é um técnico de manutenção predial de uma universidade brasileira.
Analise a foto enviada por um colaborador e identifique o problema de infraestrutura visível.
Responda sempre em português do Brasil.
- category: a categoria mais adequada da lista.
- title: título curto e objetivo do problema (máx. 6 palavras), ex.: "Maçaneta/Trinco danificado".
- description: 1 ou 2 frases descrevendo o que se vê e o possível impacto, ex.: "Fechadura da porta avariada com peças soltas; a porta não fecha corretamente."
- is_maintenance_issue: false se a foto não mostrar nenhum problema de infraestrutura (nesse caso, descreva o que vê e peça mais detalhes).
Não invente localização nem informações que não estejam visíveis.`,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Analise esta foto de ocorrência de manutenção." },
          { type: "image", image: new URL(imageDataUrl) },
        ],
      },
    ],
    schema: analysisSchema,
    effort: "low",
  });
  return {
    ...result,
    title: result.title.trim().slice(0, 120),
    description: result.description.trim().slice(0, 1000),
  };
}

export function buildDescriptionFromTitlePrompt(input: {
  category: string;
  title: string;
  location: string;
}): string {
  return `Categoria: ${input.category}
Título informado pelo usuário: ${input.title}
Local: ${input.location || "Não informado"}`;
}

const descriptionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["description"],
  properties: {
    description: { type: "string" },
  },
};

export async function regenerateDescription(input: {
  category: string;
  title: string;
  location: string;
}): Promise<string> {
  const title = input.title.trim().slice(0, 120);
  if (title.length < 2) throw new Error("Informe um título.");

  const result = await runStructured<{ description: string }>({
    instructions: `Você é um técnico de manutenção predial de uma universidade brasileira.
Reescreva a descrição do problema a partir do título informado pelo usuário.
Responda sempre em português do Brasil.
- Use 1 ou 2 frases objetivas.
- Preserve fielmente o problema indicado pelo título.
- Considere a categoria e o local fornecidos.
- Não invente causas, danos ou informações não sustentadas pelo título.
- Retorne uma descrição curta e adequada para um chamado de manutenção.`,
    messages: [
      {
        role: "user",
        content: buildDescriptionFromTitlePrompt({
          category: input.category.trim().slice(0, 60),
          title,
          location: input.location.trim().slice(0, 140),
        }),
      },
    ],
    schema: descriptionSchema,
    effort: "low",
  });

  return result.description.trim().slice(0, 1000);
}

export async function transcribeDescriptionAudio(audioDataUrl: string): Promise<string> {
  const [, , base64 = ""] =
    audioDataUrl.match(/^data:(audio\/(?:webm|ogg|mp4|mpeg));base64,(.+)$/) ?? [];
  if (!base64) throw new Error("Áudio inválido.");

  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  const { runAudioTranscription } = await import("./gateway.server");
  return runAudioTranscription({ audio: bytes });
}

const prioritySchema = {
  type: "object",
  additionalProperties: false,
  required: ["priority", "justification"],
  properties: {
    priority: { type: "string", enum: ["alta", "media", "baixa"] },
    justification: { type: "string" },
  },
};

export async function prioritizeIncident(input: {
  category: string;
  title: string;
  description: string;
  location: string;
}): Promise<{ priority: Priority; justification: string; source: "ia" | "regra" }> {
  try {
    const ai = await runStructured<{ priority: Priority; justification: string }>({
      instructions: `Você é o motor de priorização de chamados de manutenção de uma universidade.
${PRIORITY_RULE_TEXT}
Avalie a CATEGORIA, a DESCRIÇÃO e o LOCAL. Considere quem é afetado (salas de aula, banheiros e laboratórios têm alto fluxo de alunos).
Retorne a prioridade e uma justificativa curta (1-2 frases, em português) que o gestor possa ler e entender o porquê.`,
      messages: [
        {
          role: "user",
          content: `Categoria: ${input.category}\nTítulo: ${input.title}\nLocal: ${input.location}\nDescrição: ${input.description}`,
        },
      ],
      schema: prioritySchema,
      effort: "low",
    });
    return { ...finalizePriority(ai, input), source: "ia" };
  } catch (error) {
    console.error("[ai] priority fallback to rules", error);
    return { ...classifyByRules(input), source: "regra" };
  }
}
