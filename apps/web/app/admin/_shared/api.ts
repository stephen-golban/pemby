// Browser side of `/api/admin/*`, in the shape `app/brief/_shared/api.ts` established. Errors carry
// the route's stable code; components map codes to messages through i18n.

import type { AdminFlagPatch, AdminJobPatch, AdminView } from "@/app/api/admin/_lib/view";

/** Codes the routes answer with, plus `network` for a request that never got an answer. */
export const ADMIN_CLIENT_ERRORS = [
  "unauthenticated",
  "forbidden",
  "invalid_request",
  "flag_not_found",
  "flag_not_open",
  "job_not_found",
  "job_not_quarantined",
  "release_unavailable",
  "unavailable",
  "network",
] as const;
export type AdminClientError = (typeof ADMIN_CLIENT_ERRORS)[number];

export class AdminRequestError extends Error {
  constructor(
    readonly code: AdminClientError,
    readonly status: number,
  ) {
    super(code);
    this.name = "AdminRequestError";
  }
}

export function errorCodeOf(error: unknown): AdminClientError {
  return error instanceof AdminRequestError ? error.code : "unavailable";
}

function toCode(value: unknown, status: number): AdminClientError {
  if (typeof value === "string" && (ADMIN_CLIENT_ERRORS as readonly string[]).includes(value)) {
    return value as AdminClientError;
  }
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  return "unavailable";
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, { ...init, cache: "no-store", credentials: "same-origin" });
  } catch {
    throw new AdminRequestError("network", 0);
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
    throw new AdminRequestError(toCode(error, response.status), response.status);
  }
  return (await response.json()) as T;
}

export const adminKey = ["admin"] as const;

export function getAdmin(): Promise<AdminView> {
  return request("/api/admin");
}

function send<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function postFlagAction(
  patch: AdminFlagPatch,
): Promise<{ actioned: boolean; quarantined: boolean; released: boolean }> {
  return send("/api/admin/flags", patch);
}

export function postJobAction(patch: AdminJobPatch): Promise<{ released: boolean }> {
  return send("/api/admin/jobs", patch);
}
