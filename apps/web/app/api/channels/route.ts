import { isAnonymous } from "@/app/api/profile/_lib/http";
import { loadChannelSettings, pauseDelivery, setChannelEnabled, setQuietHours } from "./_lib/db";
import { authorize, fail, json } from "./_lib/http";
import { parseChannelPatch } from "./_lib/validate";
import type { ChannelSettingsView } from "./_lib/view";

/**
 * The channel settings of the signed-in user (PLAN D8): which channels are live, the one quiet
 * window they share, and whether delivery is held.
 *
 * `GET` answers the whole view; `PATCH` takes any subset of the switches and answers the view as it
 * now stands, so an optimistic client reconciles in one round trip — the same contract as
 * `/api/profile`. Never cached: this is someone's own data.
 *
 * Push is not patchable here. Its switch is one browser's subscription, and only that browser can
 * create or revoke it; `/api/channels/push` takes it with the subscription in hand.
 */

export async function GET(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  // Delivery needs an account. An anonymous session (PLAN D4) is deleted with its CV after 24
  // hours, so binding a Telegram chat or a mailbox to one promises what the account cannot keep.
  if (isAnonymous(auth.session)) return fail("forbidden", 403);

  const body: ChannelSettingsView = await loadChannelSettings(auth.session.user.id);
  return json(body);
}

export async function PATCH(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (isAnonymous(auth.session)) return fail("forbidden", 403);

  const body: unknown = await request.json().catch(() => null);
  const parsed = parseChannelPatch(body);
  if (!parsed.ok) return fail("invalid_patch", 400);

  const { id, email } = auth.session.user;
  const { patch } = parsed;

  // Sequential rather than concurrent: `quiet` writes every channel row and `email` may create
  // one, so running them at once could leave a fresh row without the window the same request set.
  if (patch.telegram !== undefined) await setChannelEnabled(id, "telegram", patch.telegram, null);
  if (patch.email !== undefined) await setChannelEnabled(id, "email", patch.email, email);
  if (patch.quiet !== undefined) await setQuietHours(id, patch.quiet);
  if (patch.paused !== undefined) await pauseDelivery(id, patch.paused);

  return json(await loadChannelSettings(id));
}
