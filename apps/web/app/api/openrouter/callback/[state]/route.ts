// Step 2: OpenRouter sends the person's browser back here with a one-time `code`.
//
// ============================================================================================
// EVERY WAY IN IS CHECKED BEFORE THE CODE IS SPENT
// ============================================================================================
//
// This is a `GET` that any website can navigate a signed-in person's browser to — `SameSite=Lax`
// has to allow it, because the legitimate arrival *is* a cross-site top-level navigation. So four
// things are true before the exchange happens, in this order:
//
//   1. There is a session, it is not anonymous, and it passes the same gate every other product
//      route passes.
//   2. The PKCE cookie is present, correctly signed, and unexpired. Absent or stale is
//      `start_expired`: the code is good for ten minutes and so is the cookie, so a person who
//      left the tab open over lunch is told that, rather than being sent into a failed exchange.
//   3. The state in *this route's own path* equals the state in the cookie, compared in constant
//      time. A code we did not ask for cannot satisfy this.
//   4. The cookie was minted for the session in front of us. Two accounts share a browser more
//      often than anyone expects, and without this check the second one finishes the first one's
//      flow and inherits the key.
//
// Only then is the code exchanged, and only if the resulting key answers for itself at
// `GET /api/v1/key` is it stored. A key that cannot be used is not written to the database: the
// row is what turns a free account into an unlimited kit quota, and a row standing for a key that
// does not work is the one state this feature must not produce.
//
// The cookie is cleared on **every** path out of here, success and failure alike. A verifier that
// outlives its flow is a verifier sitting in a browser waiting for a stolen code.

import { isAnonymous } from "@/app/api/profile/_lib/http";
import { getProductAccess } from "@/lib/auth/session";
import { storeKey } from "../../_lib/db";
import { checkKey, exchangeCode } from "../../_lib/openrouter";
import {
  appOrigin,
  clearPkceCookieHeader,
  PKCE_COOKIE_NAME,
  pkceSigningSecret,
  readCookie,
  readPkceCookie,
  sameToken,
} from "../../_lib/pkce";
import type { OpenRouterError } from "../../_lib/view";
import { OPENROUTER_CONNECTED } from "../../_lib/view";

/**
 * Back to `/settings` with the outcome in the query, because the person is arriving as a
 * navigation and a JSON body would leave them looking at one. The code is a stable token the page
 * maps to a sentence (docs/conventions.md, i18n), never a message.
 */
function back(request: Request, outcome: OpenRouterError | typeof OPENROUTER_CONNECTED): Response {
  const url = new URL("/settings", appOrigin(request));
  url.searchParams.set("openrouter", outcome);
  return new Response(null, {
    status: 303,
    headers: {
      Location: url.toString(),
      "Cache-Control": "no-store",
      "Set-Cookie": clearPkceCookieHeader(),
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ state: string }> },
): Promise<Response> {
  const access = await getProductAccess(request.headers);
  if (access.status !== "ok") {
    // A navigation, so this is a redirect to the sign-in page rather than a 401 body. Signing in
    // and coming back will not rescue this attempt — the code is single-use and will have expired
    // — but it puts the person somewhere they can start again.
    const url = new URL(
      access.status === "unauthenticated" ? "/sign-in" : "/settings",
      appOrigin(request),
    );
    return new Response(null, {
      status: 303,
      headers: {
        Location: url.toString(),
        "Cache-Control": "no-store",
        "Set-Cookie": clearPkceCookieHeader(),
      },
    });
  }
  if (isAnonymous(access.session)) return back(request, "forbidden");

  const signingSecret = pkceSigningSecret();
  if (signingSecret === null) return back(request, "secret_unavailable");

  const cookie = readPkceCookie(
    signingSecret,
    readCookie(request.headers.get("cookie"), PKCE_COOKIE_NAME),
    new Date(),
  );
  if (cookie === null) return back(request, "start_expired");

  const { state } = await context.params;
  if (!sameToken(cookie.state, state)) return back(request, "state_mismatch");
  if (!sameToken(cookie.userId, access.session.user.id)) return back(request, "state_mismatch");

  const code = new URL(request.url).searchParams.get("code");
  if (code === null || code.trim() === "") return back(request, "no_code");

  const exchanged = await exchangeCode({ code: code.trim(), verifier: cookie.verifier });
  if ("error" in exchanged) return back(request, exchanged.error);

  // The key exists from here to the end of this function and nowhere else. It is not logged, not
  // put in a response, and not held beyond `storeKey`, which encrypts it and drops it.
  const checked = await checkKey(exchanged.key);
  if ("error" in checked) return back(request, checked.error);

  const stored = await storeKey({
    userId: access.session.user.id,
    key: exchanged.key,
    label: checked.label,
  });
  if ("error" in stored) return back(request, stored.error);

  return back(request, OPENROUTER_CONNECTED);
}
