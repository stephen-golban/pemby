import { createHash } from "node:crypto";
import { getDb } from "@pemby/db";

// Raw SQL on the shared pool, as in lib/auth/claim.ts (no drizzle-orm operators in apps/web).

/**
 * Fixed-window counter on `rate_limits`: one atomic upsert per call returns the count including
 * this request. The window start comes from the database clock. The worker's `cv.cleanup` purges
 * windows older than two days.
 */
export async function consumeRateLimit(
  key: string,
  windowSeconds: number,
  max: number,
): Promise<boolean> {
  const { rows } = await getDb().$client.query<{ count: number }>(
    `insert into rate_limits (key, window_start, count)
     values ($1, to_timestamp(floor(extract(epoch from now()) / $2::int) * $2::int), 1)
     on conflict (key, window_start) do update set count = rate_limits.count + 1
     returning count`,
    [key, windowSeconds],
  );
  const count = Number(rows[0]?.count ?? Number.POSITIVE_INFINITY);
  return count <= max;
}

export const CV_IP_LIMIT = { windowSeconds: 3600, max: 5 } as const;
export const CV_GLOBAL_ANON_WINDOW_SECONDS = 3600;
export const CV_GLOBAL_ANON_DEFAULT_MAX = 60;
export const CV_USER_LIMIT = { windowSeconds: 24 * 3600, max: 3 } as const;

/** The raw IP is never stored: the key holds its sha256. */
export function ipKey(ip: string): string {
  return `cv:ip:${createHash("sha256").update(ip).digest("hex")}`;
}

/** `CV_ANON_GLOBAL_PER_HOUR`, 1 to 100,000, default 60. */
export function globalAnonMax(): number {
  const raw = process.env.CV_ANON_GLOBAL_PER_HOUR?.trim();
  if (!raw) return CV_GLOBAL_ANON_DEFAULT_MAX;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 100_000
    ? value
    : CV_GLOBAL_ANON_DEFAULT_MAX;
}

/**
 * Counts one CV submission against the IP (5/hour), then, for anonymous callers, a global hourly
 * cap on anonymous submissions (`CV_ANON_GLOBAL_PER_HOUR`, default 60: a botnet spread over many
 * IPs and throwaway sessions still cannot run up the model bill), then the user (3/day).
 *
 * The counters are consumed in that order and the first refusal stops the rest, so a request
 * refused by a wider limit does not use up the caller's own allowance. Without an IP (local runs)
 * the per-IP limit is skipped.
 */
export async function consumeCvLimits(
  ip: string | null,
  userId: string,
  anonymous: boolean,
): Promise<boolean> {
  if (ip && !(await consumeRateLimit(ipKey(ip), CV_IP_LIMIT.windowSeconds, CV_IP_LIMIT.max))) {
    return false;
  }
  if (
    anonymous &&
    !(await consumeRateLimit("cv:global:anon", CV_GLOBAL_ANON_WINDOW_SECONDS, globalAnonMax()))
  ) {
    return false;
  }
  return consumeRateLimit(`cv:user:${userId}`, CV_USER_LIMIT.windowSeconds, CV_USER_LIMIT.max);
}
