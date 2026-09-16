import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { user } from "./auth";
import { passProduct, passSource, paymentProvider, paymentStatus, referralStatus } from "./enums";

export type Refund = { providerRef: string; amountCents: number; at: string };

/** Provider-neutral payment record (PLAN D15). */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    provider: paymentProvider("provider").notNull(),
    providerRef: text("provider_ref").notNull(),
    product: passProduct("product").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    status: paymentStatus("status").notNull().default("pending"),
    refundedCents: integer("refunded_cents").notNull().default(0),
    refunds: jsonb("refunds").$type<Refund[]>().notNull().default([]),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("payments_provider_ref_uq").on(t.provider, t.providerRef),
    index("payments_user_idx").on(t.userId),
  ],
);

/** Referrals (PLAN D27). A user is referred at most once. */
export const referrals = pgTable(
  "referrals",
  {
    id: id(),
    referrerUserId: text("referrer_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    refereeUserId: text("referee_user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    status: referralStatus("status").notNull().default("pending"),
    /** The friend uploaded a CV that parsed and passed Turnstile. */
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index("referrals_referrer_idx").on(t.referrerUserId),
    check("referrals_not_self_ck", sql`${t.referrerUserId} <> ${t.refereeUserId}`),
  ],
);

/** One-time passes (PLAN D12, D14). Renewals stack: a new pass starts when the last one ends. */
export const passes = pgTable(
  "passes",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: passSource("source").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    /** Refund inside the provider window revokes the pass (PLAN section 5). */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    referralId: uuid("referral_id").references(() => referrals.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    index("passes_user_ends_idx").on(t.userId, t.endsAt),
    /** A payment grants at most one pass, so a replayed webhook cannot stack a second one. */
    uniqueIndex("passes_payment_id_uq")
      .on(t.paymentId)
      .where(sql`${t.paymentId} is not null`),
    check("passes_range_ck", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);
