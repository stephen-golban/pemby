// Browser side of `/api/kit/*`, in the shape `app/brief/_shared/api.ts` established. Errors carry
// the route's stable code; components map codes to messages through i18n.

import type {
  ApplicationDefaultsPatch,
  ApplicationDefaultsView,
  KitContentView,
  KitError,
  KitPageView,
  KitQuotaView,
  KitStreamEvent,
  KitView,
} from "@/app/api/kit/_lib/view";
import { KIT_ERRORS } from "@/app/api/kit/_lib/view";

/** Every code a route answers with, plus `network` for a request that never got an answer. */
export const KIT_CLIENT_ERRORS = [...KIT_ERRORS, "network"] as const;
export type KitClientError = (typeof KIT_CLIENT_ERRORS)[number];

export class KitRequestError extends Error {
  constructor(readonly code: KitClientError) {
    super(code);
    this.name = "KitRequestError";
  }
}

/**
 * The one failure worth offering a plain "try again" for.
 *
 * Only `openrouter_in_flight_budget` is transient (`paymentRequiredKindOf` → `"in-flight"`), and on
 * a mid-stream failure it carries no `Retry-After`, so the retry is the reader's tap rather than a
 * timer. Everything else — no credits, a spent key cap, a revoked key, a spent quota — needs a
 * decision, and a retry button on any of them is a button that fails again.
 */
export function isRetryable(error: KitClientError): boolean {
  return error === "key_busy";
}

/** The failures that are about the reader's own key. They all offer the same two ways on. */
export function isKeyFailure(error: KitClientError): boolean {
  return (
    error === "key_unreadable" ||
    error === "key_credits" ||
    error === "key_limit" ||
    error === "key_invalid"
  );
}

export function errorCodeOf(error: unknown): KitClientError {
  return error instanceof KitRequestError ? error.code : "unavailable";
}

function toCode(value: unknown, status: number): KitClientError {
  if (typeof value === "string" && (KIT_CLIENT_ERRORS as readonly string[]).includes(value)) {
    return value as KitClientError;
  }
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  return "unavailable";
}

async function failureOf(response: Response): Promise<KitRequestError> {
  const body: unknown = await response.json().catch(() => null);
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  return new KitRequestError(toCode(error, response.status));
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, { ...init, cache: "no-store", credentials: "same-origin" });
  } catch {
    throw new KitRequestError("network");
  }
  if (!response.ok) throw await failureOf(response);
  return (await response.json()) as T;
}

export const kitKey = (jobId: string) => ["kit", jobId] as const;

export function getKitPage(jobId: string): Promise<KitPageView> {
  return request(`/api/kit/${jobId}`);
}

/** Per person, not per post: the answers are reused on every kit they ever generate (PLAN D5). */
export function patchDefaults(patch: ApplicationDefaultsPatch): Promise<ApplicationDefaultsView> {
  return request("/api/kit/defaults", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

/**
 * "I applied" — a record of something the person did themselves in the employer's own form.
 * Nothing behind it submits anything (PLAN D9, D16). Idempotent on the server.
 */
export function postApplied(jobId: string): Promise<{ applied: boolean }> {
  return request(`/api/kit/${jobId}/applied`, { method: "POST" });
}

export interface StreamOptions {
  onPartial: (content: Partial<KitContentView>) => void;
  /** Lets the page abandon a generation when the reader leaves it. */
  signal?: AbortSignal;
}

/**
 * Runs one generation and returns the stored kit.
 *
 * The response is NDJSON, so it is read by bytes and split on newlines rather than by
 * `EventSource` (which is GET-only) or a chat runtime (see the note at the top of
 * `app/api/kit/[jobId]/generate/route.ts`). Three things about this loop are deliberate:
 *
 *  - **The buffer is only flushed on a newline.** A chunk boundary falls wherever the network puts
 *    it, routinely mid-object, so parsing per chunk would throw on perfectly good JSON.
 *  - **A failure after the 200 arrives as an `error` event and is thrown**, so the caller has one
 *    failure path whether the refusal came with an HTTP status or after the stream opened.
 *  - **A stream that ends without `done` or `error` is a failure**, not an empty success. That is
 *    what a dropped connection looks like from here, and treating it as "no kit, no problem" would
 *    leave the reader looking at a half-written letter with nothing saying it stopped.
 */
export async function streamKit(
  jobId: string,
  { onPartial, signal }: StreamOptions,
): Promise<{ kit: KitView; quota: KitQuotaView }> {
  let response: Response;
  try {
    response = await fetch(`/api/kit/${jobId}/generate`, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      ...(signal === undefined ? {} : { signal }),
    });
  } catch {
    throw new KitRequestError("network");
  }
  if (!response.ok) throw await failureOf(response);
  if (!response.body) throw new KitRequestError("unavailable");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished: { kit: KitView; quota: KitQuotaView } | null = null;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (line === "") continue;

        const event = parseEvent(line);
        if (!event) continue;
        if (event.type === "partial") onPartial(event.content);
        if (event.type === "error") throw new KitRequestError(event.error);
        if (event.type === "done") finished = { kit: event.kit, quota: event.quota };
      }

      if (done) break;
    }
  } catch (error) {
    if (error instanceof KitRequestError) throw error;
    throw new KitRequestError(signal?.aborted === true ? "unavailable" : "network");
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  if (!finished) throw new KitRequestError("network");
  return finished;
}

/** One NDJSON line, or null when it is not an event this build understands. */
function parseEvent(line: string): KitStreamEvent | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (typeof parsed !== "object" || parsed === null) return null;
    const type = (parsed as { type?: unknown }).type;
    if (type === "disclosure" || type === "partial" || type === "done" || type === "error") {
      return parsed as KitStreamEvent;
    }
    return null;
  } catch {
    return null;
  }
}

export type { KitError };
