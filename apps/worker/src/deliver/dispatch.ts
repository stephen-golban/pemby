// One drain of one channel: select what is due, decide, claim, send, record.
//
// ============================================================================================
// THE ORDER OF OPERATIONS, AND WHY
// ============================================================================================
//
// Per match, per channel:
//
//   1. **Quiet hours** (`isWithinQuietHours`). Inside the window the match is *held*: no claim, no
//      `delivery_log` row, nothing written at all. The next drain — a minute later — asks again,
//      and the first drain after `nextReleaseAt` sends it. A hold that claimed first and checked
//      the clock second would write a `skipped` row every minute of a nine-hour window and burn
//      `maxSkips` on the first three, retiring a match that was never once attempted. Writing
//      nothing is the only shape that both holds and releases; `maxSkips` is the kernel's backstop
//      for this ordering being got wrong, not the mechanism.
//
//   2. **Entitlements** (`entitlementsFor`, and nothing else). Its `deliveryMode` is the single
//      source of the free-vs-pass split, and the only thing that sets `late` on the card and on the
//      `delivery_log` row. This module never reads `passes` to make that decision, never spells 24
//      anywhere, and never recomputes `deliver_after` — the matcher wrote that column from the
//      job's `first_seen_at` and `selectDueMatches` is what compares it to now.
//
//   3. **Render**, before the claim. Rendering is pure and cheap, and a template that throws (order
//      C1's email renderer is a stub until it lands) then costs no claim and no row.
//
//   4. **Rate limit** (`sender.acquire`), still before the claim, so no claim is held while waiting
//      out a chat's own second.
//
//   5. **Claim** (`claimDelivery`), then **send**, then **record**. The ordering, the failure mode
//      it accepts and the recovery of a claim a crashed process left behind are all argued in
//      `packages/db/src/queries/delivery.ts`; this module is a caller of that protocol, not a
//      second implementation of it. A null claim means another dispatcher has it: move on.
//
// ============================================================================================
//
// **Never a provider without a guarded selection.** Every address this module touches comes out of
// `selectDeliverableChannels`, which inner-joins `profiles` and requires `is_demo = false`,
// `delivery_paused_at is null`, `enabled`, `verified_at is not null` and `dead_at is null`. There
// is no other path to a `send()` here: the senders take a `DeliveryChannel`, and the only thing
// that makes one is that query. Staging's three seeded demo channels (`demo-chat-ana`,
// `ion.demo@example.com`, `nino.demo@example.com`) belong to profiles the seed marks `is_demo`, so
// the join excludes them.
//
// **Logs carry names and counts.** Never an address, a chat id, an endpoint, a user id, a title or
// a company. Errors go through `safeErrorLabel` before they are logged *or* thrown, because pg-boss
// persists a thrown value into `pgboss.job.output`.
import { entitlementsFor, isWithinQuietHours, nextReleaseAt, FRESHNESS_HOURS } from "@pemby/core";
import type { ChannelType, DeliveryChannel, DueMatch } from "@pemby/db";
import { safeErrorLabel } from "../cv/workers";
import { delayHoursOf, toMatchCard } from "./card";
import type { DeliverEnv } from "./env";
import { buildMessageLinks } from "./links";
import type { Sender } from "./senders/types";
import type { DeliveryStore, EntitlementInput } from "./store";

/**
 * How long one drain may run before it stops and leaves the rest to the next minute's sweep.
 *
 * Well under `deliver.channel`'s `expireInSeconds` (600), so a normal drain never expires while it
 * is still running — an expiry would free the queue and let a second drain of the same channel
 * start beside this one.
 */
export const DRAIN_BUDGET_MS = 4 * 60_000;

/**
 * Rows selected per sendable message.
 *
 * A match held by quiet hours still occupies a row in the selection — nothing in SQL knows about a
 * user's window — so a batch of purely nocturnal users could otherwise fill itself with held rows
 * and send nothing. Selecting four times the batch and stopping at `batchLimit` sends makes that
 * take four times as many held users to reproduce. It is a mitigation and not a fix: the fix is a
 * `hold_until` column the selection could compare, which is the kernel's to add.
 */
