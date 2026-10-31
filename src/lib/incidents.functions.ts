import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { IncidentStatus } from "./incident-meta";
import { normalizeOptionalEmail } from "./rate-limit";

const MAX_IMAGE_CHARS = 8_000_000;
const IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkImage(value: unknown): string {
  if (typeof value !== "string" || !IMAGE_RE.test(value)) throw new Error("Imagem inválida.");
  if (value.length > MAX_IMAGE_CHARS) throw new Error("Imagem muito grande.");
  return value;
}

/** Step 1 — public (no login): ask the vision model to pre-fill the form. */
export const analyzeIncidentPhoto = createServerFn({ method: "POST" })
  .inputValidator((input: { imageDataUrl: string }) => ({ imageDataUrl: checkImage(input?.imageDataUrl) }))
  .handler(async ({ data }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    try {
      await enforceRateLimit("analyze");
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Tente novamente mais tarde." };
    }
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
  imageDataUrl: string;
  reporterName?: string;
  reporterEmail?: string;
  block: string;
  room: string;
  category: string;
  title: string;
  description: string;
};

/** Step 2 — public (no login) "Registrar Ocorrência": upload photo, AI suggests priority, store the ticket. */
export const createIncident = createServerFn({ method: "POST" })
  .inputValidator((input: CreateIncidentInput) => {
    const email = normalizeOptionalEmail(input?.reporterEmail);
    if (email === "invalid") throw new Error("E-mail inválido.");
    const clean = {
      imageDataUrl: checkImage(input?.imageDataUrl),
      reporterName: String(input?.reporterName ?? "").trim().slice(0, 80),
      reporterEmail: email,
      block: String(input?.block ?? "").trim().slice(0, 60),
      room: String(input?.room ?? "").trim().slice(0, 80),
      category: String(input?.category ?? "Outros").trim().slice(0, 60),
      title: String(input?.title ?? "").trim().slice(0, 120),
      description: String(input?.description ?? "").trim().slice(0, 2000),
    };
    if (!clean.block && !clean.room) throw new Error("Informe a localização.");
    if (clean.description.length < 5) throw new Error("Descreva o problema.");
    if (!clean.title) clean.title = clean.category;
    return clean;
  })
  .handler(async ({ data }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    const ipHash = await enforceRateLimit("create");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Photo goes straight to the private bucket from the server (reporters have no account).
    const [, mime = "image/jpeg", b64 = ""] = /^data:(image\/[a-z]+);base64,(.*)$/s.exec(data.imageDataUrl) ?? [];
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const photoPath = `anon/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("incident-photos")
      .upload(photoPath, bytes, { contentType: mime, upsert: false });
    if (upErr) {
      console.error("[incidents] photo upload failed", upErr);
      throw new Error("Falha ao enviar a foto.");
    }

    const location = [data.block, data.room].filter(Boolean).join(" - ");
    const { prioritizeIncident } = await import("./ai/incident-ai.server");
    const verdict = await prioritizeIncident({
      category: data.category,
      title: data.title,
      description: data.description,
      location,
    });

    // Inserts bypass RLS on purpose: nobody writes incidents directly, so the
    // AI suggestion can't be forged from the browser.
    const { data: row, error } = await supabaseAdmin
      .from("incidents")
      .insert({
        reporter_name: data.reporterName || "Anônimo",
        reporter_email: data.reporterEmail,
        reporter_ip_hash: ipHash,
        photo_path: photoPath,
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
      .select("id, tracking_token")
      .single();
    if (error) {
      console.error("[incidents] insert failed", error);
      throw new Error("Não foi possível registrar a ocorrência.");
    }
    return { id: row.id, protocol: row.id.slice(0, 8).toUpperCase(), token: row.tracking_token };
  });

/** Public — status of the tickets saved on this device (looked up by their secret tracking tokens). */
export const getTrackedIncidents = createServerFn({ method: "POST" })
  .inputValidator((input: { tokens: string[] }) => ({
    tokens: (Array.isArray(input?.tokens) ? input.tokens : []).filter((t) => typeof t === "string" && UUID_RE.test(t)).slice(0, 50),
  }))
  .handler(async ({ data }) => {
    if (!data.tokens.length) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("incidents")
      .select("id, tracking_token, title, location, status, created_at, resolved_at, resolution_note")
      .in("tracking_token", data.tokens)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Não foi possível carregar seus chamados.");
    return (rows ?? []).map((r) => ({
      token: r.tracking_token,
      protocol: r.id.slice(0, 8).toUpperCase(),
      title: r.title,
      location: r.location,
      status: r.status,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      resolutionNote: r.status === "concluido" ? r.resolution_note : null,
    }));
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
