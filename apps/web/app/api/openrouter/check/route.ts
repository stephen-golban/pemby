// "Does the key you connected still work?" — asked on demand from `/settings`.
//
// This route exists because **a row means a key exists, not that a key works**, and the difference
// is money. A stored row turns a free account's kit quota into "unlimited" (`entitlementsFor`), and
// the kit path is forbidden from quietly falling back to Pemby's own key when a user's key fails —
// so a row standing for a revoked, unfunded or undecryptable key would otherwise be discovered by
// somebody in the middle of generating an application kit, with nothing on the settings page
// suggesting anything was wrong.
//
// The row survives all three of those independently: the person can revoke the key at OpenRouter,
// the account can run out of credits, and rotating `AI_USER_KEY_SECRET` makes every stored blob
// unreadable. Each has its own code, because each has a different thing the person can do about it.
//
// `POST`, not `GET`: it decrypts a secret and makes an outbound request with it, which is not
// something a prefetch or a page scanner gets to trigger. It answers with a code and a view, never
// with the key, and never with a number presented as an account balance — a connected inference key
// cannot read the balance at all.

import { isAnonymous } from "@/app/api/profile/_lib/http";
import { loadKeyView, readKey } from "../_lib/db";
import { authorize, fail, json } from "../_lib/http";
import { checkKey } from "../_lib/openrouter";
import type { OpenRouterKeyView } from "../_lib/view";

export async function POST(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (isAnonymous(auth.session)) return fail("forbidden", 403);

  const stored = await readKey(auth.session.user.id);
  if ("error" in stored) return fail(stored.error, stored.error === "not_connected" ? 404 : 503);

  const checked = await checkKey(stored.key);
  if ("error" in checked) {
    // 402 and a revoked key are both "your key, your account, your move": 409, because the request
    // was understood and the conflict is with the state of something Pemby does not control.
    return fail(checked.error, checked.error === "network" ? 502 : 409);
  }

  const view: OpenRouterKeyView = await loadKeyView(auth.session.user.id);
  return json(view);
}
