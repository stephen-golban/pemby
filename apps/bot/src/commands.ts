// The six commands (PLAN D8): /start, /pause, /resume, /quiet, /help, /brief.
//
// Every reply is plain text from `@pemby/core`'s delivery string table. No `parse_mode` is set on
// any of them, which is what makes that safe: the table is English prose, a user's own time zone
// name is the only value ever substituted into it, and a bot that sets `parse_mode: "HTML"` on a
// message it did not escape is one apostrophe away from a failed send.
//
// Nothing here logs a chat id, a name or the text of a message.

import { renderDeliveryString } from "@pemby/core";
import type { BotLinks } from "./links";
import { safeErrorLabel } from "./log";
import type { BotStore } from "./store";
import type { BotContext } from "./types";

/** The command list Telegram shows in the menu, scoped to private chats at boot. */
export const BOT_COMMANDS = [
  { command: "brief", description: "Open your Brief" },
  { command: "pause", description: "Stop delivery" },
  { command: "resume", description: "Start delivery again" },
  { command: "quiet", description: "Set quiet hours" },
  { command: "help", description: "What this bot does" },
] as const;

/** Telegram's own alphabet for a `start` payload, and the 64-character cap on it. */
const START_PAYLOAD_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** `H:MM` or `HH:MM`, 00:00 to 23:59. */
const CLOCK_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const MINUTES_PER_DAY = 24 * 60;

