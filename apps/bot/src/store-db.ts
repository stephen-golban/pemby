// Every database statement this service makes.
//
// Where the phase-08 delivery kernel already has a query, this file calls it and adds nothing:
// `consumeTelegramLinkToken`, `setDeliveryPaused`, `deliveryPausedAt`, `markChannelDead` and
// `clearChannelDead` all come from `packages/db/src/queries/delivery.ts`. The rest — resolving a
// chat id to an account, binding one, writing quiet hours, moving a match's state, storing a flag
// — has no exported query anywhere in the repo, and the alternatives were to block on order 1 or
// to write them here. They are written here, in one file, and named in the report as the things
// that should move into `packages/db/src/queries/` once the kernel can take them.
//
// The one that hurts is `setMatchState`. `apps/web/app/api/brief/_lib/db.ts:425` already does this
// — the same locking read-modify-write on `profiles.scoring_nudges`, in raw SQL because apps/web
// cannot reach Drizzle's builder — and a "Not for me" tap that tuned scoring on the web but not
// on Telegram would be a silent, invisible divergence in the thing PLAN D6 is *for*. So the logic
// is duplicated deliberately, with `applyPassFeedback` from `@pemby/core` owning every bound, and
// flagged loudly rather than skipped.

import {
  DB_SENIORITIES,
  ROLE_FAMILIES,
  applyPassFeedback,
  fromDbSeniority,
  type NudgeJob,
  type RoleFamily,
} from "@pemby/core";
import {
  channels,
  clearChannelDead,
  consumeTelegramLinkToken,
  deliveryPausedAt,
  flags,
  jobEnrichment,
  jobs,
  markChannelDead,
  matches,
  profiles,
  setDeliveryPaused,
  upsertApplication,
  type ChannelDeadReason,
  type Db,
} from "@pemby/db";
import { and, eq, ne, sql } from "drizzle-orm";
import type {
  BotStore,
  FlagOutcome,
  LinkOutcome,
  LinkSuccess,
  LinkedChat,
  QuietHoursOutcome,
  QuietHoursRow,
} from "./store";

/**
 * The daily per-user flag limit (PLAN section 6), on the same fixed-window counter and under the
 * same key as `apps/web/app/api/brief/flag/route.ts`'s `FLAG_USER_LIMIT`.
 *
 * The same key on purpose: the limit is per person per day, not per surface, and two independent
 * allowances would mean twenty flags a day for anyone who taps in both places. The constant is
 * duplicated only because `apps/bot` cannot import a Next.js route; see the report.
 */
const FLAG_USER_LIMIT = { windowSeconds: 24 * 3600, max: 10 } as const;

/** `channel_type` is a pg enum; this is the one value the bot ever writes or reads. */
const TELEGRAM = "telegram" as const;

