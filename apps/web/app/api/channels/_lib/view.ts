// The shape `/settings` reads and writes, and the stable codes `/api/channels/*` answers with.
// Shared by the routes, the browser client and the page, so one file says what a channel setting
// is on this surface (docs/conventions.md: bodies carry codes, never sentences).

import type { ChannelDeadReason } from "@pemby/db";

export type { ChannelDeadReason };

/**
 * One row of the channels ledger.
 *
 * `enabled` is the user's own switch. `dead` is the system's verdict — Telegram reported a block,
 * a push endpoint answered 410 — and the two are kept apart on purpose
 * (`packages/db/src/schema/delivery.ts`): a page that folded a block into `enabled = false` would
 * tell someone they had switched the channel off themselves.
 *
 * `address` is personal data and only ever the caller's own. It is present for email, where the
 * person needs to see which mailbox will be written to, and withheld for telegram (a chat id says
 * nothing a person can read) and for push (an endpoint is a credential-shaped URL, and the browser
 * already holds its own).
 */
export interface ChannelView {
  configured: boolean;
  enabled: boolean;
  address: string | null;
  dead: ChannelDeadReason | null;
  /** When the channel was linked, ISO 8601, or null when it was never configured. */
  since: string | null;
}

/** Minutes after local midnight, counted in `timezone`. All null means no quiet hours. */
export interface QuietView {
  startMinute: number | null;
  endMinute: number | null;
  timezone: string | null;
}

export interface ChannelSettingsView {
  telegram: ChannelView;
  email: ChannelView;
  /**
   * Push is per browser, so the row carries one entry per subscription rather than one address.
   *
   * Each entry is `pushFingerprint(endpoint)` — the first 16 hex of its SHA-256 — and never the
   * endpoint itself. That is what lets the page say "on in **this** browser" as a fact rather than
   * a guess: the browser hashes the endpoint it already holds and looks for it in this list. It
   * learns nothing it did not have, and an endpoint it does not hold stays unguessable.
   */
  push: ChannelView & { fingerprints: string[] };
  quiet: QuietView;
  /**
   * When delivery was paused (`profiles.delivery_paused_at`), or null. A timestamp rather than a
   * flag, so the page can say how long everything has been held rather than only that it is.
   */
  pausedAt: string | null;
  /**
   * False when the account has no channel row at all. Quiet hours live on channel rows, so there
   * is nowhere to store a window until one exists; the page says so instead of taking an edit it
   * would silently drop.
   */
  hasChannels: boolean;
}

/**
 * Any subset of the switches `PATCH /api/channels` writes. Absent means "leave it alone".
 *
 * Push is not here. Its switch is one browser's subscription, which the browser has to create or
 * revoke itself, so it goes through `POST` / `DELETE /api/channels/push` with the subscription in
 * hand rather than through a boolean the server could not act on.
 */
export interface ChannelPatch {
  telegram?: boolean;
  email?: boolean;
  /** Null clears the window on every one of the user's channels. */
  quiet?: QuietView | null;
  paused?: boolean;
}

/** What `POST /api/channels/telegram` answers. Shown once; the token is never recoverable. */
export interface TelegramLink {
  /** `https://t.me/<bot>?start=<token>`. Treated like a password-reset link. */
  url: string;
  expiresAt: string;
}

/** The half of a `PushSubscription` the server stores (`channels.address` + `channels.push_keys`). */
export interface PushSubscriptionBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Minutes in a day. A quiet window's two ends are both inside `[0, 1440)`. */
export const MINUTES_PER_DAY = 24 * 60;

export const CHANNEL_ERRORS = [
  "unauthenticated",
  "forbidden",
  "invalid_patch",
  "invalid_subscription",
  /** The endpoint is already another account's. The browser must subscribe afresh. */
  "subscription_taken",
  "telegram_unavailable",
  "unavailable",
] as const;
export type ChannelError = (typeof CHANNEL_ERRORS)[number];
