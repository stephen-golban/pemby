import { isAnonymous } from "@/app/api/profile/_lib/http";
import { deletePushChannels, loadChannelSettings, upsertPushChannel } from "../_lib/db";
import { authorize, fail, json } from "../_lib/http";
import { parseSubscription } from "../_lib/validate";
import type { ChannelSettingsView } from "../_lib/view";

/**
 * One browser's web-push subscription (PLAN D8).
 *
 * `POST` stores or refreshes it; `DELETE` forgets it. Both answer the whole settings view, so the
 * page reconciles its optimistic state in the same round trip it mutates in.
 *
 * The body is a `PushSubscription.toJSON()`: an endpoint URL and the two ECDH keys the browser
 * generated. All three are personal data and none of them is logged. They are stored in
 * `channels.address` and `channels.push_keys`, which is where the dispatcher reads them from.
 *
 * `POST` is idempotent by design and is expected to repeat: `pushManager.subscribe()` hands back
 * the same endpoint on every call for a given registration, and a push service may rotate an
 * endpoint at any time. `channels_type_address_uq` turns both cases into an update.
 *
 * **Holding an endpoint is not owning it.** When the endpoint already belongs to another account
 * this route changes nothing and answers `subscription_taken`, which tells the browser to
 * unsubscribe and subscribe again for an endpoint of its own. The reasoning, and why a takeover
 * used to happen silently on a shared browser, is in `upsertPushChannel`.
 */

export async function POST(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (isAnonymous(auth.session)) return fail("forbidden", 403);

  const subscription = parseSubscription(await request.json().catch(() => null));
  if (!subscription) return fail("invalid_subscription", 400);

  const stored = await upsertPushChannel(
    auth.session.user.id,
    subscription.endpoint,
    subscription.keys,
  );
  if (!stored) return fail("subscription_taken", 409);

  const body: ChannelSettingsView = await loadChannelSettings(auth.session.user.id);
  return json(body);
}

/**
 * Forget a subscription: `{ endpoint }` for one browser, or `{ scope: "others", endpoint? }` for
 * every browser on the account **except** the one making the request — the one way back for
 * somebody who no longer has the device that is still being pushed to.
 *
 * "Others" and not "all" because the page's switch is what turns this browser off, and a delete
 * that quietly took the caller's own row with it would leave the page saying push was on here
 * while the account had no push channel at all.
 */
export async function DELETE(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (isAnonymous(auth.session)) return fail("forbidden", 403);

  const body: unknown = await request.json().catch(() => null);
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const endpoint =
    typeof record.endpoint === "string" && record.endpoint.length > 0 ? record.endpoint : null;

  if (record.scope === "others") {
    await deletePushChannels(auth.session.user.id, { keep: endpoint });
  } else if (endpoint) {
    await deletePushChannels(auth.session.user.id, { endpoint });
  } else {
    return fail("invalid_subscription", 400);
  }

  const view: ChannelSettingsView = await loadChannelSettings(auth.session.user.id);
  return json(view);
}
