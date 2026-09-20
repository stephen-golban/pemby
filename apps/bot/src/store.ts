// What the bot needs from the database, as a port.
//
// The handlers in `commands.ts` and `callbacks.ts` never see Drizzle, a pool or a table name. They
// see this interface, whose methods are named after the things a person does in a chat — link,
// pause, pass, flag — rather than after the rows those things happen to touch. `store-db.ts` is
// the one implementation, and it is where every query in this service lives.
//
// The seam is not there for tests (PLAN D24: this repo has none). It is there because the bot's
// database access is the part of it that cannot be exercised without a Postgres, and a port lets a
// local dry run drive the real grammY handlers, the real keyboards and the real copy against a
// stand-in. It also keeps the "queries the delivery kernel does not export" problem in exactly one
// file, which is the file that should shrink when the kernel grows.

import type { ChannelDeadReason, MatchPassReason } from "@pemby/db";
import type { FlagFieldValue, FlagReasonValue } from "@pemby/core";

/** A Telegram chat that is bound to an account. */
export interface LinkedChat {
  channelId: string;
  userId: string;
  /** Set while Telegram says the user has blocked the bot. Cleared when they unblock it. */
  deadAt: Date | null;
}

/**
 * What `/start <token>` did.
 *
 * `invalid-token` covers every reason a token did not redeem — unknown, expired, already used —
 * because the user must not be told which one, and the bot is not told either
 * (`consumeTelegramLinkToken` returns null for all three).
 *
 * The other three are deliberately **three** and not one "it worked", because a deep link is a
 * bearer credential and the three outcomes carry very different news. `rebound-account` is the one
 * that has to be said out loud: it means this chat used to belong to somebody else's account, and
 * a person who reached it by tapping a link somebody sent them needs to know that before their
 * matches quietly become another account's matches.
 */
export type LinkSuccess =
  /** The chat was free, or already this account's, and is now bound to it. */
  | "linked"
  /** It was already bound to exactly this account. Nothing changed. */
  | "already-linked"
  /** It was bound to a **different** account, and that binding has just been taken away. */
  | "rebound-account";

export type LinkOutcome =
  | {
      kind: LinkSuccess;
      /**
       * Chats that lost this account's binding, so the bot can tell them so.
       *
       * Without this, the mirror case is invisible: a leaked token for account A, redeemed in
       * somebody else's chat, moves A wholesale to that chat and leaves A's own chat silently
       * receiving nothing. A message to the old chat is the only warning A ever gets inside
       * Telegram.
       */
      disconnected: string[];
    }
  | { kind: "invalid-token" };

/** Quiet hours as `channels` stores them: minutes after local midnight, plus the zone. */
export interface QuietHoursRow {
  startMinute: number;
  endMinute: number;
  timezone: string;
}

/** `/quiet` needs a zone to count minutes in, and only the profile has one. */
export type QuietHoursOutcome = "set" | "cleared" | "no-timezone";

/** What happened to a flag. `limited` is the daily per-user cap (PLAN section 6). */
export type FlagOutcome = "stored" | "duplicate" | "limited";

/** The subset of `match_state` the bot can write. `new` is what "unsave" goes back to. */
export type BotMatchState = "new" | "saved" | "applied" | "passed";

export interface BotStore {
  /** The account this chat belongs to, or null if it was never linked. */
  chat(chatId: string): Promise<LinkedChat | null>;

  /**
   * Redeem a deep-link token and bind this chat to the account that minted it.
   *
   * The token is single-use and is spent by the attempt, whatever the outcome of the binding —
   * see the note on `store-db.ts`'s implementation.
   */
  link(params: { token: string; chatId: string; now: Date }): Promise<LinkOutcome>;

  /** `/pause` and `/resume`. `pausedAt` null means resumed. */
  setPaused(params: { userId: string; pausedAt: Date | null }): Promise<void>;

  /** When this user paused delivery, or null. */
  pausedAt(userId: string): Promise<Date | null>;

  /** The quiet window on this user's Telegram channel, or null when none is set. */
  quietHours(userId: string): Promise<QuietHoursRow | null>;

  /**
   * Write one window to every channel this user has, or clear it when `window` is null.
   *
   * All of them, in one transaction: PLAN D8 makes quiet hours a property of the person, and
   * `channels` happens to store them per row, so a partial write would mean "quiet on Telegram,
   * loud by email" — a state the product has no way to express and no way to explain.
   */
  setQuietHours(params: {
    userId: string;
    window: { startMinute: number; endMinute: number } | null;
  }): Promise<QuietHoursOutcome>;

  /** The post behind a match, if the match is this user's. Null means "not yours, or gone". */
  matchJob(params: { userId: string; matchId: string }): Promise<{ jobId: string } | null>;

  /**
   * Move one match to a new state, folding a "Not for me" reason into the user's scoring nudges
   * (PLAN D6). False when the match is not this user's.
   *
   * **`applied` also writes the `applications` row** (PLAN D9, phase 09). The method keeps the name
   * of what the person did — one tap on "I applied" — rather than gaining a second one for the
   * second table, but the two writes are both part of it: before phase 09 this path moved
   * `matches.state` alone, and the tracker's Applied column was consequently unreachable from
   * Telegram. See the implementation for why the two are not in one transaction.
   */
  setMatchState(params: {
    userId: string;
    matchId: string;
    state: BotMatchState;
    passReason: MatchPassReason | null;
  }): Promise<boolean>;

  /** Store one flag, against the daily per-user limit (PLAN section 6). */
  storeFlag(params: {
    userId: string;
    jobId: string;
    reason: FlagReasonValue;
    field: FlagFieldValue | null;
  }): Promise<FlagOutcome>;

  /** Telegram reported a block on this chat. */
  markChatDead(params: { chatId: string; reason: ChannelDeadReason; at: Date }): Promise<void>;

  /** Telegram reported an unblock on this chat. */
  reviveChat(params: { chatId: string }): Promise<void>;
}
