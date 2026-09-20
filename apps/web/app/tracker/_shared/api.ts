// Browser side of `/api/applications/*`, in the shape `app/brief/_shared/api.ts` established.
// Errors carry the route's stable code; components map codes to messages through i18n.

import type { LocationReport, StatePatch, TrackerView } from "@/app/api/applications/_lib/view";

/** Codes the routes answer with, plus `network` for a request that never got an answer. */
export const TRACKER_CLIENT_ERRORS = [
  "unauthenticated",
  "forbidden",
  "invalid_request",
  "job_not_found",
  "not_applied",
  "unavailable",
  "network",
] as const;
export type TrackerClientError = (typeof TRACKER_CLIENT_ERRORS)[number];

export class TrackerRequestError extends Error {
  constructor(
    readonly code: TrackerClientError,
    readonly status: number,
  ) {
    super(code);
    this.name = "TrackerRequestError";
  }
}

export function errorCodeOf(error: unknown): TrackerClientError {
  return error instanceof TrackerRequestError ? error.code : "unavailable";
}

function toCode(value: unknown, status: number): TrackerClientError {
  if (typeof value === "string" && (TRACKER_CLIENT_ERRORS as readonly string[]).includes(value)) {
    return value as TrackerClientError;
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
    throw new TrackerRequestError("network", 0);
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
    throw new TrackerRequestError(toCode(error, response.status), response.status);
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

export const trackerKey = ["tracker"] as const;

export function getTracker(): Promise<TrackerView> {
  return request("/api/applications");
}

export function patchApplicationState(patch: StatePatch): Promise<{ state: string }> {
  return send("/api/applications", "PATCH", patch);
}

export function postLocationRejection(
  body: LocationReport,
): Promise<{ rejectedForLocation: boolean }> {
  return send("/api/applications/location", "POST", body);
}
