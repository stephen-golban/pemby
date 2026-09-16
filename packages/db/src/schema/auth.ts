// Better Auth core tables (user, session, account, verification) plus the anonymous plugin's
// `user.isAnonymous` field, for better-auth 1.7.5.
//
// Shape taken from `npx auth@1.7.5 generate` against a config with the drizzle adapter
// (provider "pg"), `emailAndPassword` and `anonymous()`, so the adapter needs no table or field
// mapping. Differences from the generated file, all adapter-neutral:
// - timestamps are `timestamptz`;
// - `session.updated_at` and `account.updated_at` also get `defaultNow()`;
// - an index on (is_anonymous, created_at) for the 24h cleanup of unclaimed anonymous users.
// If a plugin is added later, re-run the generator and diff against this file.
//
// Docs: https://www.better-auth.com/docs/concepts/database
//       https://www.better-auth.com/docs/plugins/anonymous
//       https://www.better-auth.com/docs/adapters/drizzle
import { relations } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: ts("created_at").defaultNow().notNull(),
    updatedAt: ts("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    isAnonymous: boolean("is_anonymous").default(false),
  },
  (table) => [index("user_isAnonymous_createdAt_idx").on(table.isAnonymous, table.createdAt)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: ts("created_at").defaultNow().notNull(),
    updatedAt: ts("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: ts("created_at").defaultNow().notNull(),
    updatedAt: ts("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").defaultNow().notNull(),
    updatedAt: ts("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));
