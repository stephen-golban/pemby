// Browser side of `/api/brief/*`, in the shape `app/profile/_shared/api.ts` established. Errors
// carry the route's stable code; components map codes to messages through i18n.

import type {
  BriefView,
  FlagBody,
  MatchStatePatch,
  PreferencesPatch,
} from "@/app/api/brief/_lib/view";

/** Codes the routes answer with, plus `network` for a request that never got an answer. */
export const BRIEF_CLIENT_ERRORS = [
  "unauthenticated",
  "forbidden",
  "invalid_request",
  "match_not_found",
  "job_not_found",
  "already_flagged",
  "flag_limit_reached",
  "unavailable",
  "network",
] as const;
export type BriefClientError = (typeof BRIEF_CLIENT_ERRORS)[number];

export class BriefRequestError extends Error {
  constructor(
    readonly code: BriefClientError,
    readonly status: number,
  ) {
    super(code);
    this.name = "BriefRequestError";
  }
}

export function errorCodeOf(error: unknown): BriefClientError {
  return error instanceof BriefRequestError ? error.code : "unavailable";
}

function toCode(value: unknown, status: number): BriefClientError {
  if (typeof value === "string" && (BRIEF_CLIENT_ERRORS as readonly string[]).includes(value)) {
    return value as BriefClientError;
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
    throw new BriefRequestError("network", 0);
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
    throw new BriefRequestError(toCode(error, response.status), response.status);
  }
  return (await response.json()) as T;
}

function send<T>(path: string, method: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const briefKey = ["brief"] as const;

export function getBrief(): Promise<BriefView> {
  return request("/api/brief");
}

export function patchMatchState(patch: MatchStatePatch): Promise<{ state: string }> {
  return send("/api/brief/match", "PATCH", patch);
}

export function postFlag(body: FlagBody): Promise<{ flagged: boolean }> {
  return send("/api/brief/flag", "POST", body);
}

export function patchPreferences(
  patch: PreferencesPatch,
): Promise<{ includeYellow: boolean; hideNoSalary: boolean; scoreFloor: number | null }> {
  return send("/api/brief/preferences", "PATCH", patch);
}
