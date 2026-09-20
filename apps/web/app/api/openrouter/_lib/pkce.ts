// PKCE for OpenRouter's OAuth flow, and the cookie that carries the half of it the browser must
// never see.
//
// ============================================================================================
// WHAT THIS FILE IS DEFENDING AGAINST
// ============================================================================================
//
// The flow is: we send the person to `openrouter.ai/auth` with the SHA-256 of a secret we keep,
// they approve, OpenRouter sends their browser back to us with a one-time `code`, and we trade
// that code plus the secret for a key that can spend their money. Three things can go wrong, and
// each one is a separate mechanism below.
//
//   1. **The verifier leaks.** Then anyone holding a stolen `code` can complete the exchange. So
//      the verifier never reaches JavaScript, never reaches a URL and never reaches the page: it
//      lives in an `HttpOnly` cookie scoped to `/api/openrouter`, for the ten minutes the code is
//      valid and not a second longer.
//
//   2. **A code we did not ask for arrives at our callback.** `SameSite=Lax` is required here —
//      `Strict` is not sent on a cross-site top-level navigation, which is exactly what the return
//      from openrouter.ai is — so any site can navigate a signed-in person's browser to our
//      callback. PKCE already makes the attacker's code fail the exchange against *our* verifier,
//      but "already fails for a reason two hops away" is not a defence anybody can read, so the
//      callback also requires the `state` in its own path to equal the state in the cookie,
//      compared in constant time.
//
//   3. **The cookie itself is forged.** `HttpOnly` stops a script reading the cookie; it does not
//      stop one writing a cookie of the same name. Without a signature an attacker could plant
//      {their verifier, their state, the victim's user id} and then walk the victim's browser
//      through a callback carrying their own code — which would attach *their* OpenRouter key to
//      the victim's account, and every kit the victim then generates would be written through the
//      attacker's account. So the cookie is HMAC-signed and carries the user id it was minted for,
//      and the callback refuses a cookie whose user id is not the session in front of it. The
//      server only ever signs the id of the session that asked, so there is no way to obtain a
//      valid cookie naming somebody else.
//
// The signing key is `BETTER_AUTH_SECRET` under a domain-separating prefix. It is reused rather
// than added to because it is already required everywhere this route can run, it is already at
// least 32 characters, and a new variable is a new way for a deploy to be misconfigured. The
// prefix is what keeps this from being usable as, or against, a Better Auth signature.

import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { appEnv } from "@/lib/env";

/** Scoped to the routes that use it, so it is not sent with every request to the site. */
export const PKCE_COOKIE_NAME = "pemby_or_pkce";
const COOKIE_PATH = "/api/openrouter";

/**
 * Ten minutes, because that is exactly how long an OpenRouter authorization code is good for. A
 * cookie that outlived the code would keep a dead verifier on disk and turn "your approval took
 * too long" into "something went wrong at the exchange".
 */
export const PKCE_TTL_SECONDS = 600;

/** Domain separation: this HMAC is not a Better Auth signature and must never verify as one. */
const HMAC_PREFIX = "pemby.openrouter.pkce.v1";

const VERSION = 1;

export interface PkceChallenge {
  /** The secret half. Goes in the cookie and in the exchange body; never in a URL or a page. */
  verifier: string;
  /** base64url SHA-256 of the verifier. This is the half OpenRouter sees. */
  challenge: string;
  /** Random, one flow, carried in the callback's own path so it cannot be dropped by a redirect. */
  state: string;
}

/**
 * A fresh challenge.
 *
 * 32 bytes base64url is 43 characters, inside RFC 7636's 43-128 and drawn entirely from the
 * unreserved set, so nothing in it needs escaping in a cookie, a URL or a JSON body.
 */
export function createPkceChallenge(): PkceChallenge {
  const verifier = randomBytes(32).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier, "utf8").digest("base64url"),
    state: randomBytes(16).toString("base64url"),
  };
}

interface PkcePayload {
  v: number;
  /** The state. */
  s: string;
  /** The verifier. */
  c: string;
  /** The user id this flow was started by. */
  u: string;
  /** Expiry, epoch seconds. Checked here as well as by the cookie's own Max-Age. */
  e: number;
}

