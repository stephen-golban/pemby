// Every read and write the dispatcher does, behind one interface.
//
// `dbDeliveryStore` is pure delegation: each method hands its arguments straight to the kernel's
// own query in `packages/db/src/queries/delivery.ts` (plus `activePasses`, which the matcher already
// owns). Nothing is reimplemented here — no claim protocol, no demo filter, no SQL. If a method
// below did anything other than forward, that would be the bug.
//
// The interface exists for one reason: it is the only way to run the dispatcher's decisions — the
// quiet-hours hold and release, the entitlements split, claim-then-send, dead channels, the
// bounded-retry path — against a known starting state without a database. PLAN D24 forbids test
// suites, and a delivery flow is exactly the kind of thing where "it typechecks" is not evidence.
// The proof run drives `drainChannel` through an in-memory implementation of this interface with
// the real `@pemby/core` rendering and stubbed providers.
//
// What the in-memory implementation therefore does **not** prove, and what has to be read in the
// SQL instead, is everything the selections do in Postgres: the demo-recipient exclusion, the
// freshness gate, the live-row and attempt-count predicates, and the partial unique indexes behind
// `claimDelivery`.
import type { ActivePass } from "@pemby/core";
import {
  claimDelivery,
  deliveryPausedAt,
  failDelivery,
  markChannelDead,
  reclaimStaleDeliveries,
  recordDeliverySent,
  selectDeliverableChannels,
  selectDueMatches,
  skipDelivery,
  schema,
  type ChannelDeadReason,
  type ChannelType,
  type ClaimDeliveryParams,
  type Db,
  type DeliveryChannel,
  type DeliveryClaim,
  type DueMatch,
  type DueMatchesParams,
  type FinishDeliveryParams,
  type RecordSentParams,
  type RecordSentResult,
} from "@pemby/db";
import { inArray } from "drizzle-orm";
import { activePasses } from "../match/db";

/**
 * What `entitlementsFor` needs about one user that is not the clock.
 *
 * The pass row is read and passed in even though `entitlementsFor` deliberately does not believe it
 * before phase 10, for the same reason the matcher reads it: phase 10 replaces one line inside that
 * function, and the dispatcher should not be the place that then has to learn to read passes.
 */
export interface EntitlementInput {
  pass: ActivePass | null;
  includeYellow: boolean;
}

export interface DeliveryStore {
  selectDue(params: DueMatchesParams): Promise<DueMatch[]>;
  selectChannels(params: {
    userIds: readonly string[];
    channelType: ChannelType;
  }): Promise<DeliveryChannel[]>;
  entitlementInputs(userIds: readonly string[]): Promise<Map<string, EntitlementInput>>;
  /**
   * When this user paused delivery, or null.
   *
   * Read again per message rather than only in `selectChannels`, which carries the same predicate
   * but runs once at the top of a drain: a drain may last four minutes, and someone who sends
   * `/pause` thirty seconds in should stop receiving then and not when the batch runs out. Quiet
   * hours are already re-evaluated per row against a fresh clock; this is the same rule for the
   * other thing a person can change while a drain is running.
   */
  pausedAt(userId: string): Promise<Date | null>;
  claim(params: ClaimDeliveryParams): Promise<DeliveryClaim | null>;
  recordSent(params: RecordSentParams): Promise<RecordSentResult>;
  fail(params: FinishDeliveryParams): Promise<boolean>;
  skip(params: FinishDeliveryParams): Promise<boolean>;
  markDead(params: { channelId: string; reason: ChannelDeadReason; at: Date }): Promise<void>;
  reclaimStale(params: { now: Date; staleAfterMs: number }): Promise<number>;
}

/**
 * `profiles.include_yellow` for these users.
 *
 * The one input `entitlementsFor` needs that the delivery kernel does not return. A tiny read
 * rather than a new kernel query, because this order does not own `packages/**` — see the report.
 */
async function includeYellowFor(db: Db, userIds: readonly string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  if (userIds.length === 0) return out;
  const rows = await db
    .select({ userId: schema.profiles.userId, includeYellow: schema.profiles.includeYellow })
    .from(schema.profiles)
    .where(inArray(schema.profiles.userId, [...userIds]));
  for (const row of rows) out.set(row.userId, row.includeYellow);
  return out;
}

export function dbDeliveryStore(db: Db): DeliveryStore {
  return {
    selectDue: (params) => selectDueMatches(db, params),
    selectChannels: (params) => selectDeliverableChannels(db, params),
    async entitlementInputs(userIds) {
      const [passes, yellow] = await Promise.all([
        activePasses(db, userIds),
        includeYellowFor(db, userIds),
      ]);
      const out = new Map<string, EntitlementInput>();
      for (const userId of userIds) {
        out.set(userId, {
          pass: passes.get(userId) ?? null,
          includeYellow: yellow.get(userId) ?? false,
        });
      }
      return out;
    },
    pausedAt: (userId) => deliveryPausedAt(db, userId),
    claim: (params) => claimDelivery(db, params),
    recordSent: (params) => recordDeliverySent(db, params),
    fail: (params) => failDelivery(db, params),
    skip: (params) => skipDelivery(db, params),
    markDead: (params) => markChannelDead(db, params),
    reclaimStale: (params) => reclaimStaleDeliveries(db, params),
  };
}
