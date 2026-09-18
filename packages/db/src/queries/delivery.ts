// Read and write paths for the dispatcher (PLAN D8, D13, phase 08). Runs in `apps/worker`, which
// can import this package and therefore use the Drizzle query builder; `apps/web` resolves a second
// copy of `drizzle-orm` and cannot (see `apps/web/app/api/brief/_lib/db.ts`).
//
// ============================================================================================
// THE EXACTLY-ONCE DECISION
// ============================================================================================
//
// The requirement: a given match reaches a given channel **exactly once**, with several dispatcher
// instances running at the same time, and across a crash between "decided to send" and "sent".
//
// `delivery_log_match_channel_sent_uq` — the partial unique index on `(match_id, channel_type)
// where status = 'sent'` — cannot be the mechanism. It only notices a second delivery when the
// second row is written, which is *after* the second message has gone out. It is the backstop, and
// it stays exactly where it was.
//
// **Chosen ordering: claim, then send, then record.**
//
//   1. `claimDelivery` inserts a `delivery_log` row with `status = 'claimed'` and
//      `ON CONFLICT DO NOTHING`. `delivery_log_match_channel_live_uq` (added in migration 0013)
//      allows one non-terminal row per `(match_id, channel_type)`, so exactly one caller gets a row
//      back and everyone else gets null and moves on. No advisory lock, no `SELECT ... FOR UPDATE`,
//      no lock held across an HTTP call: the insert either won or it did not, and the outcome is
//      durable the moment it commits.
//   2. The dispatcher calls the provider.
//   3. `recordDeliverySent` moves that same row to `sent` and stamps `matches.<channel>_delivered_at`
//      in one transaction, or `failDelivery` / `skipDelivery` moves it to `failed` / `skipped`.
//      Both terminal statuses are outside the live index's predicate, so they release the claim and
//      a later tick may try again.
//
// **Why not send, then record.** Send-then-record has no window at all in which a message is lost,
// and an unbounded one in which it is sent twice: two dispatchers can both read the same due match,
// both send, and only then discover the unique index. Duplicates there are not rare — they are what
// happens on every overlapping tick. The claim makes the mutual exclusion happen *before* the
// irreversible act, which is the only place it can do any good.
//
// **The failure mode this accepts.** Claim-then-send moves the uncertainty to one narrow window:
// the provider accepted the message and the process died before step 3 committed. The row is left
// at `claimed`, and nothing in the database knows whether the message went out.
//
// We resolve that window in favour of **sending again**. `reclaimStaleDeliveries` releases a claim
// older than the caller's cutoff (`failed`, with `error = 'claim_expired'`), which lets the next
// tick re-claim and re-send. So the guarantee is *exactly once in the absence of a crash, and at
// most one extra copy per crash*, bounded by `maxAttempts` on the selection below.
//
// That direction is deliberate. The alternative — leave a stale claim in place, or mark it failed
// for ever — trades a duplicate card for a match the user never hears about, and never hearing
// about a job is the product failing at the one thing it does. A duplicate is visible, annoying and
// recoverable; a silent drop is none of those.
//
// The window is also small on purpose. The cutoff a caller passes must be comfortably longer than
// any provider timeout (Resend's client here uses 10 s), so a slow response is never mistaken for a
// crash; only a process that actually died leaves a claim behind, and only a process that died in
// the few hundred milliseconds between "provider said 200" and "commit" can produce a duplicate at
// all. Everything earlier in that window — died before the call, died mid-call — re-sends a message
// that was never delivered, which is the correct outcome, not a duplicate.
//
// **Quiet hours are decided before the claim, not after.** A held message must leave no row at all.
// `skipDelivery` writes `skipped`, which is outside the live index's predicate and therefore
// releases the lock — correct for every skip that also removes the match from `selectDueMatches`
// (the post closed, the channel died, the user paused), because the next tick simply does not offer
// it again. Quiet hours are the one skip reason that is *not* one of those exclusions: there is no
// release-time column on `matches`, so a dispatcher that claimed first and checked the clock second
// would re-claim and re-skip every held match on every tick for the whole nine-hour window. The
// dispatcher therefore evaluates `isWithinQuietHours` before it calls `claimDelivery`. `maxSkips`
// below is the backstop for that ordering being got wrong, not the mechanism.
//
// **Crash recovery, concretely.** A dispatcher tick calls `reclaimStaleDeliveries(db, { olderThan:
// new Date(now - staleClaimMs) })` before it selects work. Rows still `claimed` past the cutoff
// become `failed` with `claim_expired`. `selectDueMatches` counts a match's `failed` rows for that
// channel and stops offering it once they reach `maxAttempts`, so a match that keeps crashing the
// dispatcher is retried a bounded number of times and then left alone with its failures on the
// record, rather than looping for ever.
//
// **And if the backstop does fire.** `recordDeliverySent` catches SQLSTATE 23505 and reports
// `already-sent` instead of throwing. Nothing in this module can reach that on its own — a
// duplicate send here ends at `claim-lost`, because the second writer's own row has already been
// released to `failed` and the guarded update matches nothing. The catch is for a `sent` row
// written by something that did not go through this module: the seed, a manual repair, a future
// code path. It turns that into a result the dispatcher can count instead of an exception it has to
// guess about, and the log still says the match was sent once.
//
// **What the guarantee does not cover.** Both unique indexes are partial on `match_id is not null`,
// so they say nothing about a `pass_reminder` or a `system` message — those have no match, and
// `delivery_log` already holds one such row from the seed (`../seed.ts`). Nothing here stops two of
// those going out. Today the only thing preventing it is that `ClaimDeliveryParams.matchId` is
// typed `string`, which is a compiler's opinion and not a constraint. A phase that starts sending
// reminders needs its own idempotency key — the natural one is `(user_id, kind, period)` — and must
// not assume this module already covers it.
//
// ============================================================================================
//
// Demo rows: staging holds seeded `channels` for three fictional users, two of them with
// `@example.com` addresses. Sending to those is real outbound mail to bogus mailboxes. Every
// selection here therefore excludes them — see `notDemo` below.
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "../client";
import {
  channels,
  companies,
  deliveryLog,
  jobEnrichment,
  jobs,
  matches,
  profiles,
} from "../schema";
import { telegramLinkTokens } from "../schema";
import type { GateResult } from "../schema";
import type { EligibilityTier } from "./matching";
import { FRESHNESS_HOURS } from "@pemby/core";
import type { PassReasonValue } from "@pemby/core";