export interface PkceCookie {
  state: string;
  verifier: string;
  userId: string;
}

const sign = (secret: string, payload: string): string =>
  createHmac("sha256", secret).update(`${HMAC_PREFIX}.${payload}`, "utf8").digest("base64url");

function sameSignature(expected: string, given: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Constant-time equality for two opaque, same-length tokens. Exported for the state check. */
export function sameToken(expected: string, given: string): boolean {
  return sameSignature(expected, given);
}

/**
 * The signing secret, or null when this environment has none.
 *
 * Null is a 503 at the connect route, not a flow that starts without a signature: an unsigned
 * cookie is the forgery in case 3 above, and starting the flow anyway would send somebody to
 * OpenRouter to mint a real key we would then refuse to accept.
 */
export function pkceSigningSecret(): string | null {
  const secret = process.env.BETTER_AUTH_SECRET;
  return secret !== undefined && secret.length >= 32 ? secret : null;
}

/** The cookie value: a signed, base64url payload. Never readable by the page. */
export function mintPkceCookie(
  secret: string,
  { state, verifier, userId }: PkceCookie,
  now: Date,
): string {
  const payload: PkcePayload = {
    v: VERSION,
    s: state,
    c: verifier,
    u: userId,
    e: Math.floor(now.getTime() / 1000) + PKCE_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(secret, encoded)}`;
}

/**
 * The cookie's contents, or null for every kind of failure — absent, malformed, unsigned, signed
 * with another key, expired.
 *
 * One answer for all of them on purpose. Nothing downstream needs to tell "you took too long" from
 * "that signature is wrong", and a caller that could would be an oracle for the second one.
 */
export function readPkceCookie(
  secret: string,
  value: string | undefined,
  now: Date,
): PkceCookie | null {
  if (value === undefined || value.length === 0 || value.length > 1024) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts as [string, string];
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  if (!sameSignature(sign(secret, encoded), signature)) return null;

  let payload: PkcePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PkcePayload;
  } catch {
    return null;
  }
  if (payload.v !== VERSION) return null;
  if (typeof payload.s !== "string" || typeof payload.c !== "string") return null;
  if (typeof payload.u !== "string" || typeof payload.e !== "number") return null;
  if (payload.e * 1000 <= now.getTime()) return null;

  return { state: payload.s, verifier: payload.c, userId: payload.u };
}

/**
 * `Secure` everywhere but local development, where the site is served over http and a `Secure`
 * cookie would simply not be stored — which would look like "the flow lost its verifier" rather
 * than "this cookie was never set".
 */
function secureFlag(): string {
  return appEnv() === "development" ? "" : " Secure;";
}

export function setPkceCookieHeader(value: string): string {
  return `${PKCE_COOKIE_NAME}=${value}; Path=${COOKIE_PATH}; Max-Age=${PKCE_TTL_SECONDS}; HttpOnly;${secureFlag()} SameSite=Lax`;
}

/** Same name, same path: a clearing cookie that does not match both is ignored by the browser. */
export function clearPkceCookieHeader(): string {
  return `${PKCE_COOKIE_NAME}=; Path=${COOKIE_PATH}; Max-Age=0; HttpOnly;${secureFlag()} SameSite=Lax`;
}

/**
 * One cookie out of a `Cookie` header.
 *
 * Read from the header rather than through `next/headers`, so the same request object carries both
 * halves of the callback's check — the cookie and the path — and there is no second, implicit
 * source of request state to reason about.
 */
export function readCookie(header: string | null, name: string): string | undefined {
  if (header === null) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

/**
 * The absolute origin the callback URL is built from.
 *
 * `BETTER_AUTH_URL` first, because behind Railway's proxy the request's own URL is the internal
 * one and a callback built from it would send the person to a host that is not reachable from
 * their browser. It is required on staging and production (`lib/auth/server.ts`), so the fallback
 * only ever runs in development.
 */
export function appOrigin(request: Request): string {
  const configured = process.env.BETTER_AUTH_URL;
  if (configured !== undefined && configured.trim() !== "") {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through: a malformed value is `lib/auth/server.ts`'s problem to shout about, not a
      // reason for this route to throw a second, less informative error.
    }
  }
  return new URL(request.url).origin;
}
