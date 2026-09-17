/**
 * The caller's IP, for Turnstile's `remoteip` and the per-IP upload limit. The only place that
 * reads IP headers for the CV drop.
 *
 * `X-Real-IP` only: Railway's edge sets it to the connecting client and ignores a client-supplied
 * value (https://docs.railway.com/networking/public-networking/specs-and-limits), which is what
 * `apps/web/lib/auth/server.ts` already trusts. `X-Forwarded-For` is not used: its left-hand entry
 * is client-controlled, so trusting it would let one caller mint unlimited IP buckets. Returns
 * null when the header is absent (local runs without a proxy); the per-IP limit is then skipped
 * and the user and global limits carry the load.
 *
 * UNVERIFIED: not confirmed against a real Railway request; Railway staff have also suggested the
 * first X-Forwarded-For entry.
 */
export function clientIp(headers: Headers): string | null {
  return headers.get("x-real-ip")?.trim() || null;
}
