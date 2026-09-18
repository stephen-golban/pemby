// Browser side of `/api/channels/*`. Errors carry the route's stable code; components map codes to
// messages through i18n (docs/conventions.md). Same shape as `app/profile/_shared/api.ts`.

import type {
  ChannelPatch,
  ChannelSettingsView,
  PushSubscriptionBody,
  TelegramLink,
} from "@/app/api/channels/_lib/view";

/** Codes the routes answer with, plus `network` for a request that never got an answer. */
export const SETTINGS_CLIENT_ERRORS = [
  "unauthenticated",
  "forbidden",
  "invalid_patch",
  "invalid_subscription",
  "subscription_taken",
  "telegram_unavailable",
  "unavailable",
  "network",
  /** The browser refused, or was never asked: permission denied, no push service, no worker. */
  "push_refused",
] as const;
export type SettingsClientError = (typeof SETTINGS_CLIENT_ERRORS)[number];

export class SettingsRequestError extends Error {
  constructor(readonly code: SettingsClientError) {
    super(code);
    this.name = "SettingsRequestError";
  }
}

export function errorCodeOf(error: unknown): SettingsClientError {
  return error instanceof SettingsRequestError ? error.code : "unavailable";
}

function toCode(value: unknown, status: number): SettingsClientError {
  if (typeof value === "string" && (SETTINGS_CLIENT_ERRORS as readonly string[]).includes(value)) {
    return value as SettingsClientError;
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
    throw new SettingsRequestError("network");
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
    throw new SettingsRequestError(toCode(error, response.status));
  }
  return (await response.json()) as T;
}

const jsonBody = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const settingsKey = ["channel-settings"] as const;

export function getSettings(): Promise<ChannelSettingsView> {
  return request("/api/channels");
}

export function patchSettings(patch: ChannelPatch): Promise<ChannelSettingsView> {
  return request("/api/channels", jsonBody("PATCH", patch));
}

/**
 * Mint a deep link. Answered once and never cached: the token in it is a credential, so it lives in
 * component state until the person uses it or leaves the page.
 */
export function postTelegramLink(): Promise<TelegramLink> {
  return request("/api/channels/telegram", { method: "POST" });
}

export function deleteTelegram(): Promise<ChannelSettingsView> {
  return request("/api/channels/telegram", { method: "DELETE" });
}

export function postPushSubscription(
  subscription: PushSubscriptionBody,
): Promise<ChannelSettingsView> {
  return request("/api/channels/push", jsonBody("POST", subscription));
}

/** One browser by endpoint, or every browser on the account except the one named by `endpoint`. */
export function deletePushSubscription(
  target: { endpoint: string } | { scope: "others"; endpoint: string | null },
): Promise<ChannelSettingsView> {
  return request("/api/channels/push", jsonBody("DELETE", target));
}
