/** Per-device (hashed IP) hourly limits for the public, login-free report flow. */
export const RATE_LIMITS = {
  analyze: 20,
  create: 8,
} as const;

export type RateLimitKind = keyof typeof RATE_LIMITS;

export function exceedsLimit(kind: RateLimitKind, countInLastHour: number): boolean {
  return countInLastHour >= RATE_LIMITS[kind];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Optional reporter e-mail: empty means "no e-mail"; anything else must look valid. */
export function normalizeOptionalEmail(value: unknown): string | null | "invalid" {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v.length > 200 || !EMAIL_RE.test(v)) return "invalid";
  return v;
}