// Enum-valued types are read off the schema rather than re-declared, so a pg enum change cannot
// silently drift from this contract.
export type ChannelType = (typeof channels.$inferSelect)["type"];
export type ChannelDeadReason = NonNullable<(typeof channels.$inferSelect)["deadReason"]>;
export type DeliveryKind = (typeof deliveryLog.$inferSelect)["kind"];
export type DeliveryStatus = (typeof deliveryLog.$inferSelect)["status"];
export type PushKeys = NonNullable<(typeof channels.$inferSelect)["pushKeys"]>;
export type MatchPassReason = NonNullable<(typeof matches.$inferSelect)["passReason"]>;

/**
 * The statuses that release the lock. Everything else — `sent`, `claimed`, and anything a later
 * phase adds — is a row that stands, and is what `delivery_log_match_channel_live_uq` keeps unique.
 *
 * `Extract` rather than a literal union, so renaming either value in the pg enum breaks this line
 * instead of leaving a lock that is never released.
 */
type TerminalStatus = Extract<DeliveryStatus, "failed" | "skipped">;

/** PLAN D2 as amended: white and red never reach anyone, on any channel. */
const DELIVERABLE_TIERS: readonly EligibilityTier[] = ["green", "yellow"];

/** Default ceiling on `failed` rows for one (match, channel) before it is left alone. */
export const DEFAULT_MAX_DELIVERY_ATTEMPTS = 3;

/** Ceiling on `skipped` rows. Higher than the failure ceiling: a skip is usually self-healing. */
export const DEFAULT_MAX_DELIVERY_SKIPS = 10;

/** Deep links are short-lived by design: long enough to paste, too short to sit in a chat log. */
export const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

/** 32 bytes of `randomBytes`, base64url: 43 characters, inside Telegram's 64-char `start` limit. */
const LINK_TOKEN_BYTES = 32;

/**
 * The per-channel column on `matches` that records a delivery.
 *
 * A `Record` keyed by the channel enum rather than a string built at the call site: adding a
 * channel type makes this a type error instead of a lookup that silently returns undefined, and no
 * column name is ever interpolated into SQL.
 */
type DeliveredAtField = "telegramDeliveredAt" | "emailDeliveredAt" | "pushDeliveredAt";

const DELIVERED_AT_FIELD = {
  telegram: "telegramDeliveredAt",
  email: "emailDeliveredAt",
  push: "pushDeliveredAt",
} as const satisfies Record<ChannelType, DeliveredAtField>;

/** The column to read. Derived from the table above, never named at a call site. */
const deliveredAtColumn = (channelType: ChannelType) => matches[DELIVERED_AT_FIELD[channelType]];

/**
 * The column to write, as an update object.
 *
 * Drizzle's `.set()` needs a literal key, so this is a switch rather than a computed property — but
 * it switches on `DELIVERED_AT_FIELD[channelType]`, not on the channel type, and its `default`
 * branch assigns to `never`. A fourth channel type is then a type error twice over: at the
 * `satisfies` above for the missing entry, and here for the unhandled field. This used to be a
 * ternary chain whose `else` was `pushDeliveredAt`, which would have stamped the wrong column in
 * silence.
 */
function deliveredAtSet(channelType: ChannelType, at: Date) {
  const field: DeliveredAtField = DELIVERED_AT_FIELD[channelType];
  switch (field) {
    case "telegramDeliveredAt":
      return { telegramDeliveredAt: at };
    case "emailDeliveredAt":
      return { emailDeliveredAt: at };
    case "pushDeliveredAt":
      return { pushDeliveredAt: at };
    default: {
      const unhandled: never = field;
      throw new Error(`unhandled delivered-at field: ${String(unhandled)}`);
    }
  }
}

