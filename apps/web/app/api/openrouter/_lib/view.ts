// The shape `/settings` reads for a connected OpenRouter account, and the stable codes
// `/api/openrouter/*` answers with (docs/conventions.md: bodies carry codes, never sentences).
//
// **What is deliberately not in this file.** There is no field here that could hold the key, the
// ciphertext, or anything derived from either except `keyHash`, and `keyHash` is here because the
// only two pages that can act on a user's key are OpenRouter's own and they are keyed on it. The
// view is built from `selectUserAiKeyStatus`, which does not select the ciphertext column at all,
// so there is no path from this type to a secret even by mistake.

/**
 * What the settings page may know about a connected key.
 *
 * `keyHash` is the lower-case hex SHA-256 of the key. It is not a credential and it cannot be
 * turned back into one: it exists so the page can link the person to
 * `https://openrouter.ai/keys/<hash>`, which resolves only for the signed-in owner and is the only
 * place the key can actually be revoked. Pemby cannot revoke it — `DELETE /api/v1/keys/{hash}`
 * needs a management key on the user's own account — so the hash is what makes "disconnect" an
 * honest instruction instead of a claim.
 */
export interface OpenRouterKeyView {
  connected: boolean;
  /** OpenRouter's own label for the key, when it gave one. Display only. */
  label: string | null;
  keyHash: string | null;
  /** ISO 8601, or null when no key is connected. */
  connectedAt: string | null;
  /** ISO 8601 of the last model call made on this key, or null when it has not been used. */
  lastUsedAt: string | null;
}

/** What `POST /api/openrouter/connect` answers: where to send the browser, and nothing else. */
export interface OpenRouterAuthStart {
  /** `https://openrouter.ai/auth?...`. The PKCE verifier behind it is in an httpOnly cookie. */
  url: string;
}

/**
 * Every code these routes answer with, and every code the callback can put in `?openrouter=`.
 *
 * The client's messages are keyed by exactly these, so a code added here without a message is a
 * typecheck failure in `messages/en/settings.json` rather than a blank line on the page.
 */
export const OPENROUTER_ERRORS = [
  "unauthenticated",
  "forbidden",
  /** `AI_USER_KEY_SECRET` is absent or is not 32 bytes of base64 in this environment. */
  "secret_unavailable",
  /** Asked to check or disconnect a key that is not there. */
  "not_connected",
  /** The stored blob will not decrypt: the secret was rotated, or the row was tampered with. */
  "key_undecryptable",
  /** OpenRouter refused the key itself — revoked, or deleted on their side. */
  "key_rejected",
  /** 402 `openrouter_credits`: the account balance cannot cover a request. Not retryable. */
  "credits_exhausted",
  /** 402 `openrouter_key_limit`: this key's own cap is spent. Not retryable. */
  "key_limit_reached",
  /** 402 `openrouter_in_flight_budget`: transient. The one 402 worth trying again. */
  "in_flight_retry",
  /** The callback arrived with no `code` in the query. */
  "no_code",
  /** No PKCE cookie, or it had expired. The code is good for ten minutes and so is the cookie. */
  "start_expired",
  /** The state in the callback path is not the state we issued for this session. */
  "state_mismatch",
  /** OpenRouter refused the exchange: a spent code, an expired one, or a verifier mismatch. */
  "code_rejected",
  /** OpenRouter answered the exchange with something that was not a key. */
  "exchange_failed",
  "unavailable",
  "network",
] as const;
export type OpenRouterError = (typeof OPENROUTER_ERRORS)[number];

/** The callback's redirect carries one of these in `?openrouter=`; `connected` is the good one. */
export const OPENROUTER_CONNECTED = "connected";

export function isOpenRouterError(value: string): value is OpenRouterError {
  return (OPENROUTER_ERRORS as readonly string[]).includes(value);
}
