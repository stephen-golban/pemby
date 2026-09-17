// Shared response helpers and the stable error codes of `/api/profile/*`. Bodies carry codes, never
// sentences (docs/conventions.md, i18n): the client maps a code to a message.

import { getProductAccess } from "@/lib/auth/session";
import type { Session } from "@/lib/auth/session";

/** Every code these routes can answer with. The client's messages are keyed by exactly these. */
export const PROFILE_ERRORS = [
  "unauthenticated",
  "forbidden",
  "invalid_display_name",
  "invalid_profile_patch",
  "invalid_confirmation",
  "delete_failed",
  "unavailable",
  "forced_failure",
] as const;
export type ProfileError = (typeof PROFILE_ERRORS)[number];

/** Personal data: never cached, by any hop. */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function fail(
  error: ProfileError,
  status: number,
  extra?: Record<string, string>,
): Response {
  return json({ error, ...extra }, status);
}

export type Authorized = { session: Session; error?: undefined } | { error: Response };

/** Session required. With the owner gate on, the session must also be an allowlisted account. */
export async function authorize(request: Request): Promise<Authorized> {
  const access = await getProductAccess(request.headers);
  if (access.status === "unauthenticated") return { error: fail("unauthenticated", 401) };
  if (access.status === "forbidden") return { error: fail("forbidden", 403) };
  return { session: access.session };
}

/** True when the session belongs to a Better Auth anonymous user (PLAN D4). */
export function isAnonymous(session: Session): boolean {
  return session.user.isAnonymous === true;
}
