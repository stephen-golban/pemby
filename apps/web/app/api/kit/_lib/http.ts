// Response helpers for `/api/kit/*`, in the shape `app/api/brief/_lib/http.ts` established: bodies
// carry codes, never sentences (docs/conventions.md, i18n), and the client maps a code to a message.

import { getProductAccess } from "@/lib/auth/session";
import type { Session } from "@/lib/auth/session";
import type { KitError } from "./view";

/** Personal data — a cover letter written about one person. Never cached, by any hop. */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * The HTTP status each code answers with, for the failures that happen **before** a stream starts.
 *
 * Once a stream has returned 200 there is no status left to send and the failure travels as an
 * `error` event instead; `statusFor` is therefore only ever consulted on the preflight path, and
 * every code it does not name is a 500 because it should not have reached here.
 */
const STATUS: Partial<Record<KitError, number>> = {
  unauthenticated: 401,
  forbidden: 403,
  invalid_request: 400,
  job_not_found: 404,
  // 409: the request is well formed and the account is entitled to ask, but the account is not in a
  // state that can answer it yet. Each one has a different thing to do on screen.
  no_profile: 409,
  no_cv: 409,
  defaults_missing: 409,
  quota_exhausted: 402,
  key_unreadable: 409,
};

export function statusFor(error: KitError): number {
  return STATUS[error] ?? 500;
}

export function fail(error: KitError, status = statusFor(error)): Response {
  return json({ error }, status);
}

export type Authorized = { session: Session; error?: undefined } | { error: Response };

/** Session required. With the owner gate on, the session must also be an allowlisted account. */
export async function authorize(request: Request): Promise<Authorized> {
  const access = await getProductAccess(request.headers);
  if (access.status === "unauthenticated") return { error: fail("unauthenticated") };
  if (access.status === "forbidden") return { error: fail("forbidden") };
  return { session: access.session };
}

/** JSON body or null; a malformed body is the caller's problem, never a 500. */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const body: unknown = await request.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/** A uuid, as every job id is. */
export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}
