// Everything `/api/channels/*` refuses to believe. Same shape as
// `app/api/profile/_lib/validate.ts`: `undefined` means "not acceptable", and the route turns that
// into one stable code. Nothing here reports *which* part of a body was wrong beyond the field
// name, and nothing echoes a value back.

import {
  MINUTES_PER_DAY,
  type ChannelPatch,
  type PushSubscriptionBody,
  type QuietView,
} from "./view";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * IANA zone names only. `Intl` also accepts offset forms ("+02:00"), which are not zones and would
 * make a stored quiet window mean different things in winter and summer. Same test as the profile
 * route's, kept local because that one is module-private there.
 */
function timezone(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const zone = value.trim();
  if (zone === "") return null;
  try {
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions()
      .timeZone;
    return resolved === "UTC" || /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$/.test(resolved)
      ? resolved
      : undefined;
  } catch {
    return undefined;
  }
}

/** A minute of the local day, or null. `channels.quiet_*_minute` is a smallint. */
function minute(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  return value >= 0 && value < MINUTES_PER_DAY ? value : undefined;
}

/**
 * A quiet window, or null for none.
 *
 * Partly-filled is refused rather than coerced: a window with a start and no end, or with no zone,
 * is not a window, and `isWithinQuietHours` in `@pemby/core` would read it as "no quiet hours" —
 * which is the opposite of what someone who just set a start time meant. Equal ends are refused
 * for the reason the kernel spells out: a zero-length window and a 24-hour one are the same two
 * numbers, and reading them as silence for ever is a setting nobody could undo from inside the
 * product.
 */
export function parseQuiet(value: unknown): QuietView | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;

  const start = minute(value.startMinute);
  const end = minute(value.endMinute);
  const zone = timezone(value.timezone);
  if (start === undefined || end === undefined || zone === undefined) return undefined;

  if (start === null && end === null && zone === null) return null;
  if (start === null || end === null || zone === null) return undefined;
  if (start === end) return undefined;
  return { startMinute: start, endMinute: end, timezone: zone };
}

export type PatchResult = { ok: true; patch: ChannelPatch } | { ok: false };

/** A PATCH body: any subset of the switches, nothing else, and at least one of them. */
export function parseChannelPatch(body: unknown): PatchResult {
  if (!isRecord(body)) return { ok: false };

  const allowed = new Set(["telegram", "email", "quiet", "paused"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return { ok: false };

  const patch: ChannelPatch = {};
  for (const key of ["telegram", "email", "paused"] as const) {
    if (key in body) {
      if (typeof body[key] !== "boolean") return { ok: false };
      patch[key] = body[key];
    }
  }
  if ("quiet" in body) {
    const quiet = parseQuiet(body.quiet);
    if (quiet === undefined) return { ok: false };
    patch.quiet = quiet;
  }

  return Object.keys(patch).length === 0 ? { ok: false } : { ok: true, patch };
}

/** Longest push endpoint we will store. Real ones are well under 300 characters. */
const ENDPOINT_MAX = 1024;
const BASE64URL = /^[A-Za-z0-9_-]+=*$/;

/**
 * A `PushSubscription`, as `toJSON()` hands it over.
 *
 * The endpoint must be https: it is the URL the dispatcher will POST an encrypted payload to, and
 * a plaintext one would be a request the browser itself refuses to have produced. The two keys are
 * checked for shape only — they are ECDH material the browser generated, not something the server
 * can verify — but a length bound keeps a hostile client from writing a megabyte into a jsonb
 * column.
 */
export function parseSubscription(body: unknown): PushSubscriptionBody | undefined {
  if (!isRecord(body) || !isRecord(body.keys)) return undefined;

  const { endpoint } = body;
  const { p256dh, auth } = body.keys;
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > ENDPOINT_MAX) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;

  if (typeof p256dh !== "string" || p256dh.length < 20 || p256dh.length > 200) return undefined;
  if (typeof auth !== "string" || auth.length < 10 || auth.length > 100) return undefined;
  if (!BASE64URL.test(p256dh) || !BASE64URL.test(auth)) return undefined;

  return { endpoint, keys: { p256dh, auth } };
}
