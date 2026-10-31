import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

import { exceedsLimit, type RateLimitKind } from "./rate-limit";

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hashed caller IP (never stored in clear). */
export async function callerHash(): Promise<string> {
  const ip =
    getRequestHeader("cf-connecting-ip") ||
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
    getRequestIP({ xForwardedFor: true }) ||
    "unknown";
  return sha256(`zelo:${ip}`);
}

/** Records one hit and throws a friendly error when the hourly limit is reached. */
export async function enforceRateLimit(kind: RateLimitKind): Promise<string> {
  const ipHash = await callerHash();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count } = await supabaseAdmin
    .from("request_log")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("kind", kind)
    .gte("created_at", since);
  if (exceedsLimit(kind, count ?? 0)) {
    throw new Error("Muitos envios seguidos deste aparelho. Tente novamente em alguns minutos.");
  }
  await supabaseAdmin.from("request_log").insert({ ip_hash: ipHash, kind });
  return ipHash;
}
