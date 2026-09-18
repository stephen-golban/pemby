// The grammY bot: which update goes to which handler, and what happens when one throws.
//
// Built from explicit dependencies rather than from the environment, so the wiring lives in
// `index.ts` and this file has nothing to read at import time.

import { autoRetry } from "@grammyjs/auto-retry";
import { Bot } from "grammy";
import { onCallback } from "./callbacks";
import {
  BOT_COMMANDS,
  onBrief,
  onHelp,
  onPause,
  onQuiet,
  onResume,
  onStart,
  onUnknownCommand,
} from "./commands";
import type { BotLinks } from "./links";
import { logUpdate, safeErrorLabel } from "./log";
import type { BotStore } from "./store";
import type { BotContext } from "./types";

export interface BotDeps {
  token: string;
  store: BotStore;
  links: BotLinks;
  /**
   * An alternative Bot API root — a self-hosted Bot API server, or the stand-in a local dry run
   * points at so the handlers can be driven without touching Telegram. Unset in every deployment.
   */
  apiRoot?: string;
}

/**
 * Retry budget, chosen against the webhook's own clock rather than the plugin's defaults.
 *
 * `autoRetry` defaults to retrying for ever and waiting however long `retry_after` says, which is
 * right for a long-polling bot and wrong for this one: grammY's webhook middleware gives a handler
 * ten seconds, and a handler still sleeping off a 429 when that runs out has achieved nothing and
 * held a connection open to do it. Two attempts and three seconds fit inside the budget, and a
 * flood that outlasts them is the dispatcher's problem, not a chat reply's. Nothing here adds a
 * delay of its own on top of `retry_after`.
 */
const RETRY = { maxRetryAttempts: 2, maxDelaySeconds: 3 } as const;

export function createBot(deps: BotDeps): Bot<BotContext> {
  const bot = new Bot<BotContext>(
    deps.token,
    deps.apiRoot === undefined ? undefined : { client: { apiRoot: deps.apiRoot } },
  );

  bot.api.config.use(autoRetry(RETRY));

  /**
   * The backstop, as **middleware** and not as `bot.catch`.
   *
   * `bot.catch` is only consulted by `bot.start()`, the long-polling runner. Under webhooks
   * `handleUpdate` wraps whatever a handler threw in a `BotError` and rethrows it, so a handler
   * installed with `bot.catch` never runs — the error goes past it to the web framework. Proven,
   * not assumed: a dry run with a failing store answered **400** with `bot.catch` in place and
   * left the callback query unanswered. `errorBoundary` is the one that sits in the stack.
   *
   * What it does with the error. The tap is already lost, so the thing still worth doing is
   * stopping the progress bar on the button they pressed — an unanswered callback query spins in
   * the client until Telegram gives up on it. Then the update is dropped and the webhook answers
   * 2xx. Telegram resends on a non-2xx, so letting a database outage out of here would turn one
   * broken tap into a queue of retries against the database that is already down, and the user is
   * one tap away from trying again themselves.
   *
   * Only the error's shape is logged. A `GrammyError` carries Telegram's own description and a
   * driver error carries the failing row, so the message is precisely the part that must not be
   * written down.
   */
  const guarded = bot.errorBoundary(async (error) => {
    console.error(`bot update failed: ${safeErrorLabel(error.error)}`);
    if (error.ctx.callbackQuery) {
      await error.ctx.answerCallbackQuery().catch(() => undefined);
    }
  });

  /**
   * One line per update: what it was and how it ended, with no part of it quoted.
   *
   * Generic in the context so it can sit inside `command()` and `on()` without flattening what
   * those filters proved — a handler registered on `message:text` still sees a `ctx.message.text`
   * that exists.
   */
  const timed =
    <C extends BotContext>(what: string, handler: (ctx: C) => Promise<string>) =>
    async (ctx: C) => {
      const started = Date.now();
      const outcome = await handler(ctx);
      logUpdate(what, outcome, Date.now() - started);
    };

  // A callback query's chat is read off the message it belongs to, and a message old enough for
  // Telegram to have forgotten has none — so this one is registered on the raw bot and does its
  // own private-chat check. Filtering it here would drop exactly the queries that most need an
  // answer.
  guarded.on(
    "callback_query",
    timed("callback", (ctx) => onCallback(ctx, deps)),
  );

  // Everything else is private chats only. The bot is not a group member and has nothing to say
  // in one; a `my_chat_member` from a group is somebody adding it somewhere it does not belong.
  const chat = guarded.chatType("private");

  chat.command(
    "start",
    timed("start", (ctx) => onStart(ctx, deps, ctx.match)),
  );
  chat.command(
    "pause",
    timed("pause", (ctx) => onPause(ctx, deps)),
  );
  chat.command(
    "resume",
    timed("resume", (ctx) => onResume(ctx, deps)),
  );
  chat.command(
    "quiet",
    timed("quiet", (ctx) => onQuiet(ctx, deps, ctx.match)),
  );
  chat.command(
    "brief",
    timed("brief", (ctx) => onBrief(ctx, deps)),
  );
  chat.command(
    "help",
    timed("help", (ctx) => onHelp(ctx)),
  );

  /**
   * In a private chat this update means one thing: the user blocked the bot, or unblocked it.
   * `kicked` is the block. `member` is the only other status a private chat can reach, and it is
   * how they come back — which clears the verdict without touching `channels.enabled`, because
   * that switch is theirs and this one is ours.
   */
  chat.on(
    "my_chat_member",
    timed("chat-member", async (ctx) => {
      const chatId = String(ctx.chat.id);
      const status = ctx.myChatMember.new_chat_member.status;
      if (status === "kicked") {
        await deps.store.markChatDead({ chatId, reason: "blocked", at: new Date() });
        return "blocked";
      }
      if (status === "member") {
        await deps.store.reviveChat({ chatId });
        return "unblocked";
      }
      return `ignored:${status}`;
    }),
  );

  // An unhandled command, then anything else typed at the bot. `/help` is the answer to both;
  // saying nothing at all reads as a bot that is down.
  chat.on(
    "message:text",
    timed("message", (ctx) =>
      ctx.message.text.startsWith("/") ? onUnknownCommand(ctx) : onHelp(ctx),
    ),
  );

  return bot;
}

/**
 * Publish the command menu, scoped to private chats.
 *
 * Failing is not fatal: the menu is a convenience, every command works without it, and a bot that
 * refuses to boot because a cosmetic API call timed out is worse than one with a stale menu.
 */
export async function publishCommandMenu(bot: Bot<BotContext>): Promise<void> {
  try {
    await bot.api.setMyCommands([...BOT_COMMANDS], { scope: { type: "all_private_chats" } });
    console.log(`bot command menu published: commands=${BOT_COMMANDS.length}`);
  } catch (error) {
    console.error(`bot command menu not published: ${safeErrorLabel(error)}`);
  }
}