/**
 * Not a fictional recipient.
 *
 * `profiles.is_demo` rather than a new flag on `channels`, and rather than an env gate. The seed
 * marks the *person* fictional (`packages/db/src/seed.ts`), so every channel a demo user has or
 * later acquires is covered by one condition that nobody has to remember to set — a `channels.is_demo`
 * column would default to false on any row added by hand or by a future seed, which is exactly the
 * row that would then be sent to. And an env gate would make the safety of a production send depend
 * on a variable being right, which is a worse place for it than a join.
 *
 * The profile join is inner, not a semi-join, so a user with no profile row is excluded rather than
 * admitted. That is also true on its own terms: no profile means no onboarding and nothing to send.
 */
const notDemo = (): SQL => sql`${profiles.isDemo} = false`;

/** Delivery is not paused for this user (`/pause`, or the switch in settings). */
const notPaused = (): SQL => sql`${profiles.deliveryPausedAt} is null`;

/**
 * There is a card to render.
 *
 * `residence_country` is what the tier verdict's `{country}` is built from — "Likely for Moldova"
 * has nowhere to come from without it — so a match belonging to a user who has cleared the field
 * cannot be turned into a message at all, in the same way a demo profile has no recipient.
 *
 * **A filter, not a retirement, and the difference is the whole point.** The dispatcher used to
 * take these rows, fail to render them, and write nothing — no claim, so no `delivery_log` row, so
 * nothing `maxSkips` could ever bound — which meant the same rows were re-selected and re-skipped
 * on every drain for ever, holding slots in the overselect. The fix is to stop offering them, not
 * to count them out: retiring them against `maxSkips` would silence that channel permanently for
 * every match the user already has, *including after they fill the field back in*. As a `where`
 * clause, the moment the country comes back the existing matches are deliverable again on the next
 * drain, with no repair step and nothing to undo.
 *
 * This is also what makes the dispatcher's `unrenderable` counter worth reading. With this
 * predicate in place a row reaching the renderer without a country, or with a tier the selection
 * above already refuses, is corruption rather than routine — so a steady non-zero count is a signal,
 * not noise. `DueMatch.residenceCountry` stays nullable for exactly that reason: narrowing it to
 * `string` here would make the corruption case unrepresentable, and therefore unreportable.
 */
const renderable = (): SQL => sql`${profiles.residenceCountry} is not null`;

/** The channel is switched on by its owner, verified, and not known to be dead. */
const channelIsLive = (): SQL =>
  sql`${channels.enabled} = true and ${channels.verifiedAt} is not null and ${channels.deadAt} is null`;

// ---- 1. Matches due for delivery on one channel ---------------------------------------------

export interface DueMatchesParams {
  /** The channel being dispatched. One call per channel type. */
  channelType: ChannelType;
  /** Maximum rows to return. The dispatcher's batch size. */
  limit: number;
  /**
   * The post must have been verified live within this many hours — the same bar the freshness hard
   * gate was decided on, re-checked here because the gate ran when the row was written and the row
   * has been ageing ever since.
   *
   * Defaults to `FRESHNESS_HOURS`, exactly as `selectBrief` does (`./matching.ts`), and **omitting
   * it is not the same as passing null**. This is a send path: a job first seen forty days ago and
   * never re-verified is still `status = 'open'`, and a default of "no check" would put it in
   * someone's Telegram and inbox while the Brief — same parameter, same type, fail-closed — hid the
   * identical row. Only an explicit `null` turns the check off.
   */
  freshnessHours?: number | null;
  /** Tiers that may be delivered. Default green and yellow. */
  allowedTiers?: readonly EligibilityTier[];
  /** Stop offering a (match, channel) once it has this many `failed` rows. */
  maxAttempts?: number;
  /**
   * The same ceiling for `skipped` rows, counted separately because a skip is a decision and a
   * failure is an accident, and one counter for both would let three quiet-hours skips retire a
   * match that has never once been attempted.
   *
   * A pure backstop: a correct dispatcher decides quiet hours before it claims and writes no row at
   * all for a held match. This bounds the damage if one does not.
   */
  maxSkips?: number;
}

/**
 * One match ready to be turned into a card. Everything the card needs and nothing it does not: no
 * CV text, no profile contents, no address.
 */
export interface DueMatch {
  matchId: string;
  userId: string;
  jobId: string;
  title: string;
  companyName: string;
  url: string;
  applyUrl: string | null;
  tier: EligibilityTier;
  /**
   * The user's residence country, ISO 3166-1 alpha-2. `MatchCard.country` takes it as-is and the
   * kernel resolves it to a name for the verdict line; the dispatcher must not resolve it twice.
   */
  residenceCountry: string | null;
  /**
   * `matches.way_of_working`, the raw pg enum value. The dispatcher words it through `WAY_LABELS`
   * in `@pemby/core` before it reaches `MatchCard.wayOfWorking`, which is display text — the card
   * renders sentences and does not translate slugs.
   */
  wayOfWorking: (typeof matches.$inferSelect)["wayOfWorking"];
  /** The gate verdicts as the matcher wrote them; the eligibility one carries the tier reason. */
  gateResults: GateResult[];
  /** English fallback for rows written before migration 0009. */
  reasons: string[];
  reasonKeys: string[];
  reasonParams: Record<string, string>[];
  gap: string | null;
  gapKey: string | null;
  gapParams: Record<string, string>;
  score: number;
  /** Enrichment's reading of the pay, falling back to the post's own. Formatting is the caller's. */
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: (typeof jobs.$inferSelect)["salaryPeriod"];
  deliverAfter: Date | null;
  /** PLAN D13: the delay note is measured from here, never from the 24-hour constant. */
  firstSeenAt: Date;
  lastVerifiedLiveAt: Date | null;
}

