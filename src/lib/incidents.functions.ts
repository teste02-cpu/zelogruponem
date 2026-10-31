import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { IncidentStatus } from "./incident-meta";

const MAX_IMAGE_CHARS = 8_000_000;

/** Step 1 — the photo was just taken: ask the vision model to pre-fill the form. */
export const analyzeIncidentPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { imageDataUrl: string }) => {
    if (typeof input?.imageDataUrl !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(input.imageDataUrl)) {
      throw new Error("Imagem inválida.");
    }
    if (input.imageDataUrl.length > MAX_IMAGE_CHARS) throw new Error("Imagem muito grande.");
    return input;
  })
  .handler(async ({ data }) => {
    const { analyzePhoto } = await import("./ai/incident-ai.server");
    const { AiGatewayError } = await import("./ai/gateway.server");
    try {
      return { ok: true as const, analysis: await analyzePhoto(data.imageDataUrl) };
    } catch (error) {
      const message = error instanceof AiGatewayError ? error.message : "Não foi possível analisar a foto.";
      return { ok: false as const, error: message };
    }
  });

type CreateIncidentInput = {
  photoPath: string;
  block: string;
  room: string;
  category: string;
  title: string;
  description: string;
};

/** Step 2 — "Registrar Ocorrência": classify priority server-side and store the ticket. */
export const createIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CreateIncidentInput) => {
    const clean = {
      photoPath: String(input?.photoPath ?? "").trim(),
      block: String(input?.block ?? "").trim().slice(0, 60),
      room: String(input?.room ?? "").trim().slice(0, 80),
      category: String(input?.category ?? "Outros").trim().slice(0, 60),
      title: String(input?.title ?? "").trim().slice(0, 120),
      description: String(input?.description ?? "").trim().slice(0, 2000),
    };
    if (!clean.photoPath) throw new Error("A foto é obrigatória.");
    if (!clean.block && !clean.room) throw new Error("Informe a localização.");
    if (clean.description.length < 5) throw new Error("Descreva o problema.");
    if (!clean.title) clean.title = clean.category;
    return clean;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.photoPath.startsWith(`${userId}/`)) throw new Error("Foto inválida.");

    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
    const reporterName = profile?.full_name || "Colaborador";
    const location = [data.block, data.room].filter(Boolean).join(" - ");

    const { prioritizeIncident } = await import("./ai/incident-ai.server");
    const verdict = await prioritizeIncident({
      category: data.category,
      title: data.title,
      description: data.description,
      location,
    });

    // Inserts bypass RLS on purpose: users cannot write incidents directly, so the
    // AI-computed priority can't be forged from the browser.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("incidents")
      .insert({
        user_id: userId,
        reporter_name: reporterName,
        photo_path: data.photoPath,
        location,
        block: data.block || null,
        category: data.category,
        title: data.title,
        description: data.description,
        // AI only suggests; the manager confirms or changes it in the dashboard.
        priority: verdict.priority,
        priority_reason: null,
        ai_priority: verdict.priority,
        ai_priority_reason: verdict.source === "ia" ? verdict.justification : `${verdict.justification} (IA indisponível)`,
        priority_confirmed: false,
      })
      .select("id, priority")
      .single();
    if (error) {
      console.error("[incidents] insert failed", error);
      throw new Error("Não foi possível registrar a ocorrência.");
    }
    return { id: row.id, priority: row.priority };
  });

type UpdateIncidentInput = {
  id: string;
  priority?: "alta" | "media" | "baixa";
  priorityNote?: string | null;
  status?: IncidentStatus;
  assignedTo?: string | null;
  resolutionNote?: string | null;
  notify?: boolean;
};

/** Admin — change status / assignee and notify the reporter. */
export const updateIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpdateIncidentInput) => {
    if (!input?.id) throw new Error("Chamado inválido.");
    if (input.status && !["pendente", "em_andamento", "concluido"].includes(input.status)) {
      throw new Error("Status inválido.");
    }
    if (input.priority && !["alta", "media", "baixa"].includes(input.priority)) {
      throw new Error("Prioridade inválida.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isStaff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!isStaff) throw new Error("Apenas a equipe de manutenção pode alterar chamados.");

    const { data: current, error: readErr } = await supabase
      .from("incidents")
      .select("id, user_id, title, location, status")
      .eq("id", data.id)
      .single();
    if (readErr || !current) throw new Error("Chamado não encontrado.");

    const patch: {
      status?: IncidentStatus;
      assigned_to?: string | null;
      resolution_note?: string | null;
      priority?: "alta" | "media" | "baixa";
      priority_confirmed?: boolean;
      priority_set_by?: string;
      priority_set_at?: string;
      manager_priority_note?: string | null;
    } = {};
    if (data.priority) {
      patch.priority = data.priority;
      patch.priority_confirmed = true;
      patch.priority_set_by = userId;
      patch.priority_set_at = new Date().toISOString();
      patch.manager_priority_note = data.priorityNote?.trim().slice(0, 1000) || null;
    }
    if (data.status) patch.status = data.status;
    if (data.assignedTo !== undefined) patch.assigned_to = data.assignedTo;
    if (data.resolutionNote !== undefined) patch.resolution_note = data.resolutionNote?.slice(0, 1000) ?? null;

    const { error } = await supabase.from("incidents").update(patch).eq("id", data.id);
    if (error) throw new Error("Não foi possível atualizar o chamado.");

    let notified = false;
    const statusChanged = data.status && data.status !== current.status;
    if (statusChanged && (data.notify ?? true) && data.status !== "pendente") {
      const message =
        data.status === "concluido"
          ? `Seu chamado "${current.title}" (${current.location}) foi resolvido.${data.resolutionNote ? ` Nota da equipe: ${data.resolutionNote}` : ""}`
          : `Seu chamado "${current.title}" (${current.location}) está em atendimento pela equipe de manutenção.`;
      const { error: nErr } = await supabase
        .from("notifications")
        .insert({ user_id: current.user_id, incident_id: current.id, message });
      notified = !nErr;
    }
    return { ok: true, notified };
  });
