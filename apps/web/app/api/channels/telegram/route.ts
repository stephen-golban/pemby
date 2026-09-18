import { isAnonymous } from "@/app/api/profile/_lib/http";
import { disconnectTelegram, loadChannelSettings, mintTelegramDeepLink } from "../_lib/db";
import { authorize, fail, json } from "../_lib/http";
import type { ChannelSettingsView, TelegramLink } from "../_lib/view";

/**
 * Connecting and disconnecting Telegram (PLAN D8).
 *
 * `POST` mints a one-time deep link and answers it **once**. The token in that URL is the whole
 * credential — whoever opens it binds their Telegram chat to this account — so it is handled the
 * way a password-reset link is: minted fresh on every request, retiring the account's previous
 * one, stored only as a SHA-256, never logged, never readable back, and spent on first use by the
 * bot. A caller who loses the URL asks for another; nothing can recover the old one.
 *
 * `DELETE` unlinks the chat by removing the row.
 */

export async function POST(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (isAnonymous(auth.session)) return fail("forbidden", 403);

  const link = await mintTelegramDeepLink(auth.session.user.id);
  // Null means TELEGRAM_BOT_USERNAME is not set in this environment. A deployment fact, reported
  // as its own code so the page can say "not available here" instead of "something went wrong".
  if (!link) return fail("telegram_unavailable", 503);

  const body: TelegramLink = { url: link.url, expiresAt: link.expiresAt.toISOString() };
  return json(body);
}

export async function DELETE(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (isAnonymous(auth.session)) return fail("forbidden", 403);

  await disconnectTelegram(auth.session.user.id);
  const body: ChannelSettingsView = await loadChannelSettings(auth.session.user.id);
  return json(body);
}