/**
 * Matches whose delivery window has opened and which this channel has not delivered yet.
 *
 * Narrowed in SQL, not in Node, for the same reason the matcher's queries are: staging already
 * holds thousands of open jobs and this runs on every tick. Every condition below is one the
 * dispatcher would otherwise have to re-check per row after paying to fetch it.
 *
 * What it excludes, and why:
 *   - near misses, and matches whose `deliver_after` has not passed (PLAN D13);
 *   - posts that closed, were merged into another, or aged out of the freshness window since the
 *     match was written — the row itself says nothing about any of it;
 *   - fictional recipients and fictional posts (`notDemo`, `jobs.is_demo`);
 *   - matches with no card to render, because the user has no residence country (`renderable`);
 *   - users who paused delivery, and users with no live channel of this type, so a batch is not
 *     spent on matches that cannot go anywhere;
 *   - anything already marked delivered on this channel, anything with a live `delivery_log` row
 *     (a claim in flight or a completed send), and anything that has already failed `maxAttempts`
 *     times or been skipped `maxSkips` times.
 */
export async function selectDueMatches(db: Db, params: DueMatchesParams): Promise<DueMatch[]> {
  const { channelType, limit } = params;
  const allowedTiers = params.allowedTiers ?? DELIVERABLE_TIERS;
  const maxAttempts = params.maxAttempts ?? DEFAULT_MAX_DELIVERY_ATTEMPTS;
  const maxSkips = params.maxSkips ?? DEFAULT_MAX_DELIVERY_SKIPS;
  // `=== undefined`, not `??`: see the note on the parameter. `selectBrief` reads it the same way.
  const freshnessHours =
    params.freshnessHours === undefined ? FRESHNESS_HOURS : params.freshnessHours;
  if (allowedTiers.length === 0 || limit <= 0) return [];

  const deliveredAt = deliveredAtColumn(channelType);

  const conditions: (SQL | undefined)[] = [
    eq(matches.kind, "match"),
    inArray(matches.tier, [...allowedTiers]),
    sql`(${matches.deliverAfter} is null or ${matches.deliverAfter} <= now())`,
    eq(jobs.status, "open"),
    isNull(jobs.duplicateOfJobId),
    sql`${jobs.isDemo} = false`,
    notDemo(),
    notPaused(),
    renderable(),
    isNull(deliveredAt),
    // A live row is a claim in flight or a completed send. Either one means hands off.
    sql`not exists (
      select 1 from ${deliveryLog} dl
      where dl.match_id = ${matches.id}
        and dl.channel_type = ${channelType}::channel_type
        and dl.status not in ('failed', 'skipped')
    )`,
    sql`(
      select count(*) from ${deliveryLog} dl
      where dl.match_id = ${matches.id}
        and dl.channel_type = ${channelType}::channel_type
        and dl.status = 'failed'
    ) < ${maxAttempts}::int`,
    sql`(
      select count(*) from ${deliveryLog} dl
      where dl.match_id = ${matches.id}
        and dl.channel_type = ${channelType}::channel_type
        and dl.status = 'skipped'
    ) < ${maxSkips}::int`,
    sql`exists (
      select 1 from ${channels} ch
      where ch.user_id = ${matches.userId}
        and ch.type = ${channelType}::channel_type
        and ch.enabled = true
        and ch.verified_at is not null
        and ch.dead_at is null
    )`,
  ];

  if (freshnessHours !== null) {
    conditions.push(sql`${jobs.lastVerifiedLiveAt} is not null`);
    conditions.push(
      sql`${jobs.lastVerifiedLiveAt} >= now() - make_interval(hours => ${freshnessHours}::int)`,
    );
  }

  const rows = await db
    .select({
      matchId: matches.id,
      userId: matches.userId,
      jobId: matches.jobId,
      tier: matches.tier,
      wayOfWorking: matches.wayOfWorking,
      residenceCountry: profiles.residenceCountry,
      gateResults: matches.gateResults,
      reasons: matches.reasons,
      reasonKeys: matches.reasonKeys,
      reasonParams: matches.reasonParams,
      gap: matches.gap,
      gapKey: matches.gapKey,
      gapParams: matches.gapParams,
      score: matches.score,
      deliverAfter: matches.deliverAfter,
      title: jobs.title,
      url: jobs.url,
      applyUrl: jobs.applyUrl,
      firstSeenAt: jobs.firstSeenAt,
      lastVerifiedLiveAt: jobs.lastVerifiedLiveAt,
      jobSalaryMin: jobs.salaryMin,
      jobSalaryMax: jobs.salaryMax,
      jobSalaryCurrency: jobs.salaryCurrency,
      jobSalaryPeriod: jobs.salaryPeriod,
      enrichedSalaryMin: jobEnrichment.salaryMin,
      enrichedSalaryMax: jobEnrichment.salaryMax,
      enrichedSalaryCurrency: jobEnrichment.salaryCurrency,
      enrichedSalaryPeriod: jobEnrichment.salaryPeriod,
      companyName: companies.name,
    })
    .from(matches)
    .innerJoin(jobs, eq(jobs.id, matches.jobId))
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(profiles, eq(profiles.userId, matches.userId))
    .leftJoin(jobEnrichment, eq(jobEnrichment.jobId, jobs.id))
    .where(and(...conditions))
    // Oldest window first: a match that has been waiting goes before one that just became due, so a
    // backlog drains in the order the users have been waiting rather than by score.
    //
    // `nulls first` explicitly. Postgres sorts NULLs last in an ascending order, while the condition
    // above treats a null `deliver_after` as *immediately due* — and `retireStaleMatches` writes
    // exactly that when it withdraws a verdict (`./matching.ts`) — so the default would have queued
    // the most overdue rows behind every delayed one, which is the opposite of the point.
    .orderBy(sql`${matches.deliverAfter} asc nulls first`, desc(matches.score), asc(matches.id))
    .limit(limit);

  return rows.map((r) => {
    // Enrichment wins only when it read a band at all, which is the same rule `selectBrief` uses;
    // the two surfaces would otherwise print different pay for the same job.
    const enriched = r.enrichedSalaryMin !== null || r.enrichedSalaryMax !== null;
    return {
      matchId: r.matchId,
      userId: r.userId,
      jobId: r.jobId,
      title: r.title,
      companyName: r.companyName,
      url: r.url,
      applyUrl: r.applyUrl,
      tier: r.tier,
      residenceCountry: r.residenceCountry,
      wayOfWorking: r.wayOfWorking,
      gateResults: r.gateResults,
      reasons: r.reasons,
      reasonKeys: r.reasonKeys,
      reasonParams: r.reasonParams,
      gap: r.gap,
      gapKey: r.gapKey,
      gapParams: r.gapParams,
      score: Number(r.score),
      salaryMin: enriched ? r.enrichedSalaryMin : r.jobSalaryMin,
      salaryMax: enriched ? r.enrichedSalaryMax : r.jobSalaryMax,
      salaryCurrency: enriched ? r.enrichedSalaryCurrency : r.jobSalaryCurrency,
      salaryPeriod: enriched ? r.enrichedSalaryPeriod : r.jobSalaryPeriod,
      deliverAfter: r.deliverAfter,
      firstSeenAt: r.firstSeenAt,
      lastVerifiedLiveAt: r.lastVerifiedLiveAt,
    };
  });
}

