// Signed, expiring links that work from inside a mailbox, with no session.
//
// The two things an email can ask someone to do — stop these emails, report this post — have to
// work months later, on a phone, in a client that has never seen a Pemby cookie, and from a person
// who may never sign in again. A session is therefore not available and a bare user id in the URL
// is not acceptable, so the link carries a token that says who it is for, what it is for, what it
// is about and when it stops working, signed with a key only the server has.
//
// **Wire format**, five dot-separated fields and a signature over all five:
//
//     v1 . <purpose> . <base64url(userId)> . <base64url(subject)> . <expiry seconds> . <signature>
//
// `purpose` is `u` or `f`; `subject` is the channel id for an unsubscribe and the match id for a
// flag. The signature is base64url HMAC-SHA256 over the five preceding fields exactly as they
// appear, so nothing in the token can be edited — including the purpose, which is why an
// unsubscribe token presented at the flag endpoint is refused rather than being a second way in.
//
// **The three attacks this is built against.**
//
//   - *Forgery.* HMAC-SHA256 under `DELIVERY_LINK_SECRET` (at least 32 characters, or the routes
//     answer `unavailable`). No part of the token is trusted before the signature verifies, the
//     comparison is `timingSafeEqual` over equal-length buffers, and the version and purpose are
//     inside the signed region.
//   - *Prefetch.* A signature does not stop a link being followed by a spam filter, a corporate
//     scanner or an inbox that pre-renders. Nothing here makes that safe; what makes it safe is
//     that **no GET in this feature mutates anything.** Verification is a pure function, the GET
//     surfaces render a confirmation, and the writes live behind POST — which is also exactly what
//     RFC 8058 requires of one-click unsubscribe.
//   - *Replay.* A stateless token cannot be single-use, so the two actions are built so that
//     replaying one is a no-op rather than an escalation: disabling a channel that is already
//     disabled is the same state, and a second flag on the same job for the same reason hits
//     `flags_job_user_reason_uq` and the per-user daily window in `rate_limits`. Expiry bounds the
//     window in which a token pulled out of a forwarded email is worth anything at all.
//
// **Both halves live here, in `@pemby/core`, and that is the whole point of the file's location.**
// The worker mints and `apps/web` verifies, and those are different processes in different
// packages; the only thing they can both import is this one. A signing format kept in two copies
// fails in the worst possible way — a one-sided edit to a separator, a field or the version makes
// every link in every email already sitting in someone's inbox answer `invalid_token`, with
// nothing failing at build time and nothing failing in CI.
//
// It takes the secret as an argument and never reads the environment, so the package stays pure:
// resolving `DELIVERY_LINK_SECRET` belongs to whichever service is running
// (`apps/web/app/api/unsubscribe/_lib/secret.ts`, `apps/worker/src/deliver/env.ts`).
//
// **On the user id in the payload.** It is there because it is load-bearing, not decorative: it is
// the second half of a signed pair, and both routes re-check it against the row they are about to
// change. The dispatcher pairs a channel to a match through `channelByUser.get(row.userId)` across
// two separate reads, so "this token names a channel that is not this user's" is a real state to
// be able to refuse — and refusing it turns "the wrong account was unsubscribed" into "the link
// did nothing". What it costs is that a forwarded email discloses an opaque, random, non-credential
// account id to whoever reads it. The contract's "never put a user id in the payload" rule is
// about the Telegram deep link, where the token is typed into a public bot and *binds* a chat to an
// account; nothing here is a binding primitive. The alternative that keeps the pair check and drops
// the disclosure is to sign over the user id without transmitting it and recover it from the row at
// verification time — about twenty lines, at the price of two-phase verification that cannot answer
// "is this link still good?" without a database read.

import { createHmac, timingSafeEqual } from "node:crypto";

export const EMAIL_LINK_PURPOSES = ["unsubscribe", "flag"] as const;
export type EmailLinkPurpose = (typeof EMAIL_LINK_PURPOSES)[number];

/** One character in the URL rather than a word, because every byte of a token is in the link. */
const PURPOSE_CODE: Record<EmailLinkPurpose, string> = { unsubscribe: "u", flag: "f" };

