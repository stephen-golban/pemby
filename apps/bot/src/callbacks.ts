// Inline buttons: what a tap does, and what the card looks like afterwards.
//
// Three rules hold on every path through this file.
//
// **Every callback query is answered.** Telegram spins a progress bar on the tapped button until
// `answerCallbackQuery` arrives, so an unanswered query is a visibly stuck client, not a silent
// no-op. The last resort is the error boundary in `bot.ts`, which answers anything this file
// threw on before dropping the update.
//
// **The payload is hostile input.** It arrives from whoever can reach the webhook and it sat in
// somebody's chat history for an unbounded time before it did. `decodeCallbackData` validates
// every part and returns null for anything that is not exactly what the dispatcher encoded, and
// the match id it yields is then re-checked against the account that owns *this chat* before a
// single row moves — a decodable id is not an owned one.
//
// **The card keeps its link and loses its buttons.** After an action the message is edited in
// place: the status line is appended to the text, the action rows go, and "Apply" stays, because
// the one thing still worth doing with a match you have saved is opening it.

import {
  TELEGRAM_MESSAGE_MAX_CHARS,
  decodeCallbackData,
  flagFieldOf,
  flagReasonOf,
  passReasonOf,
  renderDeliveryString,
  type CallbackAction,
  type DeliveryStringKey,
  type FlagFieldValue,
  type FlagReasonValue,
  type KeyboardRow,
  type PassReasonValue,
} from "@pemby/core";
import { GrammyError } from "grammy";
import type { Message, MessageEntity } from "grammy/types";
import {
  buildFlagFieldKeyboard,
  buildFlagReasonKeyboard,
  buildPassReasonKeyboard,
  cardActionRows,
  inlineKeyboard,
  linkRowsOf,
} from "./keyboards";
import type { BotLinks } from "./links";
import type { BotStore } from "./store";
import type { BotContext } from "./types";

export interface CallbackDeps {
  store: BotStore;
  links: BotLinks;
}

/** The answer a picked "Not for me" reason is written down as, and the label it reads back as. */
const PASS_LABELS: Record<PassReasonValue, DeliveryStringKey> = {
  location: "pass-label-location",
  salary: "pass-label-salary",
  seniority: "pass-label-seniority",
  stack: "pass-label-stack",
  company: "pass-label-company",
  role: "pass-label-role",
  already_applied: "pass-label-already-applied",
  other: "pass-label-other",
};

const FLAG_LABELS: Record<FlagReasonValue, DeliveryStringKey> = {
  closed_or_fake: "flag-label-closed-or-fake",
  not_hiring_from_country: "flag-label-not-hiring-from-country",
  scam: "flag-label-scam",
  wrong_details: "flag-label-wrong-details",
  duplicate: "flag-label-duplicate",
  other: "flag-label-other",
};

/**
 * The `flag_reason` a "Wrong details" field answer belongs to.
 *
 * Taken from the action that opened the picker rather than written as the literal
 * `"wrong_details"`, because the kernel's whole point in attaching enum values to actions is that
 * the bot never spells a pg enum itself. That the `field-*` actions do not carry their own reason
 * is the small gap this works around; the report asks for it.
 */
const WRONG_DETAILS: FlagReasonValue = flagReasonOf("flag-wrong-details") ?? "wrong_details";

/**
 * Run an edit, and let the one ordinary failure through quietly.
 *
 * Tapping "Not for me" twice — which people do, because the first tap changes only the buttons —
 * asks Telegram to replace a keyboard with the identical keyboard, and Telegram answers 400
 * `message is not modified`. Nothing is wrong, so it should not reach the error boundary, where it
 * would be logged as a failure and would answer the query a second time. Every other Telegram
 * error still propagates.
 */
async function edit(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    const notModified =
      error instanceof GrammyError &&
      error.error_code === 400 &&
      error.description.includes("message is not modified");
    if (!notModified) throw error;
  }
}

/** A Telegram message the bot can still read and edit (not an `InaccessibleMessage`). */
type LiveMessage = Message & { chat: { id: number; type: string } };

function liveMessage(message: unknown): LiveMessage | null {
  return message && typeof message === "object" && "chat" in message && "message_id" in message
    ? (message as LiveMessage)
    : null;
}