// ---- 2. Where to send it --------------------------------------------------------------------

/** One channel a match may go out on, with the quiet window it is held against. */
export interface DeliveryChannel {
  channelId: string;
  userId: string;
  type: ChannelType;
  /** Telegram chat id, email address, or push endpoint URL. Personal data: never logged. */
  address: string;
  pushKeys: PushKeys | null;
  /** Feeds `QuietWindow` in `@pemby/core`; PLAN D8 keeps one window per user across their channels. */
  quietStartMinute: number | null;
  quietEndMinute: number | null;
  timezone: string | null;
}

/**
 * The live channels of these users, for this channel type.
 *
 * The demo and pause conditions are repeated here rather than left to `selectDueMatches`. They are
 * the two that cause a message to reach someone it should not, and this is the last read before an
 * address is handed to a provider; a second copy of a cheap semi-join is a reasonable price.
 */
export async function selectDeliverableChannels(
  db: Db,
  params: { userIds: readonly string[]; channelType: ChannelType },
): Promise<DeliveryChannel[]> {
  if (params.userIds.length === 0) return [];

  const rows = await db
    .select({
      channelId: channels.id,
      userId: channels.userId,
      type: channels.type,
      address: channels.address,
      pushKeys: channels.pushKeys,
      quietStartMinute: channels.quietStartMinute,
      quietEndMinute: channels.quietEndMinute,
      timezone: channels.timezone,
    })
    .from(channels)
    .innerJoin(profiles, eq(profiles.userId, channels.userId))
    .where(
      and(
        inArray(channels.userId, [...params.userIds]),
        eq(channels.type, params.channelType),
        channelIsLive(),
        notDemo(),
        notPaused(),
      ),
    );

  return rows;
}

// ---- 3. Claim, send, record -----------------------------------------------------------------

export interface ClaimDeliveryParams {
  userId: string;
  matchId: string;
  channelId: string;
  channelType: ChannelType;
  kind: DeliveryKind;
  /** PLAN D13: a free-tier match sent after the delay, which makes the card carry the note. */
  late: boolean;
}

/** The claim a caller must hold before it calls a provider. */
export interface DeliveryClaim {
  deliveryId: string;
}

/**
 * Take the lock, or find out someone else has it.
 *
 * `ON CONFLICT DO NOTHING` with no target, because the conflict may be on either partial unique
 * index and a partial index cannot be named as a conflict target without repeating its predicate.
 * Null means "not yours" — already claimed, or already sent — and is an ordinary outcome, not an
 * error: on overlapping ticks it is what most calls return.
 */
export async function claimDelivery(
  db: Db,
  params: ClaimDeliveryParams,
): Promise<DeliveryClaim | null> {
  const inserted = await db
    .insert(deliveryLog)
    .values({
      userId: params.userId,
      matchId: params.matchId,
      channelId: params.channelId,
      channelType: params.channelType,
      kind: params.kind,
      status: "claimed",
      late: params.late,
    })
    .onConflictDoNothing()
    .returning({ deliveryId: deliveryLog.id });

  return inserted[0] ?? null;
}

