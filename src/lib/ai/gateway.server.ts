import { createOpenAI } from "@ai-sdk/openai";
import { jsonSchema, Output, streamText, type ModelMessage } from "ai";

import { createLovableAiGatewayRunIdFetch } from "./run-id.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
export const AI_MODEL = "openai/gpt-6-astra";

export class AiGatewayError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function friendlyMessage(status: number, raw?: string) {
  if (status === 402) return "Os créditos de IA acabaram. Peça ao administrador para recarregar.";
  if (status === 429) return "Muitas análises ao mesmo tempo. Aguarde alguns segundos e tente de novo.";
  if (status === 401) return "A IA não está configurada corretamente.";
  if (status === 403) return raw || "O acesso à IA foi bloqueado para este espaço de trabalho.";
  return "A IA não respondeu agora. Você pode preencher os campos manualmente.";
}

/**
 * Runs one streamed structured-output call on the Responses API and returns the parsed object.
 * `schema` must be strict-compatible (all properties required, additionalProperties: false).
 */
export async function runStructured<T>(opts: {
  instructions: string;
  messages: ModelMessage[];
  schema: Record<string, unknown>;
  effort?: "low" | "medium";
}): Promise<T> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new AiGatewayError(friendlyMessage(401), 401);

  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  let streamError: unknown;
  const result = streamText({
    model: provider.responses(AI_MODEL),
    instructions: opts.instructions,
    messages: opts.messages,
    output: Output.object({ schema: jsonSchema<T>(opts.schema as never) }),
    onError: ({ error }) => {
      streamError = error;
    },
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: opts.effort ?? "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  try {
    const output = (await result.output) as T;
    if (!output) throw new Error("empty output");
    return output;
  } catch (error) {
    const source = (streamError ?? error) as { statusCode?: number; message?: string; responseBody?: string };
    const status = typeof source?.statusCode === "number" ? source.statusCode : 500;
    console.error("[ai] structured call failed", status, source?.message, source?.responseBody?.slice?.(0, 500));
    throw new AiGatewayError(friendlyMessage(status), status);
  }
}
