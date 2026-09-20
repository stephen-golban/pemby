// `GET` the state of a connected OpenRouter account; `DELETE` to disconnect it (PLAN D17).
//
// Neither verb can return a key. `GET` is built from `selectUserAiKeyStatus`, which does not read
// the ciphertext column; `DELETE` removes the row and answers with the same view, now empty.
//
// **`DELETE` is not a revocation and this route does not pretend otherwise.** Pemby holds an
// inference key, and `DELETE /api/v1/keys/{hash}` at OpenRouter needs a management key on the
// user's own account, which Pemby will never have. Deleting our copy stops Pemby using the key and
// does nothing to the key itself, which stays live until the person revokes it at OpenRouter.
//
// The row is gone after this, and with it the hash that builds the link to the page where they can
// do that — so the answer here is a genuinely empty view, and it is the *page* that keeps the hash
// it was already holding in order to show that link afterwards (`_shared/use-openrouter.ts`). The
// alternative, a response that keeps returning a hash for a row that no longer exists, would make
// "connected: false" mean two different things depending on how you got there.

import { isAnonymous } from "@/app/api/profile/_lib/http";
import { forgetKey, loadKeyView } from "./_lib/db";
import { authorize, fail, json } from "./_lib/http";
import type { OpenRouterKeyView } from "./_lib/view";

export async function GET(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (isAnonymous(auth.session)) return fail("forbidden", 403);

  const view: OpenRouterKeyView = await loadKeyView(auth.session.user.id);
  return json(view);
}

export async function DELETE(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (isAnonymous(auth.session)) return fail("forbidden", 403);

  await forgetKey(auth.session.user.id);

  const body: OpenRouterKeyView = await loadKeyView(auth.session.user.id);
  return json(body);
}
