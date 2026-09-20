// Browser side of `/api/openrouter/*`. Same shape as `_shared/api.ts`: errors carry the route's
// stable code and the components map codes to messages through i18n (docs/conventions.md).
//
// A separate error vocabulary from the channels one on purpose. "Your OpenRouter account is out of
// credits" and "this browser refused notifications" have nothing to say to each other, and folding
// them into one union would oblige every channel error path to carry fourteen codes it can never
// produce — which is how a switch statement ends up with a default branch that shows the wrong
// sentence.

import type {
  OpenRouterAuthStart,
  OpenRouterError,
  OpenRouterKeyView,
} from "@/app/api/openrouter/_lib/view";
import { isOpenRouterError } from "@/app/api/openrouter/_lib/view";

export type { OpenRouterError, OpenRouterKeyView };

export class OpenRouterRequestError extends Error {
  constructor(readonly code: OpenRouterError) {
    super(code);
    this.name = "OpenRouterRequestError";
  }
}

export function openRouterErrorOf(error: unknown): OpenRouterError {
  return error instanceof OpenRouterRequestError ? error.code : "unavailable";
}

function toCode(value: unknown, status: number): OpenRouterError {
  if (typeof value === "string" && isOpenRouterError(value)) return value;
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  return "unavailable";
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, { ...init, cache: "no-store", credentials: "same-origin" });
  } catch {
    throw new OpenRouterRequestError("network");
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
    throw new OpenRouterRequestError(toCode(error, response.status));
  }
  return (await response.json()) as T;
}

export const openRouterKeyQuery = ["openrouter-key"] as const;

export function getOpenRouterKey(): Promise<OpenRouterKeyView> {
  return request("/api/openrouter");
}

/**
 * Start the flow. Answers with the URL to send the browser to; the PKCE verifier behind it is set
 * as an httpOnly cookie on this same response and is never visible here.
 */
export function startOpenRouterConnect(): Promise<OpenRouterAuthStart> {
  return request("/api/openrouter/connect", { method: "POST" });
}

export function deleteOpenRouterKey(): Promise<OpenRouterKeyView> {
  return request("/api/openrouter", { method: "DELETE" });
}

/** Ask OpenRouter whether the stored key still exists and can still pay. */
export function checkOpenRouterKey(): Promise<OpenRouterKeyView> {
  return request("/api/openrouter/check", { method: "POST" });
}

/** The two pages on OpenRouter that a connected key's owner — and only they — can open. */
export const openRouterKeysUrl = (hash: string): string => `https://openrouter.ai/keys/${hash}`;
export const OPENROUTER_KEYS_URL = "https://openrouter.ai/keys";
