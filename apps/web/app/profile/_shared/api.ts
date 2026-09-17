// Browser side of `/api/profile/*` and of the teaser call behind the live count. Errors carry the
// route's stable code; components map codes to messages through i18n.

import type { TeaserResult } from "@/lib/teaser";
import type { ProfilePatch, ProfileView } from "@/app/api/profile/_lib/view";

/** Codes the routes answer with, plus `network` for a request that never got an answer. */
export const PROFILE_CLIENT_ERRORS = [
  "unauthenticated",
  "forbidden",
  "invalid_display_name",
  "invalid_profile_patch",
  "invalid_confirmation",
  "delete_failed",
  "unavailable",
  "forced_failure",
  "network",
] as const;
export type ProfileClientError = (typeof PROFILE_CLIENT_ERRORS)[number];

export class ProfileRequestError extends Error {
  constructor(
    readonly code: ProfileClientError,
    readonly status: number,
  ) {
    super(code);
    this.name = "ProfileRequestError";
  }
}

export function errorCodeOf(error: unknown): ProfileClientError {
  return error instanceof ProfileRequestError ? error.code : "unavailable";
}

function toCode(value: unknown, status: number): ProfileClientError {
  if (typeof value === "string" && (PROFILE_CLIENT_ERRORS as readonly string[]).includes(value)) {
    return value as ProfileClientError;
  }
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  return "unavailable";
}

async function send(input: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, { ...init, cache: "no-store", credentials: "same-origin" });
  } catch {
    throw new ProfileRequestError("network", 0);
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
    throw new ProfileRequestError(toCode(error, response.status), response.status);
  }
  return response;
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  return (await (await send(input, init)).json()) as T;
}

/** Shared with `components/display-name-form.tsx` on `/app`: the same cache entry. */
export const profileKey = ["profile"] as const;

export const matchCountKey = (query: string) => ["match-count", query] as const;

export function getProfile(): Promise<ProfileView> {
  return request("/api/profile");
}

export function patchProfile(patch: ProfilePatch): Promise<ProfileView> {
  return request("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function postOnboardingComplete(): Promise<ProfileView> {
  return request("/api/profile/onboarding", { method: "POST" });
}

export function postAccountDelete(confirm: string): Promise<{ deleted: boolean }> {
  return request("/api/profile/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm }),
  });
}

export const EXPORT_PATH = "/api/profile/export";

export function getMatchCount(query: string): Promise<TeaserResult> {
  return request(query === "" ? "/api/teaser" : `/api/teaser?${query}`);
}

/**
 * Query-string overrides the teaser accepts (`lib/teaser/query.ts`), built from the profile on
 * screen rather than the one in the database, so the count follows an optimistic edit instead of
 * racing the PATCH that persists it. An empty list is left out: the route rejects an empty value,
 * and the caller answers "no ways of working" without a request.
 */
export function matchCountQuery(profile: {
  residenceCountry: string | null;
  waysOfWorking: readonly string[];
  seniority: string | null;
  titles: readonly string[];
}): string {
  const params = new URLSearchParams();
  if (profile.residenceCountry) params.set("country", profile.residenceCountry);
  if (profile.waysOfWorking.length > 0) params.set("ways", [...profile.waysOfWorking].join(","));
  if (profile.seniority) params.set("seniority", profile.seniority);
  // The route splits `titles` on commas, so a title holding one would arrive as two.
  const titles = profile.titles
    .map((title) => title.replace(/,/g, " ").replace(/\s+/g, " ").trim())
    .filter((title) => title !== "" && title.length <= 100)
    .slice(0, 5);
  if (titles.length > 0) params.set("titles", titles.join(","));
  return params.toString();
}