function strings(value: readonly unknown[] | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function isIn<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function createBotStore(db: Db): BotStore {
  /**
   * Fixed-window counter on `rate_limits`, byte for byte the statement in
   * `apps/web/lib/cv/rate-limit.ts`: one atomic upsert returns the count including this call, and
   * the window start comes from the database clock rather than from any process's idea of now.
   */
  async function consumeRateLimit(key: string, windowSeconds: number, max: number) {
    const { rows } = await db.execute<{ count: number }>(sql`
      insert into rate_limits (key, window_start, count)
      values (
        ${key},
        to_timestamp(floor(extract(epoch from now()) / ${windowSeconds}::int) * ${windowSeconds}::int),
        1
      )
      on conflict (key, window_start) do update set count = rate_limits.count + 1
      returning count
    `);
    return Number(rows[0]?.count ?? Number.POSITIVE_INFINITY) <= max;
  }

  async function channelFor(chatId: string) {
    const rows = await db
      .select({ id: channels.id, userId: channels.userId, deadAt: channels.deadAt })
      .from(channels)
      .where(and(eq(channels.type, TELEGRAM), eq(channels.address, chatId)))
      .limit(1);
    return rows[0] ?? null;
  }

  return {
    async chat(chatId: string): Promise<LinkedChat | null> {
      const row = await channelFor(chatId);
      return row ? { channelId: row.id, userId: row.userId, deadAt: row.deadAt } : null;
    },

    /**
     * Redeem, then bind.
     *
     * The token is spent by `consumeTelegramLinkToken` before the binding transaction opens, and
     * it stays spent even if that transaction then fails. That is the safe way round: the token is
     * the whole credential, a single conditional update is what makes two racing `/start`s
     * impossible to both win, and a binding that failed leaves the user one tap from a fresh link.
     * The reverse order — bind, then spend — would let the same link bind two chats.
     *
     * `channels` is unique on `(type, address)`, so the shapes are handled explicitly rather than
     * left to a 23505:
     *   - this chat is bound to the token's own account → nothing to do but re-verify it;
     *   - this chat is bound to a *different* account → the binding moves, and the caller is told
     *     `rebound-account` so it can say so. The move is still allowed: refusing would strand a
     *     chat on an account nobody can prove they own any more. But it is **not** an ordinary
     *     connect, and the earlier version of this code reported it as one. A deep link is a
     *     bearer credential; an attacker can mint one for their own account and send it to
     *     somebody, and one tap then unbinds that person's Telegram and points their chat at the
     *     attacker's matches. Allowing it quietly is the defect — the type already distinguished
     *     the two, and the reply collapsed them;
     *   - the account has a *different* chat → that row's address moves here, so "connect
     *     Telegram again from a new phone" replaces the old chat instead of stacking a second one,
     *     and the old chat's id comes back in `disconnected` so it can be told.
     *
     * Any further Telegram row for the same account is then retired: a person has one Telegram.
     */
    async link({ token, chatId, now }): Promise<LinkOutcome> {
      const redeemed = await consumeTelegramLinkToken(db, { token, chatId, now });
      if (!redeemed) return { kind: "invalid-token" };
      const { userId } = redeemed;

      return db.transaction(async (tx) => {
        const live = { userId, enabled: true, verifiedAt: now, deadAt: null, deadReason: null };

        /** Take this chat's row for ourselves, whoever held it, and say who held it. */
        const claim = async (row: { id: string; userId: string }): Promise<LinkSuccess> => {
          await tx.update(channels).set(live).where(eq(channels.id, row.id));
          return row.userId === userId ? "already-linked" : "rebound-account";
        };

        const held = await tx
          .select({ id: channels.id, userId: channels.userId })
          .from(channels)
          .where(and(eq(channels.type, TELEGRAM), eq(channels.address, chatId)))
          .limit(1)
          .for("update");
        const existing = held[0];

        const disconnected: string[] = [];
        let kind: LinkSuccess;

        if (existing) {
          kind = await claim(existing);
        } else {
          const owned = await tx
            .select({ id: channels.id, address: channels.address })
            .from(channels)
            .where(and(eq(channels.userId, userId), eq(channels.type, TELEGRAM)))
            .limit(1)
            .for("update");
          const prior = owned[0];

          if (prior) {
            // The address moves rather than the row, so quiet hours and the time zone written by
            // the settings page survive a reconnect from a new phone.
            await tx
              .update(channels)
              .set({ ...live, address: chatId })
              .where(eq(channels.id, prior.id));
            disconnected.push(prior.address);
            kind = "linked";
          } else {
            /**
             * `onConflictDoNothing` and then look, rather than `onConflictDoUpdate` and assume.
             *
             * The select above locks nothing when it finds nothing, so two `/start`s for two
             * different accounts in the same chat both reach this branch. An upsert makes the
             * second one win silently and lets it report `linked` — a lost update dressed as a
             * success, and the *interesting* one at that, because the second caller is exactly
             * the person who took a chat away from another account and most needs telling.
             *
             * Doing nothing on conflict turns that race into the ordinary case above: the insert
             * returns no row, we re-read whoever got there first, and `claim` reports
             * `rebound-account` against their id. The first caller's "Connected" was true when it
             * committed and cannot be un-said; the second caller's reply is now honest.
             */
            const inserted = await tx
              .insert(channels)
              .values({ ...live, type: TELEGRAM, address: chatId })
              .onConflictDoNothing({ target: [channels.type, channels.address] })
              .returning({ id: channels.id });

            if (inserted[0]) {
              kind = "linked";
            } else {
              const raced = await tx
                .select({ id: channels.id, userId: channels.userId })
                .from(channels)
                .where(and(eq(channels.type, TELEGRAM), eq(channels.address, chatId)))
                .limit(1)
                .for("update");
              const winner = raced[0];
              // Deleted between the conflict and the re-read: nothing holds the address now, and
              // the next `/start` will insert cleanly. Report the truth rather than a guess.
              if (!winner) throw new Error("channel row vanished during link");
              kind = await claim(winner);
            }
          }
        }

        // One person, one Telegram chat. Any older row for this account goes; `delivery_log`
        // points at channels with `on delete set null`, so its history survives the removal.
        const removed = await tx
          .delete(channels)
          .where(
            and(
              eq(channels.userId, userId),
              eq(channels.type, TELEGRAM),
              ne(channels.address, chatId),
            ),
          )
          .returning({ address: channels.address });
        for (const row of removed) disconnected.push(row.address);

        return { kind, disconnected: [...new Set(disconnected)] };
      });
    },

    async setPaused({ userId, pausedAt }) {
      await setDeliveryPaused(db, { userId, pausedAt });
    },

    async pausedAt(userId) {
      return deliveryPausedAt(db, userId);
    },

    async quietHours(userId): Promise<QuietHoursRow | null> {
      const rows = await db
        .select({
          startMinute: channels.quietStartMinute,
          endMinute: channels.quietEndMinute,
          timezone: channels.timezone,
        })
        .from(channels)
        .where(and(eq(channels.userId, userId), eq(channels.type, TELEGRAM)))
        .limit(1);
      const row = rows[0];
      if (!row || row.startMinute === null || row.endMinute === null || row.timezone === null) {
        return null;
      }
      return { startMinute: row.startMinute, endMinute: row.endMinute, timezone: row.timezone };
    },

    async setQuietHours({ userId, window }): Promise<QuietHoursOutcome> {
      return db.transaction(async (tx) => {
        if (window === null) {
          // The zone is left in place: it is a fact about the person, not about the window, and
          // the dispatcher reads it for more than quiet hours.
          await tx
            .update(channels)
            .set({ quietStartMinute: null, quietEndMinute: null })
            .where(eq(channels.userId, userId));
          return "cleared";
        }

        const rows = await tx
          .select({ timezone: profiles.timezone })
          .from(profiles)
          .where(eq(profiles.userId, userId))
          .limit(1);
        const timezone = rows[0]?.timezone ?? null;
        // Minutes in nobody's particular day are not quiet hours. Better to say so than to guess
        // at UTC and hold someone's matches through their afternoon.
        if (timezone === null) return "no-timezone";

        await tx
          .update(channels)
          .set({
            quietStartMinute: window.startMinute,
            quietEndMinute: window.endMinute,
            timezone,
          })
          .where(eq(channels.userId, userId));
        return "set";
      });
    },

    async matchJob({ userId, matchId }) {
      const rows = await db
        .select({ jobId: matches.jobId })
        .from(matches)
        .where(and(eq(matches.id, matchId), eq(matches.userId, userId)))
        .limit(1);
      const row = rows[0];
      return row ? { jobId: row.jobId } : null;
    },

    async setMatchState({ userId, matchId, state, passReason }) {
      const jobId = await db.transaction(async (tx) => {
        const updated = await tx
          .update(matches)
          .set({
            state,
            passReason: state === "passed" ? passReason : null,
            stateChangedAt: new Date(),
          })
          .where(and(eq(matches.id, matchId), eq(matches.userId, userId)))
          .returning({ jobId: matches.jobId });

        const jobId = updated[0]?.jobId;
        if (jobId === undefined) return null;
        if (state !== "passed" || passReason === null) return jobId;

        // PLAN D6: the one-tap reason tunes future scoring. The profile row is locked for the
        // read-modify-write because `scoring_nudges` is a jsonb map and two taps in the same
        // second would otherwise lose one of them.
        const held = await tx
          .select({ nudges: profiles.scoringNudges, stack: profiles.stack })
          .from(profiles)
          .where(eq(profiles.userId, userId))
          .limit(1)
          .for("update");
        const current = held[0];
        if (!current) return jobId;

        const facts = await tx
          .select({
            companyId: jobs.companyId,
            roleFamily: jobs.roleFamily,
            seniority: jobEnrichment.seniority,
            stack: jobEnrichment.stack,
            jobSalaryMin: jobs.salaryMin,
            jobSalaryMax: jobs.salaryMax,
            enrichedSalaryMin: jobEnrichment.salaryMin,
            enrichedSalaryMax: jobEnrichment.salaryMax,
          })
          .from(jobs)
          .leftJoin(jobEnrichment, eq(jobEnrichment.jobId, jobs.id))
          .where(eq(jobs.id, jobId))
          .limit(1);
        const job = facts[0];
        if (!job) return jobId;

        const nudgeJob: NudgeJob = {
          companyId: job.companyId,
          roleFamily: isIn<RoleFamily>(ROLE_FAMILIES, job.roleFamily) ? job.roleFamily : null,
          seniority: isIn(DB_SENIORITIES, job.seniority) ? fromDbSeniority(job.seniority) : null,
          stack: strings(job.stack),
          listsSalary:
            (job.enrichedSalaryMin ?? job.jobSalaryMin) !== null ||
            (job.enrichedSalaryMax ?? job.jobSalaryMax) !== null,
        };

        await tx
          .update(profiles)
          .set({
            scoringNudges: applyPassFeedback(current.nudges, {
              reason: passReason,
              job: nudgeJob,
              userStack: strings(current.stack),
            }),
          })
          .where(eq(profiles.userId, userId));

        return jobId;
      });

      if (jobId === null) return false;

      /**
       * "I applied" on a card writes the application row, not only `matches.state`.
       *
       * This is the defect the tracker was built on top of. Both "I applied" paths — this one and
       * `apps/web/app/api/brief/_lib/db.ts`'s `setMatchState` — moved the match and stopped, so
       * nothing in the product ever inserted an `applications` row and the tracker's Applied column
       * had no source at all. A person could tap the button on every card they were sent and open
       * the board to find it empty.
       *
       * `upsertApplication` is the kernel helper the web calls too; the bot could reach Drizzle
       * directly here and deliberately does not, because a second implementation of this upsert is
       * how the two surfaces come to disagree about what "applied" wrote.
       *
       * **Outside the transaction, and after it.** The helper takes a `Db` and not a transaction
       * handle, so the alternative was to hand-write the insert here — trading a real, bounded
       * failure for a duplicate of the one statement that must not be duplicated. The failure this
       * leaves is a moved match with no application row, and it is not swallowed: it propagates to
       * `bot.ts`'s error boundary, which answers the callback query and leaves the card's buttons in
       * place, so the person can tap again and both writes are idempotent. Logging it and reporting
       * success would rebuild the exact defect above.
       */
      if (state === "applied") {
        await upsertApplication(db, { userId, jobId, matchId, state: "applied" });
      }

      return true;
    },

    /**
     * Store one flag (PLAN D26, section 6).
     *
     * A duplicate is refused before the counter is touched, so the limit counts *stored* flags,
     * which is the reading `apps/web/app/api/brief/flag/route.ts` settled on. `note` is null on
     * every path: this picker has no free text, so there is nothing to store and nothing that
     * could ever reach a model. `country` is the flagger's own residence, read inside the same
     * statement, because that is what "not open to my country" means.
     *
     * "Duplicate" means *this job, by this person*, and not *this job for this reason*, which is
     * narrower than the `(job_id, user_id, reason)` unique index allows and is exactly what
     * `hasFlagged` in the web route already enforces. Following the index instead would let one
     * person file six reports on one post from Telegram and one from the Brief, which is both an
     * inconsistency between two surfaces and six times the weight on a single post's verdict.
     */
    async storeFlag({ userId, jobId, reason, field }): Promise<FlagOutcome> {
      const seen = await db
        .select({ id: flags.id })
        .from(flags)
        .where(and(eq(flags.jobId, jobId), eq(flags.userId, userId)))
        .limit(1);
      if (seen.length > 0) return "duplicate";

      const within = await consumeRateLimit(
        `flag:user:${userId}`,
        FLAG_USER_LIMIT.windowSeconds,
        FLAG_USER_LIMIT.max,
      );
      if (!within) return "limited";

      const inserted = await db.execute<{ id: string }>(sql`
        insert into flags (job_id, user_id, reason, country, field)
        values (
          ${jobId}, ${userId}, ${reason}::flag_reason,
          (select residence_country from profiles where user_id = ${userId}),
          ${field}::flag_field
        )
        on conflict do nothing
        returning id
      `);
      return inserted.rows.length > 0 ? "stored" : "duplicate";
    },

    async markChatDead({ chatId, reason, at }) {
      const row = await channelFor(chatId);
      if (!row) return;
      await markChannelDead(db, { channelId: row.id, reason: reason as ChannelDeadReason, at });
    },

    async reviveChat({ chatId }) {
      const row = await channelFor(chatId);
      if (!row) return;
      await clearChannelDead(db, { channelId: row.id });
    },
  };
}
