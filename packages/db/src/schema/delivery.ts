import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, timestamps } from "./_shared";
import { user } from "./auth";
import { channelType, deliveryKind, deliveryStatus } from "./enums";
import { matches } from "./matching";

export type PushKeys = { p256dh: string; auth: string };

/**
 * Why a channel stopped working, as a stable code rather than a provider's prose.
 *
 * - `blocked` — Telegram reported the user blocked or kicked the bot (a `my_chat_member` update).
 * - `chat-not-found` — the chat id no longer resolves; the account was deleted or the chat purged.
 * - `push-expired` — the push service answered 404 or 410: the subscription is gone for good.
 * - `address-invalid` — the provider refused the address permanently (a hard bounce, a mistyped
 *   address); anything retryable is a failed send, not a dead channel.
 * - `permanent-failure` — the dispatcher's catch-all for a non-retryable provider verdict it has
 *   no more specific code for. Written with the sanitized error label, never the provider's text.
 *
 * Text rather than a pg enum on purpose (precedent: `companies.evidence_status`). Providers invent
 * new permanent failures faster than a schema migration is worth, and nothing queries on this
 * column — `dead_at` is what the dispatcher filters on.
 */
export type ChannelDeadReason =
  "blocked" | "chat-not-found" | "push-expired" | "address-invalid" | "permanent-failure";

/** Delivery channels per user (PLAN D8). */
export const channels = pgTable(
  "channels",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: channelType("type").notNull(),
    /** Telegram chat id, email address, or push endpoint URL. */
    address: text("address").notNull(),
    pushKeys: jsonb("push_keys").$type<PushKeys>(),
    enabled: boolean("enabled").notNull().default(true),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    /**
     * When the channel was found to be permanently gone, and why.
     *
     * Separate from `enabled` because the two are different facts with different owners: `enabled`
     * is the user's own switch, set from the settings UI and from `/pause`, and nothing but the
     * user may change it. `dead_at` is the system's verdict — the bot writes it on a
     * `my_chat_member` block, the dispatcher on a permanent provider failure — and clearing it is
     * the user's act of reconnecting. Folding a block into `enabled = false` would tell a user who
     * later reopens the settings page that they had switched Telegram off themselves, and would
     * lose the chance to say what actually happened.
     */
    deadAt: timestamp("dead_at", { withTimezone: true }),
    deadReason: text("dead_reason").$type<ChannelDeadReason>(),
    /** Quiet hours as minutes after local midnight in `timezone`; both null = none. */
    quietStartMinute: smallint("quiet_start_minute"),
    quietEndMinute: smallint("quiet_end_minute"),
    timezone: text("timezone"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("channels_type_address_uq").on(t.type, t.address),
    index("channels_user_idx").on(t.userId),
  ],
);

/**
 * Every send attempt, and — since phase 08 — every *intent* to send.
 *
 * A row is inserted with `status = 'claimed'` before the provider is called and moved to `sent` or
 * `failed` in place afterwards, so this table is the dispatcher's lock as well as its log.
 * `delivery_log_match_channel_live_uq` is the lock; `delivery_log_match_channel_sent_uq` stays on
 * as the backstop it always was. The full ordering, the failure mode it accepts and the recovery
 * of a claim left behind by a crashed process are in `../queries/delivery.ts`.
 */
export const deliveryLog = pgTable(
  "delivery_log",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "set null" }),
    channelType: channelType("channel_type").notNull(),
    kind: deliveryKind("kind").notNull(),
    status: deliveryStatus("status").notNull(),
    /** Free-tier message sent 24h late (carries the upgrade note). */
    late: boolean("late").notNull().default(false),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    /**
     * When the provider accepted the message. `created_at` is when the row was *claimed*, which on
     * a retried or rate-limited send is a different instant; a log that conflates the two cannot
     * answer "how long after the match was made did this actually go out".
     */
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    /**
     * The lock. One live row per (match, channel): a claim in flight, or a completed send.
     *
     * Spelled as "not one of the terminal statuses" rather than `in ('sent','claimed')` for two
     * reasons. The migrator applies every pending migration in one transaction, and 0012 adds
     * `claimed`, so a predicate naming it would be rejected in the same run as unsafe use of a new
     * enum value. And the meaning is the one that should survive a fourth status: a row that is
     * not `failed` and not `skipped` is a row that stands, and no second row may stand beside it.
     */
    uniqueIndex("delivery_log_match_channel_live_uq")
      .on(t.matchId, t.channelType)
      .where(
        sql`${t.matchId} is not null and ${t.status} <> 'failed' and ${t.status} <> 'skipped'`,
      ),
    /**
     * The backstop, unchanged since phase 01 and deliberately kept. It is implied by the index
     * above, and that is the point: if a future change ever widens the live predicate, the
     * guarantee that matters most — a match is recorded as sent to a channel at most once — is
     * still enforced by an index of its own.
     */
    uniqueIndex("delivery_log_match_channel_sent_uq")
      .on(t.matchId, t.channelType)
      .where(sql`${t.status} = 'sent' and ${t.matchId} is not null`),
    index("delivery_log_user_created_idx").on(t.userId, t.createdAt),
    /**
     * Sweeping claims a crashed dispatcher left behind (`reclaimStaleDeliveries`), which asks for
     * `status = 'claimed' and created_at < <cutoff>`.
     *
     * Deliberately a plain composite index and not a partial one on `status = 'claimed'`: 0012 adds
     * that value in the transaction this index is created in, and a predicate naming it would be
     * refused as unsafe use of a new enum value. Spelling the predicate around `claimed` instead
     * would leave it matching every `sent` row, which is the whole table, so a partial index would
     * buy nothing. Two columns, no predicate, no ordering landmine.
     */
    index("delivery_log_status_created_idx").on(t.status, t.createdAt),
  ],
);

/**
 * One-time tokens for the Telegram deep link `t.me/<bot>?start=<token>` (PLAN D8).
 *
 * Only the SHA-256 of the token is stored. The token is the whole credential — anyone holding it
 * binds a chat to the account that minted it — and it travels through a URL the user pastes into
 * Telegram, so it is handled the way a password reset link is: minted once, shown once, never
 * recoverable from the row, and `consumeTelegramLinkToken` compares hashes.
 *
 * Nothing in the payload identifies the user. The token is 32 random bytes, base64url, and the
 * user id is found by looking the hash up here; a payload carrying the id would leak it to
 * everyone the user forwards the link to and would let a guessed id bind someone else's chat.
 */
export const telegramLinkTokens = pgTable(
  "telegram_link_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Lower-case hex SHA-256 of the base64url token. Never the token itself. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    /** The Telegram chat that redeemed it, for the audit trail on a disputed link. */
    usedByChatId: text("used_by_chat_id"),
    createdAt: createdAt(),
  },
  (t) => [
    /** Unique as well as fast: two live tokens may never share a hash. */
    uniqueIndex("telegram_link_tokens_hash_uq").on(t.tokenHash),
    index("telegram_link_tokens_expires_idx").on(t.expiresAt),
    index("telegram_link_tokens_user_idx").on(t.userId),
  ],
);