export async function onCallback(ctx: BotContext, deps: CallbackDeps): Promise<string> {
  const query = ctx.callbackQuery;
  if (!query) return "not-a-callback";

  const stale = () => ctx.answerCallbackQuery({ text: renderDeliveryString("toast-stale-card") });

  const message = liveMessage(query.message);
  const decoded = query.data === undefined ? null : decodeCallbackData(query.data);
  // A card older than Telegram keeps message data for, an inline message, or a payload this
  // version of the wire format does not recognise. All three are the same thing to the user: a
  // button that no longer means anything, and a Brief that does.
  if (!decoded || !message || message.chat.type !== "private") {
    await stale();
    return "stale";
  }

  const linked = await deps.store.chat(String(message.chat.id));
  if (!linked) {
    await ctx.answerCallbackQuery({
      text: renderDeliveryString("start-no-token", { url: deps.links.settings }),
      show_alert: true,
    });
    return "not-linked";
  }

  const { action, matchId } = decoded;
  const linkRows = linkRowsOf(message.reply_markup);

  /** Swap the rows under "Apply" for a picker's, with the prompt shown as the tap's own toast. */
  const openPicker = async (prompt: DeliveryStringKey | null, rows: KeyboardRow[]) => {
    await ctx.answerCallbackQuery(prompt ? { text: renderDeliveryString(prompt) } : undefined);
    await edit(() => ctx.editMessageReplyMarkup({ reply_markup: inlineKeyboard(linkRows, rows) }));
  };

  switch (action) {
    case "pass":
      await openPicker("prompt-pass-reason", buildPassReasonKeyboard(matchId));
      return "pass-picker";
    case "flag":
      await openPicker("prompt-flag-reason", buildFlagReasonKeyboard(matchId));
      return "flag-picker";
    case "flag-wrong-details":
      await openPicker("prompt-flag-field", buildFlagFieldKeyboard(matchId));
      return "flag-field-picker";
    case "back":
      await openPicker(null, cardActionRows(matchId));
      return "back";
    default:
      break;
  }

  /**
   * Finish a card: toast the outcome, append the status line, keep only the link row.
   *
   * The text is rewritten by appending to `message.text` and passing the message's *own*
   * `entities` straight back, rather than by re-rendering HTML. `message.text` is the plain text
   * Telegram parsed, so re-sending it with `parse_mode: "HTML"` would eat any `<` in a job title,
   * and re-rendering the card would need the card. Appending leaves every existing entity offset
   * untouched, so the bold title stays bold and nothing is escaped twice.
   */
  const finish = async (
    toast: DeliveryStringKey,
    status: DeliveryStringKey | null,
    reason = "",
  ) => {
    await ctx.answerCallbackQuery({ text: renderDeliveryString(toast) });

    const text = message.text;
    const line = status === null ? null : renderDeliveryString(status, { reason });
    const next = text !== undefined && line !== null ? `${text}\n\n${line}` : null;
    const reply_markup = inlineKeyboard(linkRows, []);

    if (next !== null && next.length <= TELEGRAM_MESSAGE_MAX_CHARS) {
      await edit(() =>
        ctx.editMessageText(next, {
          entities: message.entities as MessageEntity[] | undefined,
          link_preview_options: { is_disabled: true },
          reply_markup,
        }),
      );
    } else {
      // A card at the character limit, or one with no text to append to: the toast already told
      // them, so drop the buttons and leave the text alone rather than truncating a job post.
      await edit(() => ctx.editMessageReplyMarkup({ reply_markup }));
    }
  };

  const restore = async (toast: DeliveryStringKey, alert = false) => {
    await ctx.answerCallbackQuery({ text: renderDeliveryString(toast), show_alert: alert });
    await edit(() =>
      ctx.editMessageReplyMarkup({
        reply_markup: inlineKeyboard(linkRows, cardActionRows(matchId)),
      }),
    );
  };

  const passReason = passReasonOf(action);
  if (passReason !== null) {
    const moved = await deps.store.setMatchState({
      userId: linked.userId,
      matchId,
      state: "passed",
      passReason,
    });
    if (!moved) {
      await stale();
      return "unknown-match";
    }
    await finish("toast-passed", "status-passed", renderDeliveryString(PASS_LABELS[passReason]));
    return "passed";
  }

  const flagField: FlagFieldValue | null = flagFieldOf(action);
  const flagReason: FlagReasonValue | null =
    flagField !== null ? WRONG_DETAILS : flagReasonOf(action);
  if (flagReason !== null) {
    const job = await deps.store.matchJob({ userId: linked.userId, matchId });
    if (!job) {
      await stale();
      return "unknown-match";
    }
    const outcome = await deps.store.storeFlag({
      userId: linked.userId,
      jobId: job.jobId,
      reason: flagReason,
      field: flagField,
    });
    if (outcome === "limited") {
      // The card goes back to its normal buttons: the report was not stored, so leaving the
      // picker open would suggest it was, and a dead-end card is worse than a retry tomorrow.
      await restore("toast-flag-limit", true);
      return "flag-limited";
    }
    // A duplicate is a success to the person who tapped — they reported it, it is on file — and
    // saying "you already did that" invites them to wonder whether the first one counted.
    await finish("toast-flagged", "status-flagged", renderDeliveryString(FLAG_LABELS[flagReason]));
    return outcome === "stored" ? "flagged" : "flag-duplicate";
  }

  return handleState(ctx, deps, action, matchId, linked.userId, { finish, restore, stale });
}

/** Save, I applied, and the un-save that only a hand-made payload can reach. */
async function handleState(
  ctx: BotContext,
  deps: CallbackDeps,
  action: CallbackAction,
  matchId: string,
  userId: string,
  reply: {
    finish: (
      toast: DeliveryStringKey,
      status: DeliveryStringKey | null,
      reason?: string,
    ) => Promise<void>;
    restore: (toast: DeliveryStringKey, alert?: boolean) => Promise<void>;
    stale: () => Promise<unknown>;
  },
): Promise<string> {
  const plan = {
    save: { state: "saved", toast: "toast-saved", status: "status-saved" },
    applied: { state: "applied", toast: "toast-applied", status: "status-applied" },
    // Nothing the bot builds offers this: `buildKeyboard` has no un-save, and a finished card has
    // no callback buttons left. It is honoured anyway because the action exists in the kernel and
    // the Brief may one day send one, and because the alternative is an unanswered query.
    unsave: { state: "new", toast: "toast-unsaved", status: null },
  } as const;

  const step = action in plan ? plan[action as keyof typeof plan] : null;
  if (!step) {
    // A code this build knows but this handler has no branch for. Answer, change nothing.
    await ctx.answerCallbackQuery();
    return "ignored";
  }

  const moved = await deps.store.setMatchState({
    userId,
    matchId,
    state: step.state,
    passReason: null,
  });
  if (!moved) {
    await reply.stale();
    return "unknown-match";
  }

  if (step.status === null) {
    await reply.restore(step.toast);
    return step.state;
  }
  await reply.finish(step.toast, step.status);
  return step.state;
}
