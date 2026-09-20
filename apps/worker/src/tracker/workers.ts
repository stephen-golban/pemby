// Registers the `tracker.sync` handler. No cron: this queue only ever has work because somebody
// moved a card, so there is nothing for a sweep to find.
import { autoRetry } from "@grammyjs/auto-retry";
import type { Db } from "@pemby/db";
import { Api, GrammyError } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import type { PgBoss } from "pg-boss";

import { safeErrorLabel } from "../cv/workers";
import {
  TELEGRAM_MAX_RETRY_ATTEMPTS,
  TELEGRAM_MAX_RETRY_DELAY_SECONDS,
  TELEGRAM_REQUEST_TIMEOUT_SECONDS,
} from "../deliver/limits";
import type { TrackerEnv } from "./env";
import { TRACKER_SYNC_QUEUE, type TrackerSyncData } from "./queues";
import { loadTrackerCard, trackerCardButtons } from "./sync";

export interface TrackerWorkerDeps {
  boss: PgBoss;
  db: Db;
  env: TrackerEnv;
  /** Replaces the real Telegram call. Used by `tracker:smoke`; never set in production. */
  editMarkup?: TrackerMarkupEditor;
}

export type TrackerMarkupEditor = (args: {
  chatId: string;
  messageId: number;
  keyboard: InlineKeyboardButton[][];
}) => Promise<"edited" | "unchanged" | "gone">;

/**
 * The real editor: grammY's `Api`, the same class the delivery sender uses and for the same reason —
 * this process never receives an update, so `Bot` would bring a whole update pipeline it has no use
 * for. `autoRetry` honours Telegram's own `retry_after` on a 429.
 *
 * Three answers, only one of which is an error:
 *   - **edited** — done.
 *   - **unchanged** — Telegram's "message is not modified". Two state changes that land on the same
 *     column produce this, and it means the card already says the right thing.
 *   - **gone** — the message is too old to edit, was deleted, or the chat no longer resolves. All
 *     permanent; retrying would burn three attempts to arrive at the same place.
 * Everything else throws, so the queue retries.
 */
export function createTelegramMarkupEditor(token: string): TrackerMarkupEditor {
  const api = new Api(token, { timeoutSeconds: TELEGRAM_REQUEST_TIMEOUT_SECONDS });
  api.config.use(
    autoRetry({
      maxRetryAttempts: TELEGRAM_MAX_RETRY_ATTEMPTS,
      maxDelaySeconds: TELEGRAM_MAX_RETRY_DELAY_SECONDS,
      rethrowInternalServerErrors: false,
      rethrowHttpErrors: false,
    }),
  );
  return async ({ chatId, messageId, keyboard }) => {
    try {
      await api.editMessageReplyMarkup(chatId, messageId, {
        reply_markup: { inline_keyboard: keyboard },
      });
      return "edited";
    } catch (error) {
      if (error instanceof GrammyError) {
        // `description` is provider prose about our own request: matched on, never logged.
        const d = error.description;
        if (/message is not modified/i.test(d)) return "unchanged";
        if (
          error.error_code === 403 ||
          /message to edit not found|message can't be edited|chat not found/i.test(d)
        ) {
          return "gone";
        }
      }
      throw error;
    }
  };
}

export async function startTrackerWorkers(deps: TrackerWorkerDeps): Promise<void> {
  const { boss, db, env } = deps;
  const editor =
    deps.editMarkup ??
    (env.telegramBotToken ? createTelegramMarkupEditor(env.telegramBotToken) : null);

  await boss.work<TrackerSyncData>(
    TRACKER_SYNC_QUEUE,
    { batchSize: 1, localConcurrency: 1, pollingIntervalSeconds: 5 },
    async ([job]) => {
      if (!job) return;
      const { matchId } = job.data;
      try {
        const card = await loadTrackerCard(db, matchId);
        if (!card) {
          // Never delivered on Telegram, delivered without a message id, the channel is gone, or
          // the profile is demo. A normal outcome for most matches, not a failure.
          console.log(`tracker.sync match=${matchId} skipped: no editable telegram card`);
          return;
        }
        if (!editor) {
          console.log(`tracker.sync match=${matchId} skipped: TELEGRAM_BOT_TOKEN not set`);
          return;
        }
        const messageId = Number(card.messageId);
        if (!Number.isSafeInteger(messageId)) {
          // A seeded or hand-written `provider_message_id`. Telegram would answer 400 three times.
          console.warn(`tracker.sync match=${matchId} skipped: message id is not a number`);
          return;
        }
        const keyboard = trackerCardButtons(card, env.appUrl).map((row) =>
          row.map((b) => ({ text: b.label, url: b.url }) satisfies InlineKeyboardButton),
        );
        const outcome = await editor({ chatId: card.chatId, messageId, keyboard });
        console.log(
          `tracker.sync match=${matchId} column=${card.column ?? "-"} outcome=${outcome}`,
        );
      } catch (error) {
        // pg-boss stores what a handler throws in `pgboss.job.output`, and a driver error's message
        // quotes its parameters — which here include a chat id. Only the label leaves.
        const label = safeErrorLabel(error);
        if (!job.signal.aborted) console.error(`tracker.sync match=${matchId} failed: ${label}`);
        throw new Error(label);
      }
    },
  );
}