export type RecordSentResult =
  | { recorded: true }
  /** The claim was swept or taken over; the message may have gone out twice. Count it, don't throw. */
  | { recorded: false; reason: "claim-lost" }
  /** The backstop index fired: another row already records this (match, channel) as sent. */
  | { recorded: false; reason: "already-sent" };

export interface RecordSentParams {
  deliveryId: string;
  matchId: string;
  channelType: ChannelType;
  /** Telegram's `message_id`, Resend's id, or null for a provider that returns none. */
  providerMessageId: string | null;
  sentAt: Date;
}

/**
 * Close a claim as sent, and stamp the match, in one transaction.
 *
 * The update is guarded on `status = 'claimed'`: a claim this process no longer owns (because
 * `reclaimStaleDeliveries` released it) must not be quietly resurrected on top of whatever happened
 * since. `matches.<channel>_delivered_at` is only written when it is still null, so a re-send never
 * moves the recorded delivery time backwards or forwards.
 */
export async function recordDeliverySent(
  db: Db,
  params: RecordSentParams,
): Promise<RecordSentResult> {
  try {
    return await db.transaction(async (tx) => {
      const updated = await tx
        .update(deliveryLog)
        .set({
          status: "sent",
          providerMessageId: params.providerMessageId,
          sentAt: params.sentAt,
          error: null,
        })
        .where(and(eq(deliveryLog.id, params.deliveryId), eq(deliveryLog.status, "claimed")))
        .returning({ id: deliveryLog.id });

      if (updated.length === 0) return { recorded: false, reason: "claim-lost" } as const;

      await markMatchDelivered(tx, {
        matchId: params.matchId,
        channelType: params.channelType,
        at: params.sentAt,
      });
      return { recorded: true } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { recorded: false, reason: "already-sent" };
    throw error;
  }
}

export interface FinishDeliveryParams {
  deliveryId: string;
  /**
   * A **sanitized** label — `safeErrorLabel` in the worker. Never a provider message, which quotes
   * the request and therefore the recipient's address.
   */
  error: string | null;
}

/**
 * Close a claim as failed, releasing the lock so a later tick may try again.
 *
 * A failed row is outside `delivery_log_match_channel_live_uq`'s predicate on purpose: a transient
 * provider error should not retire a match for ever. `selectDueMatches` counts these rows, and
 * `maxAttempts` is what stops the retrying.
 */
export async function failDelivery(db: Db, params: FinishDeliveryParams): Promise<boolean> {
  return finish(db, params, "failed");
}

/**
 * Close a claim as skipped: the dispatcher decided not to send after taking the lock — the post
 * closed between selection and send, the channel died, the user paused. Also releases the lock.
 */
export async function skipDelivery(db: Db, params: FinishDeliveryParams): Promise<boolean> {
  return finish(db, params, "skipped");
}

async function finish(
  db: Db,
  params: FinishDeliveryParams,
  status: TerminalStatus,
): Promise<boolean> {
  const updated = await db
    .update(deliveryLog)
    .set({ status, error: params.error })
    .where(and(eq(deliveryLog.id, params.deliveryId), eq(deliveryLog.status, "claimed")))
    .returning({ id: deliveryLog.id });
  return updated.length > 0;
}

/** The error a released claim carries, so a sweep is distinguishable from a provider failure. */
export const CLAIM_EXPIRED_ERROR = "claim_expired";

/**
 * The shortest a claim may be left alone before the sweep may release it.
 *
 * Comfortably beyond any provider call this phase makes — the Resend client's timeout is 10 s
 * (`apps/web/lib/email/resend.ts`), and grammY with `autoRetry()` honours a `retry_after` that can
 * run to tens of seconds — so a slow send is never mistaken for a dead process.
 */
export const MIN_STALE_CLAIM_MS = 60_000;

/** A sensible tick-to-tick value: well clear of the floor, without leaving a crash unrepaired. */
export const DEFAULT_STALE_CLAIM_MS = 5 * 60_000;

/**
 * Release claims a crashed dispatcher left behind.
 *
 * Called at the top of a tick, before work is selected.
 *
 * It takes `now` and an age rather than a precomputed cutoff, and refuses an age below
 * `MIN_STALE_CLAIM_MS`. The arithmetic is the dangerous part: a caller that wrote
 * `now + staleClaimMs` by mistake would sweep every claim in the table on every tick, for ever,
 * producing duplicate cards and duplicate mail with no exception, no non-zero exit, and a return
 * value that reads as *busy* rather than broken. Every other invariant in this module is enforced by
 * the type system or an assertion at load; this was the last one left to a comment, and the only one
 * whose violation was invisible.
 *
 * Returns how many claims were released. A healthy dispatcher releases none — but that number alone
 * is not how a bug here would be noticed, which is why the floor is checked instead of described.
 */
export async function reclaimStaleDeliveries(
  db: Db,
  params: { now: Date; staleAfterMs: number },
): Promise<number> {
  if (!Number.isFinite(params.staleAfterMs) || params.staleAfterMs < MIN_STALE_CLAIM_MS) {
    throw new Error(
      `staleAfterMs must be at least ${MIN_STALE_CLAIM_MS}ms, got ${String(params.staleAfterMs)}`,
    );
  }
  const olderThan = new Date(params.now.getTime() - params.staleAfterMs);

  const released = await db
    .update(deliveryLog)
    .set({ status: "failed", error: CLAIM_EXPIRED_ERROR })
    .where(and(eq(deliveryLog.status, "claimed"), sql`${deliveryLog.createdAt} < ${olderThan}`))
    .returning({ id: deliveryLog.id });
  return released.length;
}

/**
 * Stamp `matches.<channel>_delivered_at`, once.
 *
 * Exported for the rare caller that has to mark a delivery it did not claim through this module;
 * the ordinary path is `recordDeliverySent`, which calls it inside its own transaction.
 */
export async function markMatchDelivered(
  db: Pick<Db, "update">,
  params: { matchId: string; channelType: ChannelType; at: Date },
): Promise<void> {
  await db
    .update(matches)
    .set(deliveredAtSet(params.channelType, params.at))
    .where(and(eq(matches.id, params.matchId), isNull(deliveredAtColumn(params.channelType))));
}

// ---- 4. Channel state ------------------------------------------------------------------------

/**
 * Record that a channel is gone for good: Telegram reported a block (`my_chat_member`), a push
 * endpoint answered 410, an address hard-bounced.
 *
 * `enabled` is left alone. It is the user's own switch and nothing but the user may move it; the
 * settings page reads both columns and can then say what actually happened instead of implying the
 * user turned the channel off themselves.
 */
export async function markChannelDead(
  db: Db,
  params: { channelId: string; reason: ChannelDeadReason; at: Date },
): Promise<void> {
  await db
    .update(channels)
    .set({ deadAt: params.at, deadReason: params.reason })
    .where(and(eq(channels.id, params.channelId), isNull(channels.deadAt)));
}

/** The user reconnected a dead channel. Clears the verdict; `enabled` is still theirs. */
export async function clearChannelDead(db: Db, params: { channelId: string }): Promise<void> {
  await db
    .update(channels)
    .set({ deadAt: null, deadReason: null })
    .where(eq(channels.id, params.channelId));
}

export type DeliveryPauseResult =
  /** Written. `pausedAt` is the value the row now holds, so a caller can echo it back. */
  | { applied: true; pausedAt: Date | null }
  /**
   * Nothing was written, because there is no such user. Not an error and not a retry: an account
   * deleted, or an anonymous session claimed, while the request was in flight.
   */
  | { applied: false; reason: "no-account" };

/**
 * `/pause` and `/resume`, and the same switch in settings. `pausedAt` null means resumed.
 *
 * Two things here are not decoration.
 *
 * **It creates the `profiles` row if there is none.** `delivery_paused_at` lives on `profiles`, and
 * an account that signed up but never finished onboarding has no `profiles` row — so a bare UPDATE
 * matched nothing, returned normally, and left the bot replying "paused" to someone whose next
 * match went out anyway. The insert is the shape `patchProfile` already uses
 * (`apps/web/app/api/profile/_lib/db.ts`), including its `where exists` on `user`: a profile is
 * never conjured for an account that is gone, and the attempt is a no-op rather than a foreign-key
 * error.
 *
 * **It returns whether it applied.** The old `Promise<void>` is what made the bug invisible — no
 * caller could have told, however carefully it was written. Two surfaces now say "paused" only when
 * something was paused, and a future silent no-op here is a type error at every call site instead
 * of a bug report. Ignoring the result still compiles, so a caller that has already guarded itself
 * is not broken by this.
 */
export async function setDeliveryPaused(
  db: Db,
  params: { userId: string; pausedAt: Date | null },
): Promise<DeliveryPauseResult> {
  return db.transaction(async (tx) => {
    // `select ... where exists` rather than a plain `values`: no row is created for a user that no
    // longer exists, and the statement stays a no-op instead of raising 23503.
    await tx.execute(
      sql`insert into ${profiles} (user_id)
          select ${params.userId} where exists (select 1 from "user" where id = ${params.userId})
          on conflict (user_id) do nothing`,
    );

    const updated = await tx
      .update(profiles)
      .set({ deliveryPausedAt: params.pausedAt })
      .where(eq(profiles.userId, params.userId))
      .returning({ pausedAt: profiles.deliveryPausedAt });

    const row = updated[0];
    // The insert above guarantees a profile exists whenever the user does, so zero rows here means
    // exactly one thing, and the result says which.
    return row === undefined
      ? ({ applied: false, reason: "no-account" } as const)
      : ({ applied: true, pausedAt: row.pausedAt } as const);
  });
}

/**
 * When this user paused delivery, or null.
 *
 * A user with no `profiles` row reads as null, which is "not paused" — deliberately, and not the
 * same conflation the writer had. For a reader the two really are one fact: nothing is being held
 * back from someone who has nothing to hold. The writer has to distinguish them because it makes a
 * claim about what it did; this only reports a state, and the state is the same either way.
 */
export async function deliveryPausedAt(db: Db, userId: string): Promise<Date | null> {
  const rows = await db
    .select({ pausedAt: profiles.deliveryPausedAt })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return rows[0]?.pausedAt ?? null;
}

// ---- 5. Telegram deep-link tokens ------------------------------------------------------------

export interface MintedLinkToken {
  /**
   * The raw token, for the `t.me/<bot>?start=<token>` URL. **Returned once and never stored.**
   * Only its SHA-256 reaches the database, and this string must not be logged.
   */
  token: string;
  expiresAt: Date;
}

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/**
 * Mint a single-use deep-link token for one user.
 *
 * 32 bytes of `randomBytes` in base64url: 43 characters, well inside Telegram's 64-character
 * `start` payload, and nothing in it identifies the user — the id is found by looking the hash up,
 * so a forwarded link discloses nothing and a guessed payload binds no one.
 *
 * Minting also retires the user's outstanding unused tokens, in the same transaction. "Create a new
 * link" has to mean the old one stops working, or a link screenshotted into a group chat a week ago
 * is still a way into the account.
 */
export async function mintTelegramLinkToken(
  db: Db,
  params: { userId: string; now: Date; ttlMs?: number },
): Promise<MintedLinkToken> {
  const token = randomBytes(LINK_TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(params.now.getTime() + (params.ttlMs ?? LINK_TOKEN_TTL_MS));

  await db.transaction(async (tx) => {
    await tx
      .delete(telegramLinkTokens)
      .where(and(eq(telegramLinkTokens.userId, params.userId), isNull(telegramLinkTokens.usedAt)));
    await tx.insert(telegramLinkTokens).values({
      userId: params.userId,
      tokenHash: hashToken(token),
      expiresAt,
    });
  });

  return { token, expiresAt };
}

/**
 * Redeem a token, once.
 *
 * One conditional update does the whole thing: the `used_at is null` and `expires_at > now()` tests
 * and the write happen inside a single statement, so two `/start`s racing on the same token cannot
 * both win — the second updates zero rows. A read-then-write would need a transaction and a lock to
 * say as much.
 *
 * Null means "no", for every reason there is: unknown, expired, already used. The caller must not
 * be told which, and nothing here echoes the token back.
 */
export async function consumeTelegramLinkToken(
  db: Db,
  params: { token: string; chatId: string; now: Date },
): Promise<{ userId: string } | null> {
  if (params.token.length === 0 || params.token.length > 64) return null;

  const redeemed = await db
    .update(telegramLinkTokens)
    .set({ usedAt: params.now, usedByChatId: params.chatId })
    .where(
      and(
        eq(telegramLinkTokens.tokenHash, hashToken(params.token)),
        isNull(telegramLinkTokens.usedAt),
        sql`${telegramLinkTokens.expiresAt} > ${params.now}`,
      ),
    )
    .returning({ userId: telegramLinkTokens.userId });

  return redeemed[0] ?? null;
}

/**
 * Housekeeping: drop tokens that expired before `before`. Used ones go too — the audit trail they
 * carry is only interesting while the link is recent.
 */
export async function deleteExpiredTelegramLinkTokens(
  db: Db,
  params: { before: Date },
): Promise<number> {
  const deleted = await db
    .delete(telegramLinkTokens)
    .where(sql`${telegramLinkTokens.expiresAt} < ${params.before}`)
    .returning({ id: telegramLinkTokens.id });
  return deleted.length;
}

// ---- 6. Small shared pieces -------------------------------------------------------------------

/**
 * SQLSTATE 23505, through Drizzle's wrapper. Drizzle re-throws the driver error with the original
 * on `cause`, so both places are checked — the same shape `safeErrorLabel` in the worker reads.
 */
function isUniqueViolation(error: unknown): boolean {
  const codeOf = (value: unknown): string =>
    value && typeof value === "object" && "code" in value && typeof value.code === "string"
      ? value.code
      : "";
  return (
    codeOf(error) === "23505" ||
    codeOf(error instanceof Error ? error.cause : undefined) === "23505"
  );
}

/**
 * How many times a match has been delivered on each channel. For the dispatcher's own counters and
 * for the admin view; never part of a send decision, which goes through the claim.
 */
export async function countDeliveries(
  db: Db,
  params: { matchId: string },
): Promise<{ channelType: ChannelType; status: DeliveryStatus; count: number }[]> {
  const rows = await db
    .select({
      channelType: deliveryLog.channelType,
      status: deliveryLog.status,
      total: count(),
    })
    .from(deliveryLog)
    .where(eq(deliveryLog.matchId, params.matchId))
    .groupBy(deliveryLog.channelType, deliveryLog.status);

  return rows.map((r) => ({ channelType: r.channelType, status: r.status, count: r.total }));
}

/**
 * Compile-time parity between the pass reasons `@pemby/core` spells for its callback buttons and
 * the `match_pass_reason` pg enum they are written into.
 *
 * `packages/core/src/delivery/callback.ts` has to declare those values itself — core cannot import
 * this package — so something has to notice when one side gains a value and the other does not.
 * This is that something, in both directions: a reason the enum has and the buttons do not is an
 * answer no one can give, and one the buttons have and the enum does not is a write that fails at
 * runtime. Either makes this file stop compiling, which is where a reviewer sees it.
 *
 * Types and a discarded constant: nothing here runs, and nothing is exported.
 */
type PassReasonsOffered = PassReasonValue extends MatchPassReason ? true : never;
type PassReasonsComplete = MatchPassReason extends PassReasonValue ? true : never;
const passReasonParity: [PassReasonsOffered, PassReasonsComplete] = [true, true];
void passReasonParity;
