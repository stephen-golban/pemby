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

/** Every send attempt. The partial unique index makes a sent match idempotent per channel. */
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
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("delivery_log_match_channel_sent_uq")
      .on(t.matchId, t.channelType)
      .where(sql`${t.status} = 'sent' and ${t.matchId} is not null`),
    index("delivery_log_user_created_idx").on(t.userId, t.createdAt),
  ],
);
