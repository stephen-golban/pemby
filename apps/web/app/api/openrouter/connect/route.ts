// Step 1 of the OAuth flow: mint a PKCE challenge, put the secret half in an httpOnly cookie, and
// tell the browser where to go.
//
// A `POST` that answers with a URL rather than a `GET` that redirects, for two reasons. The first
// is that starting the flow sets a cookie and mints a credential-shaped secret, and that is a
// deliberate act, not something a prefetching client or a scanner should be able to perform by
// following a link. The second is that the page needs to be able to *fail* here and say why — an
// environment with no `AI_USER_KEY_SECRET` cannot store a key, and the honest thing is to say so
// before sending somebody to OpenRouter to create a real key against their own account that Pemby
// would then have to throw away.
//
// The verifier is created here and appears in exactly two places afterwards: the signed cookie,
// and the exchange request body in the callback. It is never in the returned URL, never in the
// page, and never in a log.

import { assertUserKeySecret, UserKeyError } from "@pemby/ai";
import { isAnonymous } from "@/app/api/profile/_lib/http";
import { authorize, fail } from "../_lib/http";
import { authorizeUrl } from "../_lib/openrouter";
import {
  appOrigin,
  createPkceChallenge,
  mintPkceCookie,
  pkceSigningSecret,
  setPkceCookieHeader,
} from "../_lib/pkce";
import type { OpenRouterAuthStart } from "../_lib/view";

export async function POST(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (isAnonymous(auth.session)) return fail("forbidden", 403);

  // Both secrets are checked before a single byte goes to OpenRouter. `assertUserKeySecret` is
  // also called at boot (`instrumentation.ts`), so reaching this branch on a healthy deploy is not
  // expected — but "not expected" is not "cannot", and the cost of being wrong is an orphaned key
  // on somebody else's account.
  try {
    assertUserKeySecret();
  } catch (error) {
    if (error instanceof UserKeyError) return fail("secret_unavailable", 503);
    throw error;
  }
  const signingSecret = pkceSigningSecret();
  if (signingSecret === null) return fail("secret_unavailable", 503);

  const { verifier, challenge, state } = createPkceChallenge();
  // The state travels in the callback's own path rather than its query. OpenRouter's contract is
  // that it appends `code` to `callback_url`; whether it preserves an existing query string is not
  // documented, and a CSRF check that silently stops arriving is worse than no check at all.
  const callbackUrl = `${appOrigin(request)}/api/openrouter/callback/${state}`;

  const body: OpenRouterAuthStart = { url: authorizeUrl({ callbackUrl, challenge }) };
  return Response.json(body, {
    headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": setPkceCookieHeader(
        mintPkceCookie(
          signingSecret,
          { state, verifier, userId: auth.session.user.id },
          new Date(),
        ),
      ),
    },
  });
}
