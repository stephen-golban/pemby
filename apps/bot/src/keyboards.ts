// Turning the kernel's channel-agnostic keyboard rows into Telegram's `inline_keyboard`.
//
// `@pemby/core` deliberately describes a button as a label, a kind and a payload and stops there,
// so that the same card can be laid out for an email or a push notification. This file is the
// Telegram half of that, and it is the only place in the bot that knows what an
// `InlineKeyboardButton` is.

import {
  buildFlagFieldKeyboard,
  buildFlagReasonKeyboard,
  buildPassReasonKeyboard,
  encodeCallbackData,
  renderDeliveryString,
  type KeyboardRow,
} from "@pemby/core";
import type { InlineKeyboardButton, InlineKeyboardMarkup } from "grammy/types";

function toButton(button: KeyboardRow[number]): InlineKeyboardButton {
  return button.kind === "url"
    ? { text: button.label, url: button.payload }
    : { text: button.label, callback_data: button.payload };
}

/**
 * The URL rows of a keyboard already on screen.
 *
 * Every edit the bot makes to a card keeps "Apply" and replaces everything below it, and the
 * cheapest place to find "Apply" is the message Telegram just handed back — the callback update
 * carries the message's own `reply_markup`. Reading it there rather than rebuilding it saves a
 * lookup of the job's URL on the hot path of every single tap.
 *
 * A row counts only if *every* button in it is a link, so a row that mixes a link with an action
 * is dropped rather than half-kept.
 */
export function linkRowsOf(markup: InlineKeyboardMarkup | undefined): InlineKeyboardButton[][] {
  if (!markup) return [];
  return markup.inline_keyboard.filter(
    (row) => row.length > 0 && row.every((button) => "url" in button),
  );
}

/** `linkRows` first, then whatever the kernel laid out below them. */
export function inlineKeyboard(
  linkRows: InlineKeyboardButton[][],
  rows: KeyboardRow[],
): InlineKeyboardMarkup {
  return { inline_keyboard: [...linkRows, ...rows.map((row) => row.map(toButton))] };
}

/**
 * The action rows of a fresh card: Save / I applied, then Not for me / Something's wrong.
 *
 * This is the one piece of card layout the bot spells out itself, and only because `Back` has to
 * put it back. `buildKeyboard` in the kernel takes a whole `MatchCard`, and a callback carries a
 * match id and nothing else, so the bot cannot call it without first reading a card it does not
 * need. Both the labels and the payload format still come from the kernel; only the shape of the
 * grid is repeated. The report asks for `buildKeyboard` to take `{ matchId, url }` so this can go.
 */
export function cardActionRows(matchId: string): KeyboardRow[] {
  const action = (label: Parameters<typeof renderDeliveryString>[0], data: string) => ({
    label: renderDeliveryString(label),
    kind: "callback" as const,
    payload: data,
  });
  return [
    [
      action("button-save", encodeCallbackData("save", matchId)),
      action("button-applied", encodeCallbackData("applied", matchId)),
    ],
    [
      action("button-not-for-me", encodeCallbackData("pass", matchId)),
      action("button-flag", encodeCallbackData("flag", matchId)),
    ],
  ];
}

export { buildFlagFieldKeyboard, buildFlagReasonKeyboard, buildPassReasonKeyboard };