function parseClock(value: string): number | null {
  const match = CLOCK_RE.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatClock(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Plain text, no link preview: a card's own preview is the dispatcher's business, not a reply's. */
async function say(ctx: BotContext, text: string): Promise<void> {
  await ctx.reply(text, { link_preview_options: { is_disabled: true } });
}

export interface CommandDeps {
  store: BotStore;
  links: BotLinks;
}

/**
 * `/start`, with or without a deep-link token.
 *
 * Every branch is a reply the user can act on, because the alternatives to a token redeeming are
 * all things they can fix: an expired link, a link already used, or no link at all. None of the
 * replies says *which*, and none echoes the payload back.
 */
export async function onStart(
  ctx: BotContext,
  deps: CommandDeps,
  payload: string,
): Promise<string> {
  const chatId = String(ctx.chat?.id ?? "");
  if (!chatId) return "no-chat";

  const token = payload.trim();
  if (token === "") {
    const linked = await deps.store.chat(chatId);
    await say(
      ctx,
      linked
        ? renderDeliveryString("start-already-connected")
        : renderDeliveryString("start-no-token", { url: deps.links.settings }),
    );
    return linked ? "already-connected" : "no-token";
  }

  // Refused here rather than in a query: a payload that cannot be a token is not worth a database
  // round trip, and `consumeTelegramLinkToken` would only hash it and find nothing.
  if (!START_PAYLOAD_RE.test(token)) {
    await say(ctx, renderDeliveryString("start-token-invalid", { url: deps.links.settings }));
    return "invalid-token";
  }

  const outcome = await deps.store.link({ token, chatId, now: new Date() });
  if (outcome.kind === "invalid-token") {
    await say(ctx, renderDeliveryString("start-token-invalid", { url: deps.links.settings }));
    return "invalid-token";
  }

  /**
   * Three outcomes, three replies. `rebound-account` used to share `start-connected` with an
   * ordinary link, and that is the whole of the bug: a deep link is a bearer credential, so an
   * attacker can mint one for their own account, send it to somebody, and have one tap unbind
   * that person's Telegram and point their chat at the attacker's matches — while the bot says
   * "Connected. Your matches will arrive here."
   *
   * The move is still allowed, for the reason `store-db.ts` gives, but it now names what it did
   * and how to undo it. This is the reply the person holding the chat sees, which is the right
   * place for it: in the attack that matters they are the victim, and they are reading this.
   */
  await say(
    ctx,
    outcome.kind === "rebound-account"
      ? renderDeliveryString("start-moved", { url: deps.links.settings })
      : outcome.kind === "already-linked"
        ? renderDeliveryString("start-already-connected")
        : renderDeliveryString("start-connected"),
  );

  await notifyDisconnected(ctx, deps, outcome.disconnected);
  return outcome.kind;
}

/**
 * Tell the chats that just lost this account's binding.
 *
 * This is the only warning the *other* side of a move ever gets inside Telegram. A leaked token
 * for an account, redeemed in somebody else's chat, moves that account wholesale and leaves its
 * real owner's chat silently receiving nothing; the reply to the new chat goes to whoever redeemed
 * it, so without this the owner learns only by opening the settings page and noticing.
 *
 * Every send is allowed to fail on its own. The old chat may have blocked the bot, or may not
 * exist any more, and neither is a reason to fail a link that has already happened. Nothing about
 * the failure is logged beyond its shape, and no chat id is logged at all.
 */
async function notifyDisconnected(
  ctx: BotContext,
  deps: CommandDeps,
  chatIds: readonly string[],
): Promise<void> {
  const text = renderDeliveryString("start-disconnected", { url: deps.links.settings });
  for (const chatId of chatIds) {
    await ctx.api
      .sendMessage(chatId, text, { link_preview_options: { is_disabled: true } })
      .catch((error: unknown) => {
        console.error(`bot start: could not notify a disconnected chat (${safeErrorLabel(error)})`);
      });
  }
}

/** Anything but `/start` needs a chat that is already bound to an account. */
async function requireLink(ctx: BotContext, deps: CommandDeps): Promise<string | null> {
  const chatId = String(ctx.chat?.id ?? "");
  const linked = chatId ? await deps.store.chat(chatId) : null;
  if (linked) return linked.userId;
  await say(ctx, renderDeliveryString("start-no-token", { url: deps.links.settings }));
  return null;
}

export async function onPause(ctx: BotContext, deps: CommandDeps): Promise<string> {
  const userId = await requireLink(ctx, deps);
  if (!userId) return "not-linked";

  if ((await deps.store.pausedAt(userId)) !== null) {
    await say(ctx, renderDeliveryString("pause-already"));
    return "already-paused";
  }
  await deps.store.setPaused({ userId, pausedAt: new Date() });
  await say(ctx, renderDeliveryString("pause-done"));
  return "paused";
}

export async function onResume(ctx: BotContext, deps: CommandDeps): Promise<string> {
  const userId = await requireLink(ctx, deps);
  if (!userId) return "not-linked";

  if ((await deps.store.pausedAt(userId)) === null) {
    await say(ctx, renderDeliveryString("resume-already"));
    return "already-running";
  }
  await deps.store.setPaused({ userId, pausedAt: null });
  await say(ctx, renderDeliveryString("resume-done"));
  return "resumed";
}

/**
 * `/quiet`, `/quiet off`, `/quiet 22:00 07:00`.
 *
 * The window is stored as two minute counts against the zone on the user's profile, which is the
 * shape `channels` holds and `isWithinQuietHours` reads. A window whose ends are equal is refused
 * rather than stored: the kernel reads it as "no quiet hours" — a zero-length window and a
 * 24-hour one are the same two numbers — so accepting it would silently do nothing.
 */
export async function onQuiet(ctx: BotContext, deps: CommandDeps, args: string): Promise<string> {
  const userId = await requireLink(ctx, deps);
  if (!userId) return "not-linked";

  const parts = args
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);

  if (parts.length === 0) {
    const current = await deps.store.quietHours(userId);
    await say(
      ctx,
      current
        ? renderDeliveryString("quiet-set", {
            start: formatClock(current.startMinute),
            end: formatClock(current.endMinute),
            timezone: current.timezone,
          })
        : renderDeliveryString("quiet-none", { url: deps.links.settings }),
    );
    return current ? "shown" : "none-set";
  }

  if (parts.length === 1 && parts[0]?.toLowerCase() === "off") {
    await deps.store.setQuietHours({ userId, window: null });
    await say(ctx, renderDeliveryString("quiet-cleared"));
    return "cleared";
  }

  const startMinute = parts.length === 2 ? parseClock(parts[0] ?? "") : null;
  const endMinute = parts.length === 2 ? parseClock(parts[1] ?? "") : null;
  if (
    startMinute === null ||
    endMinute === null ||
    startMinute === endMinute ||
    startMinute >= MINUTES_PER_DAY ||
    endMinute >= MINUTES_PER_DAY
  ) {
    await say(ctx, renderDeliveryString("quiet-usage"));
    return "usage";
  }

  const outcome = await deps.store.setQuietHours({
    userId,
    window: { startMinute, endMinute },
  });
  if (outcome === "no-timezone") {
    await say(ctx, renderDeliveryString("quiet-unknown-timezone", { url: deps.links.settings }));
    return "no-timezone";
  }

  const shown = await deps.store.quietHours(userId);
  await say(
    ctx,
    renderDeliveryString("quiet-set", {
      start: formatClock(startMinute),
      end: formatClock(endMinute),
      timezone: shown?.timezone ?? "",
    }),
  );
  return "set";
}

export async function onBrief(ctx: BotContext, deps: CommandDeps): Promise<string> {
  await say(ctx, renderDeliveryString("brief-link", { url: deps.links.brief }));
  return "sent";
}

export async function onHelp(ctx: BotContext): Promise<string> {
  await say(ctx, renderDeliveryString("help-body"));
  return "sent";
}

export async function onUnknownCommand(ctx: BotContext): Promise<string> {
  await say(ctx, renderDeliveryString("command-unknown"));
  return "unknown";
}