const VERSION = "v1";

/**
 * How long each link stays good.
 *
 * Unsubscribe outlives the mail it came in: a person who finds a three-month-old Pemby email and
 * presses the client's own unsubscribe button must be unsubscribed, because the alternative is
 * that they press "report spam" instead, and that costs the sending domain far more than a long
 * window ever could. A flag is a statement about a job post, and a job post three months old is
 * not the post that was matched, so that link expires sooner.
 */
export const EMAIL_LINK_TTL_SECONDS: Record<EmailLinkPurpose, number> = {
  unsubscribe: 120 * 24 * 3600,
  flag: 30 * 24 * 3600,
};

export interface EmailLinkClaims {
  purpose: EmailLinkPurpose;
  /** The account the link belongs to. Never trusted until the signature has verified. */
  userId: string;
  /** Channel id for `unsubscribe`, match id for `flag`. */
  subject: string;
  expiresAt: Date;
}

const encode = (value: string): string => Buffer.from(value, "utf8").toString("base64url");

function decode(value: string): string | null {
  if (value === "" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const text = Buffer.from(value, "base64url").toString("utf8");
  // Round-trip: base64url is forgiving about padding and alphabet, and a value that does not
  // re-encode to itself is not the value that was signed.
  return text !== "" && encode(text) === value ? text : null;
}

const sign = (secret: string, payload: string): string =>
  createHmac("sha256", secret).update(payload, "utf8").digest("base64url");

/**
 * Mint a link token. Called by whatever builds `EmailContext` — today the dispatcher in
 * `apps/worker/src/deliver/`.
 */
export function mintEmailLinkToken(
  secret: string,
  claims: { purpose: EmailLinkPurpose; userId: string; subject: string; issuedAt: Date },
): string {
  const expiry =
    Math.floor(claims.issuedAt.getTime() / 1000) + EMAIL_LINK_TTL_SECONDS[claims.purpose];
  const payload = [
    VERSION,
    PURPOSE_CODE[claims.purpose],
    encode(claims.userId),
    encode(claims.subject),
    String(expiry),
  ].join(".");
  return `${payload}.${sign(secret, payload)}`;
}

/** Equal-length constant-time comparison. `timingSafeEqual` throws on a length mismatch. */
function sameSignature(expected: string, given: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verify a token for one purpose, or null.
 *
 * Pure and read-only, which is what lets a GET surface show "this link has expired" without
 * touching the database — and what keeps a prefetching client from changing anything.
 *
 * Deliberately one answer for every kind of failure. A caller that could tell "wrong signature"
 * from "expired" from "not for this endpoint" would be an oracle, and there is nothing a reader of
 * their own email needs that distinction for.
 */
export function verifyEmailLinkToken(
  secret: string,
  token: string,
  purpose: EmailLinkPurpose,
  now: Date,
): EmailLinkClaims | null {
  if (token.length === 0 || token.length > 512) return null;

  const parts = token.split(".");
  if (parts.length !== 6) return null;
  const [version, code, userPart, subjectPart, expiryPart, signature] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  if (version !== VERSION || code !== PURPOSE_CODE[purpose]) return null;
  if (!sameSignature(sign(secret, parts.slice(0, 5).join(".")), signature)) return null;

  if (!/^[0-9]{1,12}$/.test(expiryPart)) return null;
  const expiresAt = new Date(Number(expiryPart) * 1000);
  if (expiresAt.getTime() <= now.getTime()) return null;

  const userId = decode(userPart);
  const subject = decode(subjectPart);
  if (userId === null || subject === null) return null;
  if (userId.length > 128 || subject.length > 128) return null;

  return { purpose, userId, subject, expiresAt };
}

/**
 * The shortest a signing key may be, in characters.
 *
 * Here rather than beside either reader of the environment, so the worker and the web app cannot
 * disagree about what counts as configured — a service that accepted a shorter key than the other
 * would sign links the other refuses.
 */
export const EMAIL_LINK_SECRET_MIN_LENGTH = 32;
