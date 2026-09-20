// Response helpers and the stable error codes of `/api/admin/*`, in the shape
// `app/api/brief/_lib/http.ts` established: bodies carry codes, never sentences
// (docs/conventions.md, i18n), and the client maps a code to a message.

import { getOwnerAccess } from "@/lib/access/owner";
import type { Session } from "@/lib/auth/session";

/** Every code these routes can answer with. The client's messages are keyed by exactly these. */
export const ADMIN_ERRORS = [
  "unauthenticated",
  "forbidden",
  "invalid_request",
  "flag_not_found",
  "flag_not_open",
  "job_not_found",
  "job_not_quarantined",
  "release_unavailable",
  "unavailable",
] as const;
export type AdminError = (typeof ADMIN_ERRORS)[number];

/** Other people's rows: never cached, by any hop. */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function fail(error: AdminError, status: number): Response {
  return json({ error }, status);
}

export type Authorized = { session: Session; error?: undefined } | { error: Response };

/**
 * Owner only, **always** — `getOwnerAccess`, never `getProductAccess`.
 *
 * `getProductAccess` consults the allowlist only when `ownerGateEnabled()` is true, so on staging,
 * which has no `OWNER_GATE` variable and open sign-up, it answers `ok` for anyone who signs
 * themselves up. These routes answer with other people's flags, other people's jobs and Pemby's own
 * spend. See `lib/access/owner.ts`.
 */
export async function authorizeOwner(request: Request): Promise<Authorized> {
  const access = await getOwnerAccess(request.headers);
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

/**
 * The HTTP status a refusal deserves. One table, so the two write routes cannot disagree about what
 * `job_not_quarantined` means.
 *
 * `release_unavailable` is 503 rather than 409 or 501: the request is well formed and would be
 * honoured, and the reason it is not is that this deploy is missing a kernel helper. That is a
 * server-side gap, and a status that says so is the one that will not be misread as "the owner
 * asked for something wrong".
 */
export function statusFor(error: AdminError): number {
  if (error === "flag_not_found" || error === "job_not_found") return 404;
  if (error === "release_unavailable") return 503;
  return 409;
}