const OVERSELECT = 4;

export interface DrainDeps {
  store: DeliveryStore;
  senders: ReadonlyMap<ChannelType, Sender>;
  env: DeliverEnv;
  /** Explicit clock, as everywhere in the delivery code. Read once per row, not once per drain. */
  now?: () => Date;
}

export interface DrainResult {
  channelType: ChannelType;
  /** Rows the selection offered. */
  selected: number;
  sent: number;
  /** Held by quiet hours: no row written, re-offered on the next drain. */
  held: number;
  /** Another dispatcher held the claim, or the match was already sent. */
  contended: number;
  /** The user paused delivery after this drain selected their match. Nothing written. */
  paused: number;
  /** Provider said "later". Recorded `failed`; `DELIVER_MAX_ATTEMPTS` bounds it. */
  failed: number;
  /** Claimed, then not sent: the channel died mid-drain, or the user paused. */
  skipped: number;
  /**
   * Rows that could not make an honest card — a tier a card may not carry, or a profile with no
   * residence country. Counted apart from `skipped` because nothing is written for them and so
   * nothing bounds them: they are re-selected and re-skipped on every drain. A steady non-zero
   * count is a leak, not noise. See `toMatchCard` and the report.
   */
  unrenderable: number;
  /** Channels retired during this drain. A healthy drain retires none. */
  died: number;
  /** Sends the provider accepted but whose claim had gone: a possible duplicate. Watch this. */
  claimLost: number;
  /**
   * The `delivery_log` backstop index fired: some other row already recorded this (match, channel)
   * as sent. Nothing in this module can reach it on its own, so a non-zero count means a `sent` row
   * was written by something that did not go through the claim — the seed, a repair, a future path.
   */
  duplicateGuard: number;
  /**
   * The earliest `nextReleaseAt` across everything held this drain, or null if nothing was held.
   * Operational only: it is a computed reading, never stored, and the next drain computes it again.
   */
  holdUntil: Date | null;
}

const emptyResult = (channelType: ChannelType): DrainResult => ({
  channelType,
  selected: 0,
  sent: 0,
  held: 0,
  contended: 0,
  paused: 0,
  failed: 0,
  skipped: 0,
  unrenderable: 0,
  died: 0,
  claimLost: 0,
  duplicateGuard: 0,
  holdUntil: null,
});

/**
 * One channel per user, chosen deterministically.
 *
 * `delivery_log_match_channel_live_uq` is unique on `(match_id, channel_type)`, so exactly one
 * channel of a type can ever hold the claim for a match. A user with two push subscriptions — a
 * laptop and a phone — therefore gets the match on one of them, not both. Picking the lowest
 * channel id makes which one it is stable rather than whatever Postgres returned first.
 *
 * `selectDeliverableChannels` returns neither `verified_at` nor `created_at`, so "the newest
 * device" is not a choice available here. See the report.
 */
function oneChannelPerUser(channels: DeliveryChannel[]): Map<string, DeliveryChannel> {
  const byUser = new Map<string, DeliveryChannel>();
  for (const channel of channels) {
    const held = byUser.get(channel.userId);
    if (held === undefined || channel.channelId < held.channelId)
      byUser.set(channel.userId, channel);
  }
  return byUser;
}

