// Response helpers and the stable error codes of `/api/brief/*`, in the shape
// `app/api/profile/_lib/http.ts` established: bodies carry codes, never sentences
// (docs/conventions.md, i18n), and the client maps a code to a message.

import { getProductAccess } from "@/lib/auth/session";
import type { Session } from "@/lib/auth/session";

/** Every code these routes can answer with. The client's messages are keyed by exactly these. */
export const BRIEF_ERRORS = [
  "unauthenticated",
  "forbidden",
  "invalid_request",
  "match_not_found",
  "job_not_found",
  "already_flagged",
  "flag_limit_reached",
  "unavailable",
] as const;
export type BriefError = (typeof BRIEF_ERRORS)[number];

/** Personal data: never cached, by any hop. */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function fail(error: BriefError, status: number): Response {
  return json({ error }, status);
}

export type Authorized = { session: Session; error?: undefined } | { error: Response };

/** Session required. With the owner gate on, the session must also be an allowlisted account. */
export async function authorize(request: Request): Promise<Authorized> {
  const access = await getProductAccess(request.headers);
  if (access.status === "unauthenticated") return { error: fail("unauthenticated", 401) };
  if (access.status === "forbidden") return { error: fail("forbidden", 403) };
  return { session: access.session };
}

/** JSON body or null; a malformed body is the caller's problem, never a 500. */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const body: unknown = await request.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

export function isIn<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

/** A uuid, as every id column in `packages/db/src/schema` is. */
export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}
