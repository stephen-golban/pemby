// One-click unsubscribe (RFC 8058).
//
// The RFC is short and specific, and the whole point of it is the method. A mailbox provider that
// sees both
//
//     List-Unsubscribe: <https://pemby.app/api/unsubscribe?t=…>, <mailto:…>
//     List-Unsubscribe-Post: List-Unsubscribe=One-Click
//
// shows its own unsubscribe control and, when it is pressed, sends a **POST** to that https URI
// with the body `List-Unsubscribe=One-Click`, expecting a 200 or 202 and no content. It sends a
// POST precisely because a GET is not safe to issue: spam filters, link scanners and inboxes that
// pre-render follow every URL in a message, and if a GET here unsubscribed people, the first
// corporate mail gateway to read one of these emails would silence its own user.
//
// So: this route has no GET that changes anything, and `/unsubscribe` — the page a person lands on
// when they press the link in the body rather than the client's own button — renders a button and
// posts here too.
//
// This route is deliberately unauthenticated. There is no session in a mailbox; the token in the
// query string is the credential, and `_lib/token.ts` says what it is built to withstand.
//
// **Two things this never answers.** It never says whether the channel existed, and it never
// echoes an address. A blank 200 for "we switched it off" and a blank 200 for "there was nothing
// to switch off" are the same answer on purpose: the person's intent is satisfied either way, and
// the difference is only useful to someone probing with a token that is not theirs.

import { verifyEmailLinkToken } from "@pemby/core";
import { disableEmailChannel } from "./_lib/db";
import { emailLinkSecret } from "./_lib/secret";

/**
 * Every code this route can answer with. Codes, never sentences (docs/conventions.md).
 *
 * Exported for the same reason `PROFILE_ERRORS` and `BRIEF_ERRORS` are: the list is the contract,
 * and a caller mapping a code to a message should be able to see all of them in one place. There
 * is no such caller yet — a mailbox provider reads the status, not the body — and the page posts
 * from JavaScript that only checks `response.ok`.
 */
export const UNSUBSCRIBE_ERRORS = ["invalid_token", "unavailable"] as const;
type UnsubscribeError = (typeof UNSUBSCRIBE_ERRORS)[number];

const NO_STORE = { "Cache-Control": "no-store" } as const;

function fail(error: UnsubscribeError, status: number): Response {
  return Response.json({ error }, { status, headers: NO_STORE });
}

/** What RFC 8058 asks for: a success with nothing in it. */
function done(): Response {
  return new Response(null, { status: 200, headers: NO_STORE });
}

export async function POST(request: Request): Promise<Response> {
  const secret = emailLinkSecret();
  if (!secret) return fail("unavailable", 503);

  const token = new URL(request.url).searchParams.get("t") ?? "";
  const claims = verifyEmailLinkToken(secret, token, "unsubscribe", new Date());
  if (!claims) return fail("invalid_token", 400);

  try {
    await disableEmailChannel(claims.subject, claims.userId);
  } catch {
    // The error is not inspected and not logged: a database error here can carry a row value, and
    // a row value here is an email address (PLAN: personal data never reaches a log line).
    return fail("unavailable", 503);
  }
  return done();
}

/**
 * A GET reaches here only from something following the link rather than pressing it. It is refused
 * rather than redirected, so there is exactly one place in this feature where a GET could be
 * mistaken for an action, and it is this one, and it does nothing.
 */
export function GET(): Response {
  return new Response(null, { status: 405, headers: { ...NO_STORE, Allow: "POST" } });
}