export async function drainChannel(
  deps: DrainDeps,
  channelType: ChannelType,
): Promise<DrainResult> {
  const { store, env } = deps;
  const clock = deps.now ?? (() => new Date());
  const result = emptyResult(channelType);

  const sender = deps.senders.get(channelType);
  if (sender === undefined) return result;

  const due = await store.selectDue({
    channelType,
    limit: env.batchLimit * OVERSELECT,
    // PLAN D6's hard gate, re-applied at send time because the gate ran when the match row was
    // written and the post has been ageing ever since. Passed explicitly, and from the constant the
    // gate itself is decided on rather than a literal. The kernel defaults this parameter to the
    // same constant, so today the two agree — but a default is a thing that can be changed by
    // someone who is not thinking about a send path, and this is the last read before a message
    // goes out. Saying it here costs one line and removes the question.
    freshnessHours: FRESHNESS_HOURS,
    maxAttempts: env.maxAttempts,
  });
  result.selected = due.length;
  if (due.length === 0) return result;

  const userIds = [...new Set(due.map((row) => row.userId))];
  const [channelRows, entitlementInputs] = await Promise.all([
    store.selectChannels({ userIds, channelType }),
    store.entitlementInputs(userIds),
  ]);
  const channelByUser = oneChannelPerUser(channelRows);

  const deadline = Date.now() + DRAIN_BUDGET_MS;

  for (const row of due) {
    if (result.sent >= env.batchLimit || Date.now() >= deadline) break;
    const channel = channelByUser.get(row.userId);
    // The selection asked for a live channel of this type, so a missing one means the user turned
    // it off, paused, or the channel died between the two reads. Not an error, and nothing to write.
    if (channel === undefined) continue;

    const entitlementInput = entitlementInputs.get(row.userId) ?? {
      pass: null,
      includeYellow: false,
    };
    await sendOne(deps, sender, row, channel, entitlementInput, clock(), result);
  }

  return result;
}

async function sendOne(
  deps: DrainDeps,
  sender: Sender,
  row: DueMatch,
  channel: DeliveryChannel,
  entitlementInput: EntitlementInput,
  now: Date,
  result: DrainResult,
): Promise<void> {
  const { store, env } = deps;

  const quietWindow = {
    startMinute: channel.quietStartMinute,
    endMinute: channel.quietEndMinute,
    timezone: channel.timezone,
  };
  if (isWithinQuietHours(quietWindow, now)) {
    // Held. `nextReleaseAt` is not stored anywhere — it is computed again on each drain from the
    // same window and the same clock, so a user who moves their quiet hours while a match is held
    // is released by the new window, not the one that was in force when it was first held.
    result.held += 1;
    const releaseAt = nextReleaseAt(quietWindow, now);
    if (result.holdUntil === null || releaseAt < result.holdUntil) result.holdUntil = releaseAt;
    return;
  }

  const entitlements = entitlementsFor({
    userId: row.userId,
    pass: entitlementInput.pass,
    includeYellow: entitlementInput.includeYellow,
    now,
    // The same allowlist the matcher was given when it wrote `matches.deliver_after` (see
    // `../match/env.ts`). If the two ever disagree, a pass holder waits the free-tier delay and is
    // then told nothing about it.
    testPassHolders: env.testPassHolders,
  });

  // PLAN D13's note, and the `delivery_log.late` column beside it, are two claims at once, and it
  // takes both to be true for the note to belong on the message.
  //
  //   - It is an **upsell**: "A pass sends matches the moment they appear." Only someone without a
  //     pass should ever be shown it, so `entitlementsFor` is one half — and it is asked here and
  //     nowhere else, exactly as the contract requires.
  //   - It is a **disclosure**: "This post went up {hours}h ago." That is a statement about this
  //     particular message, and the card prints `Math.round(delayHours)`. So the second half is
  //     whether the figure the reader will see is actually true. A delivery that rounds to "0h ago"
  //     is not a late message, whatever plan the recipient is on, and putting a disclosure on it
  //     that says otherwise is the same class of mistake as leaving one off a message that waited.
  //
  // Derived from the plan alone, `late` would be a claim about the user's tier wearing the grammar
  // of a claim about the message. Derived from the elapsed time alone, it would put an upsell in
  // front of someone who has already bought the thing being sold. It is the conjunction.
  const delayHours = delayHoursOf(row, now);
  const waited = Number.isFinite(delayHours) && Math.round(delayHours) >= 1;
  const late = entitlements.deliveryMode !== "instant" && waited;

  const card = toMatchCard(row, { now, late });
  if (card === null) {
    result.unrenderable += 1;
    return;
  }

  const links = buildMessageLinks({
    appUrl: env.appUrl,
    secret: env.linkSecret,
    userId: row.userId,
    matchId: row.matchId,
    channelId: channel.channelId,
    now,
  });

  await sender.acquire(channel.address);

  // Re-read the pause switch. `selectChannels` carries `delivery_paused_at is null` and ran once at
  // the top of this drain, which may have been minutes ago; `/pause` has to take effect when it is
  // sent, not when the batch runs out. Read after the rate-limit wait and immediately before the
  // claim, so the gap between "allowed" and "sent" is as small as it can be made.
  if ((await store.pausedAt(row.userId)) !== null) {
    result.paused += 1;
    return;
  }

  const claim = await store.claim({
    userId: row.userId,
    matchId: row.matchId,
    channelId: channel.channelId,
    channelType: sender.type,
    kind: "match",
    late,
  });
  if (claim === null) {
    result.contended += 1;
    return;
  }

  const outcome = await sender.send({ channel, card, links, now });

  if (outcome.ok) {
    const recorded = await store.recordSent({
      deliveryId: claim.deliveryId,
      matchId: row.matchId,
      channelType: sender.type,
      providerMessageId: outcome.providerMessageId,
      // The wall clock, not `now`. Every decision above reads the injected clock so a held message
      // and a released one can be reasoned about from a fixed instant; `sent_at` is not a decision,
      // it is the record of when a provider actually accepted this message, and writing a
      // simulated time into it would put a lie in the audit trail.
      sentAt: new Date(),
    });
    if (recorded.recorded) result.sent += 1;
    else if (recorded.reason === "claim-lost") result.claimLost += 1;
    else result.duplicateGuard += 1;
    return;
  }

  if (outcome.retryable) {
    await store.fail({ deliveryId: claim.deliveryId, error: outcome.label });
    result.failed += 1;
    return;
  }

  if (outcome.dead !== null) {
    await store.markDead({ channelId: channel.channelId, reason: outcome.dead, at: new Date() });
    result.died += 1;
    // Skipped, not failed: the message was never refused on its own merits, and a channel that is
    // dead is already excluded from every future selection, so there is nothing to bound.
    await store.skip({ deliveryId: claim.deliveryId, error: outcome.label });
    result.skipped += 1;
    return;
  }

  // Permanent for this message, but the channel is fine. Counted as a failure so
  // `DELIVER_MAX_ATTEMPTS` retires it rather than leaving it to be re-tried every minute forever.
  await store.fail({ deliveryId: claim.deliveryId, error: outcome.label });
  result.failed += 1;
}

