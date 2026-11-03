import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { IncidentStatus } from "./incident-meta";
import { normalizeOptionalEmail } from "./rate-limit";
import { canReporterEdit, cleanReporterEdit, diffReporterEdit, type ReporterEditFields } from "./reporter-edit";

const MAX_IMAGE_CHARS = 8_000_000;
const IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,/;
const ANONYMOUS_USER_ID = "00000000-0000-0000-0000-000000000000";
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
  accessToken?: string;
  block: string;
  room: string;
  category: string;
  title: string;
  description: string;
};

/** Step 2 — public "Registrar Ocorrência": login is optional; the server stores and prioritizes the ticket. */
export const createIncident = createServerFn({ method: "POST" })
  .inputValidator((input: CreateIncidentInput) => {
    const email = normalizeOptionalEmail(input?.reporterEmail);
    if (email === "invalid") throw new Error("E-mail inválido.");
    const accessToken = typeof input?.accessToken === "string" ? input.accessToken.trim() : "";
    if (accessToken.length > 4096) throw new Error("Sessão inválida.");
    const clean = {
      imageDataUrl: checkImage(input?.imageDataUrl),
      reporterName: String(input?.reporterName ?? "").trim().slice(0, 80),
      reporterEmail: email,
      accessToken: accessToken || undefined,
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
    const reporter = data.accessToken
      ? await supabaseAdmin.auth.getUser(data.accessToken).then(({ data: result, error }) => {
          if (error || !result.user)
            throw new Error("Sua sessão expirou. Entre novamente para registrar.");
          return result.user;
        })
      : null;

    // Photos always go through the server into the private bucket.
    const [, mime = "image/jpeg", b64 = ""] =
      /^data:(image\/[a-z]+);base64,(.*)$/s.exec(data.imageDataUrl) ?? [];
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
        user_id: reporter?.id ?? ANONYMOUS_USER_ID,
        reporter_name:
          (typeof reporter?.user_metadata?.["full_name"] === "string" &&
            reporter.user_metadata["full_name"].trim()) ||
          data.reporterName ||
          "Anônimo",
        reporter_email: reporter?.email ?? data.reporterEmail,
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

/** Logged-in reporters can recover their saved tickets on any device. */
export const getAccountIncidents = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) => {
    if (
      typeof input?.accessToken !== "string" ||
      !input.accessToken.trim() ||
      input.accessToken.length > 4096
    ) {
      throw new Error("Sessão inválida.");
    }
    return { accessToken: input.accessToken.trim() };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (authError || !authData.user) throw new Error("Sua sessão expirou. Entre novamente.");

    const { data: rows, error } = await supabaseAdmin
      .from("incidents")
      .select("id, title, description, location, status, created_at, resolved_at, resolution_note, reporter_edited_at")
      .eq("user_id", authData.user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Não foi possível carregar seus chamados.");
    return (rows ?? []).map((row) => ({
      id: row.id,
      protocol: row.id.slice(0, 8).toUpperCase(),
      title: row.title,
      description: row.description,
      location: row.location,
      editedAt: row.reporter_edited_at,
      status: row.status,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      resolutionNote: row.status === "concluido" ? row.resolution_note : null,
    }));
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
      .select("id, tracking_token, title, description, location, status, created_at, resolved_at, resolution_note, reporter_edited_at")
      .in("tracking_token", data.tokens)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Não foi possível carregar seus chamados.");
    return (rows ?? []).map((r) => ({
      token: r.tracking_token,
      protocol: r.id.slice(0, 8).toUpperCase(),
      title: r.title,
      description: r.description,
      location: r.location,
      editedAt: r.reporter_edited_at,
      status: r.status,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      resolutionNote: r.status === "concluido" ? r.resolution_note : null,
    }));
  });

type ReporterEditInput = Partial<ReporterEditFields> & {
  /** Logged-in reporter: ticket id + session token. */
  id?: string;
  accessToken?: string;
  /** Login-free reporter: the secret tracking token saved on the device. */
  trackingToken?: string;
};

/** Public — the reporter edits their own ticket while it is not concluded; admins are flagged. */
export const editReporterIncident = createServerFn({ method: "POST" })
  .inputValidator((input: ReporterEditInput) => {
    const fields = cleanReporterEdit(input ?? {});
    const trackingToken = typeof input?.trackingToken === "string" && UUID_RE.test(input.trackingToken) ? input.trackingToken : undefined;
    const id = typeof input?.id === "string" && UUID_RE.test(input.id) ? input.id : undefined;
    const accessToken = typeof input?.accessToken === "string" && input.accessToken.length <= 4096 ? input.accessToken.trim() : "";
    if (!trackingToken && !(id && accessToken)) throw new Error("Chamado inválido.");
    return { ...fields, trackingToken, id, accessToken };
  })
  .handler(async ({ data }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    await enforceRateLimit("edit");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin.from("incidents").select("id, title, description, location, status, user_id");
    if (data.trackingToken) {
      query = query.eq("tracking_token", data.trackingToken);
    } else {
      const { data: authData, error } = await supabaseAdmin.auth.getUser(data.accessToken);
      if (error || !authData.user) throw new Error("Sua sessão expirou. Entre novamente.");
      query = query.eq("id", data.id!).eq("user_id", authData.user.id);
    }
    const { data: current, error: readErr } = await query.maybeSingle();
    if (readErr || !current) throw new Error("Chamado não encontrado.");
    if (!canReporterEdit(current.status)) throw new Error("Chamados concluídos não podem ser editados.");

    const changes = diffReporterEdit(current, data);
    if (!changes.length) return { ok: true, changed: false };

    const { error: upErr } = await supabaseAdmin
      .from("incidents")
      .update({
        title: data.title,
        description: data.description,
        location: data.location,
        reporter_edited_at: new Date().toISOString(),
        reporter_edit_seen: false,
      })
      .eq("id", current.id)
      .neq("status", "concluido");
    if (upErr) throw new Error("Não foi possível salvar a edição.");
    await supabaseAdmin.from("incident_edits").insert({ incident_id: current.id, changes });
    return { ok: true, changed: true };
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
    if (!isStaff) throw new Error("Apenas administradores podem alterar chamados.");

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
      if (current.user_id === ANONYMOUS_USER_ID) {
        // Login-free reporter: the new status shows up in "Meus chamados" on their device.
        notified = true;
      } else {
        const { error: nErr } = await supabase
          .from("notifications")
          .insert({ user_id: current.user_id, incident_id: current.id, message });
        notified = !nErr;
      }
    }
    return { ok: true, notified };
  });

/** Admin only — delete an incident and remove its private photo from storage. */
export const deleteIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (typeof input?.id !== "string" || !UUID_RE.test(input.id)) {
      throw new Error("Chamado inválido.");
    }
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError) throw new Error("Não foi possível verificar sua permissão.");
    if (!isAdmin) throw new Error("Apenas administradores podem excluir chamados.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: incident, error: readError } = await supabaseAdmin
      .from("incidents")
      .select("id, photo_path")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error("Não foi possível localizar o chamado.");
    if (!incident) throw new Error("Chamado não encontrado.");

    const { error: deleteError } = await supabaseAdmin
      .from("incidents")
      .delete()
      .eq("id", data.id);
    if (deleteError) {
      console.error("[incidents] delete failed", deleteError);
      throw new Error("Não foi possível excluir o chamado.");
    }

    if (!incident.photo_path) return { photoCleanupFailed: false };
    const { error: storageError } = await supabaseAdmin.storage
      .from("incident-photos")
      .remove([incident.photo_path]);
    if (storageError) {
      console.error("[incidents] photo cleanup failed after incident deletion", {
        incidentId: incident.id,
        error: storageError,
      });
    }
    return { photoCleanupFailed: !!storageError };
  });
