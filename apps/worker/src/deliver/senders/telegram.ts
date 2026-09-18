// The Telegram sender: grammY's `Api` class, `autoRetry`, and the kernel's HTML.
//
// `Api` rather than `Bot`, because this process never receives an update — the bot service
// (`apps/bot`) owns the webhook. `Api` is the outbound half on its own, with grammY's typed
// methods, its error classes and its transformer pipeline, and without a second hand-rolled HTTP
// client beside the two the repo already has.
//
// Two settings are load-bearing rather than taste:
//
// **`link_preview_options: { is_disabled: true }`.** The free-tier card ends with a link to the
// passes page (PLAN D13). Left alone, Telegram fetches it and attaches a preview card, and the
// message stops looking like a match and starts looking like a link someone shared.
//
// **`parse_mode: "HTML"`.** Never MarkdownV2: a real title like `C#/.NET Dev (Remote!)` needs five
// characters escaped in MarkdownV2 and none in HTML beyond `< > &`, which the kernel already does.
import { buildKeyboard, renderTelegramHtml, type KeyboardRow } from "@pemby/core";
import { autoRetry } from "@grammyjs/auto-retry";
import { Api, GrammyError, HttpError } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import { safeErrorLabel } from "../../cv/workers";
import {
  PerKeyPacer,
  TELEGRAM_MAX_RETRY_ATTEMPTS,
  TELEGRAM_MAX_RETRY_DELAY_SECONDS,
  TELEGRAM_PER_CHAT_INTERVAL_MS,
  TELEGRAM_REQUEST_TIMEOUT_SECONDS,
  TokenBucket,
} from "../limits";
import type { Sender, SendOutcome, SendRequest } from "./types";

/** The kernel's channel-agnostic buttons, in Telegram's shape. */
function toInlineKeyboard(rows: KeyboardRow[]): InlineKeyboardButton[][] {
  return rows.map((row) =>
    row.map((button) =>
      button.kind === "url"
        ? { text: button.label, url: button.payload }
        : { text: button.label, callback_data: button.payload },
    ),
  );
}

/**
 * Telegram's verdict, reduced to one of the three outcomes.
 *
 * Only two error codes are allowed to kill a channel, and both are statements about the recipient:
 *
 *   - **403** — the user blocked the bot, or kicked it from the chat. (The bot service also sees
 *     this as a `my_chat_member` update; whichever notices first wins, and `markChannelDead` only
 *     writes when `dead_at` is still null.)
 *   - **400 "chat not found"** — the chat id no longer resolves at all.
 *
 * Every other 400 is our own malformed request — an over-long button label, a broken entity — and
 * is recorded as a retryable failure so `DELIVER_MAX_ATTEMPTS` retires that one message after three
 * tries while leaving the channel alone. A rendering bug must not be able to unsubscribe everyone.
 *
 * A 429 does not normally reach here at all: `autoRetry` has already waited `retry_after` and tried
 * again. One that does has exceeded the wait cap, and is retryable — the next tick will pick it up,
 * with no extra delay added on top of Telegram's own.
 */
function classify(error: unknown): SendOutcome {
  if (error instanceof GrammyError) {
    const code = error.error_code;
    // `description` is provider prose about our own request; it is matched on, never logged.
    const notFound = /chat not found/i.test(error.description);
    if (code === 403) return { ok: false, retryable: false, dead: "blocked", label: "tg_403" };
    if (code === 400 && notFound) {
      return { ok: false, retryable: false, dead: "chat-not-found", label: "tg_400_chat" };
    }
    return { ok: false, retryable: true, label: `tg_${code}` };
  }
  // A network failure, an abort on `timeoutSeconds`, or anything grammY did not wrap.
  if (error instanceof HttpError) return { ok: false, retryable: true, label: "tg_http" };
  return { ok: false, retryable: true, label: `tg_${safeErrorLabel(error)}` };
}

export interface TelegramSenderOptions {
  token: string;
  ratePerSecond: number;
}

export function createTelegramSender(options: TelegramSenderOptions): Sender {
  const api = new Api(options.token, { timeoutSeconds: TELEGRAM_REQUEST_TIMEOUT_SECONDS });
  // The plugin grammY's own flood docs recommend over `transformer-throttler`. It reads
  // `retry_after` off the 429 and waits exactly that long; the caps make the worst case finite,
  // which is what `STALE_CLAIM_FLOOR_SECONDS` is computed from.
  api.config.use(
    autoRetry({
      maxRetryAttempts: TELEGRAM_MAX_RETRY_ATTEMPTS,
      maxDelaySeconds: TELEGRAM_MAX_RETRY_DELAY_SECONDS,
      rethrowInternalServerErrors: false,
      rethrowHttpErrors: false,
    }),
  );

  const bucket = new TokenBucket(options.ratePerSecond);
  const pacer = new PerKeyPacer(TELEGRAM_PER_CHAT_INTERVAL_MS);

  return {
    type: "telegram",

    async acquire(address) {
      // Per-chat first, then the global bucket: the global one is the scarcer resource, and holding
      // a token while waiting out a chat's own second would starve every other chat.
      await pacer.wait(address);
      await bucket.take();
    },

    async send(request: SendRequest): Promise<SendOutcome> {
      const { card, channel, links, now } = request;
      try {
        const message = await api.sendMessage(
          channel.address,
          renderTelegramHtml(card, now, { passUrl: links.passUrl }),
          {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
            reply_markup: { inline_keyboard: toInlineKeyboard(buildKeyboard(card)) },
          },
        );
        return { ok: true, providerMessageId: String(message.message_id) };
      } catch (error) {
        return classify(error);
      }
    },
  };
}