/**
 * Release claims a crashed dispatcher left behind, then hand each live channel a drain.
 *
 * Reclaiming happens here, once, before any drain selects: a claim still open past the cutoff is a
 * process that died, and until it is released the match it holds is invisible to `selectDueMatches`.
 */
export async function reclaim(store: DeliveryStore, env: DeliverEnv, now: Date): Promise<number> {
  // `now` and an age, never a precomputed cutoff: the kernel refuses the age, and a caller that got
  // the sign of the subtraction wrong would otherwise sweep every live claim on every tick.
  return store.reclaimStale({ now, staleAfterMs: env.staleClaimSeconds * 1_000 });
}

/** One line per drain: counts only, plus the instant a held match is waiting for. */
export function formatDrain(result: DrainResult): string {
  const hold =
    result.holdUntil === null ? "" : ` holdUntil=${result.holdUntil.toISOString().slice(0, 16)}Z`;
  return (
    `deliver.channel ${result.channelType}: selected=${result.selected} sent=${result.sent} ` +
    `held=${result.held} contended=${result.contended} paused=${result.paused} ` +
    `failed=${result.failed} skipped=${result.skipped} unrenderable=${result.unrenderable} ` +
    `died=${result.died} claimLost=${result.claimLost} duplicateGuard=${result.duplicateGuard}${hold}`
  );
}

/** A label safe to log and safe to throw, for a handler that has touched personal data. */
export function describeDeliverError(error: unknown): string {
  return `status=${safeErrorLabel(error)}`;
}
