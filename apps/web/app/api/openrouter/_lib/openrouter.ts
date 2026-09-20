// The two calls Pemby makes to OpenRouter on a person's behalf during the connect flow, and
// nothing else.
//
// **The rule this file exists to keep: a key that passes through here is never logged, never
// returned, never put in an error and never stored anywhere but the caller's own local. Every
// function below either returns a key to exactly one caller that immediately encrypts it, or
// returns a code.** There is no `console` call in this file and there must never be one — an
// error thrown by `fetch` can be caught and printed by a framework, so the key is not put into one
// either.
//
// Facts re-verified 2026-09-19 against OpenRouter's own documentation:
//
//   - Step 1 is a browser redirect to `https://openrouter.ai/auth?callback_url=…&code_challenge=…
//     &code_challenge_method=S256`, with `key_label` worth setting so the key is recognisable on
//     the person's own keys page.
//   - Step 2 is `POST https://openrouter.ai/api/v1/auth/keys` with
//     `{ code, code_verifier, code_challenge_method }`.
//   - **Codes are single-use and expire ten minutes after issuance.** Documented errors:
//     `400 Invalid code_challenge_method`, `403 Invalid code or code_verifier`,
//     `403 Authorization code expired`, `405 Method Not Allowed`. **Those statuses do not match
//     what the endpoint does.** Measured live on 2026-09-20: a refused code answers `400`, not
//     `403`. See `exchangeCode` for what is built against it.
//   - **Only `{ key }` is built against.** Every other field of that response is unverified, so
//     nothing here reads one.
//   - `GET https://openrouter.ai/api/v1/key` with the key as a Bearer token describes the key
//     itself. `limit_remaining` is **the key's own cap, not the account balance**: a connected
//     inference key cannot read the balance at all (`/api/v1/credits` needs a management key), so
//     nothing here presents a number as money in the account.

import { paymentRequiredKindOf } from "@pemby/ai";
import type { OpenRouterError } from "./view";

const AUTH_URL = "https://openrouter.ai/auth";
const KEYS_URL = "https://openrouter.ai/api/v1/auth/keys";
const KEY_URL = "https://openrouter.ai/api/v1/key";

/** OpenRouter is a third party on the far side of the internet; nothing waits on it forever. */
const TIMEOUT_MS = 15_000;

/** Shown on the person's own OpenRouter keys page, so they can tell what made this key. */
const KEY_LABEL = "Pemby";

/** Where the browser goes in step 1. Carries the challenge; never the verifier. */
export function authorizeUrl(input: { callbackUrl: string; challenge: string }): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("callback_url", input.callbackUrl);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("key_label", KEY_LABEL);
  return url.toString();
}

/**
 * The exchange. Returns the key to exactly one caller — the callback route, which encrypts it in
 * the next statement — or a code.
 *
 * **The documented statuses are wrong, and this is what it actually does.** OpenRouter's own docs
 * list `403 Invalid code or code_verifier` and `403 Authorization code expired`. Measured against
 * the live endpoint on 2026-09-20, a bad code answers
 * `400 {"error":{"message":"Invalid code","code":400}}` — and so does a request whose
 * `code_challenge_method` is `plain`, because the code is validated first. So **400 and 403 both
 * mean "that code was refused"** here, and `exchange_failed` is kept for a status that is neither.
 * Mapping only 403 would have told everyone whose approval had lapsed that OpenRouter returned no
 * key, which is a different problem with a different fix.
 *
 * Which of the refusals it was — spent, expired, or a verifier that did not match — is only in the
 * English message, and this file does not branch on message text. They collapse into
 * `code_rejected`, whose copy covers all three. Genuine expiry is caught earlier and more honestly
 * than OpenRouter can report it anyway: our own cookie dies at ten minutes, so a person who took
 * too long is told `start_expired` by our clock before a request is ever made.
 */
export async function exchangeCode(input: {
  code: string;
  verifier: string;
}): Promise<{ key: string } | { error: OpenRouterError }> {
  let response: Response;
  try {
    response = await fetch(KEYS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: input.code,
        code_verifier: input.verifier,
        code_challenge_method: "S256",
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    // The thrown error is dropped rather than inspected: it can carry the request init, and the
    // request init carries the verifier.
    return { error: "network" };
  }

  if (response.status === 400 || response.status === 403) return { error: "code_rejected" };
  if (!response.ok) return { error: "exchange_failed" };

  const body: unknown = await response.json().catch(() => null);
  const key = (body as { key?: unknown } | null)?.key;
  if (typeof key !== "string" || key.trim() === "") return { error: "exchange_failed" };
  return { key: key.trim() };
}

export interface KeyCheck {
  /** OpenRouter's own label for this key, when it gave one. Display only, never a credential. */
  label: string | null;
}

/**
 * Ask OpenRouter about the key itself: does it still exist, and can it still pay?
 *
 * This is the difference between "a row exists" and "a key works", and the product depends on the
 * distinction: `entitlementsFor` turns a stored row into an unlimited kit quota, and the kit path
 * must never quietly fall back to Pemby's own key when a user's key fails. A row survives the key
 * being revoked at OpenRouter, the account running out of credits, and the encryption secret being
 * rotated out from under the blob. So the key is checked when it is connected and whenever the
 * person asks, and what comes back is a code they can act on.
 *
 * **402 is three conditions, not one**, and which one decides whether waiting helps. The body is
 * unwrapped from its `{ error: … }` envelope before `paymentRequiredKindOf` sees it: that helper's
 * SDK-error branches unwrap for themselves, but the bare-object branch reads `code` and `metadata`
 * off the object it is handed, which for a raw `fetch` is the envelope.
 */
export async function checkKey(key: string): Promise<KeyCheck | { error: OpenRouterError }> {
  let response: Response;
  try {
    response = await fetch(KEY_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    // Dropped for the same reason as above: a `fetch` failure can carry the request, and the
    // request carries an Authorization header.
    return { error: "network" };
  }

  if (response.status === 401 || response.status === 403) return { error: "key_rejected" };

  if (response.status === 402) {
    const body: unknown = await response.json().catch(() => null);
    const envelope = (body ?? {}) as { error?: unknown };
    const inner = envelope.error ?? body;
    switch (paymentRequiredKindOf(inner)) {
      case "credits":
        return { error: "credits_exhausted" };
      case "key-limit":
        return { error: "key_limit_reached" };
      case "in-flight":
        return { error: "in_flight_retry" };
      default:
        // A 402 whose `limit_source` is absent or is not on the whitelist. Not classifiable, and
        // "not classifiable" is never "retry": the honest answer is that this key cannot pay.
        return { error: "credits_exhausted" };
    }
  }

  if (!response.ok) return { error: "unavailable" };

  const body: unknown = await response.json().catch(() => null);
  const data = (body as { data?: unknown } | null)?.data;
  if (data === null || typeof data !== "object") return { error: "unavailable" };

  const fields = data as { label?: unknown; limit_remaining?: unknown };
  // `limit_remaining` is this key's own cap, never the account balance. A cap that is spent is a
  // 402 waiting to happen on the first kit, so it is reported now rather than at generation time.
  if (typeof fields.limit_remaining === "number" && fields.limit_remaining <= 0) {
    return { error: "key_limit_reached" };
  }

  const label =
    typeof fields.label === "string" && fields.label.trim() !== "" ? fields.label.trim() : null;
  return { label: label === null ? null : label.slice(0, 120) };
}
