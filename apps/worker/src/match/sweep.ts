// `match.sweep`: the jobs whose verdicts are missing or out of date, enqueued in slices.
//
// The enqueue follows `ingest/fan-out.ts` exactly: group the work, then `boss.insert` in slices of
// 500 with a per-row `singletonKey`, `priority` and a jittered `startAfter`, relying on `insert()`
// ending in `ON CONFLICT DO NOTHING` to drop anything already queued or running. `match.job` is an
// `exclusive` queue, which is what makes that conflict target exist (see `queues.ts`).
import { FRESHNESS_HOURS, SCORER_VERSION } from "@pemby/core";
import type { Db } from "@pemby/db";
import { sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { MATCH_JOB_QUEUE, type MatchJobData } from "./queues";

/** Rows per `boss.insert` statement, as in `ingest/fan-out.ts`. */
const INSERT_SLICE = 500;

/** Fan-outs are spread over this window, so one sweep does not start 200 of them at once. */
const MATCH_JITTER_SECONDS = 2 * 60;

/**
 * How long a `match.job` is left alone before the sweep offers it again.
 *
 * This is the one bound that holds whatever the staleness predicate below says, and it is why a
 * re-match cannot turn into a treadmill. Two cases need it:
 *
 *  - A fan-out legitimately writes no row — no eligible user in any target country, every user too
 *    far off to be even a near miss. Nothing about the job changes, so every staleness test still
 *    reads true and the job would be re-selected on every tick, forever.
 *  - A job whose enrichment or embedding moved is re-matched once; until something moves again
 *    there is no reason to look at it a second time the same day.
 *
 * `pgboss.job` is the record of the attempt, so this backs off from a job that was already tried,
 * and `match.job`'s `deleteAfterSeconds` is set to match it: shorten one and the other stops
 * working.
 */
export const MATCH_RETRY_AFTER_HOURS = 24;

/**
 * Open, non-duplicate, enriched, **embedded** jobs whose verdicts are missing or out of date,
 * newest enrichment first.
 *
 * Three of the conditions are the whole-job skips `matchOneJob` would apply anyway — money-ask
 * (PLAN D11), the freshness window, and no enrichment row — done here so a job that can produce
 * nothing never becomes a queued fan-out at all. `skipQueued: false` drops the `pgboss.job` check
 * for callers running without pg-boss (the debugging script).
 *
 * **The `job_embeddings` join is a readiness test, not a verdict.** A pair scored with no embedding
 * has at most one component carrying signal — `domain` is missing for nearly every profile,
 * `timezoneOverlap` is not-applicable on almost every post, `companyFit` always — and one scored
 * component trips `MIN_EVIDENCE_COMPONENTS` in `scoring/score.ts`, which pins the total one point
 * under the match threshold. Such a job could never be a match however good the fit, so fanning it
 * out early does not produce an early verdict; it produces a wrong one. The matcher (200 jobs every
 * 10 minutes) also runs far ahead of the embedder (50 every 15 minutes, and it stops for the day
 * when its sub-budget is spent), so without this join most jobs would be scored before they were
 * embedded. Waiting costs nothing: `embed.job` enqueues `match.job` itself the moment it writes a
 * vector (`embed/workers.ts`), so a job is matched as soon as it can be, not on the next sweep.
 *
 * `matchOneJob` deliberately does **not** repeat this test. It is a scheduling decision about when
 * a job is worth looking at, so the two fan-out directions still evaluate an identical pair
 * identically and the debugging script can still force a run on an unembedded job.
 *
 * **Staleness, not "has never been matched".** A job is offered again when:
 *  - it has no `matches` row at all (the original condition), or
 *  - some row on it is below `SCORER_VERSION` — the scorer moved and no run has re-confirmed it, or
 *  - the newest row on it predates the job's enrichment or its embedding — the inputs changed under
 *    the verdict.
 *
 * Every one of those is self-clearing. A completed fan-out upserts `updated_at = now()` on every
 * pair that still produces a row and `retireStaleMatches` stamps `SCORER_VERSION` on the rest, so
 * the job drops straight back out of the predicate. What bounds the volume is therefore the sweep
 * limit (`MATCH_SWEEP_LIMIT`, 200 every 10 minutes) and `MATCH_RETRY_AFTER_HOURS` above, which lets
 * any one job through at most once a day even when a scorer bump marks the whole corpus stale.
 *
 * `max(matches.updated_at)` is the "last matched at" reading, not `min`: a run that decides a pair
 * is no longer worth a row leaves that row behind untouched, and a `min` would read that leftover
 * as proof the job was never re-matched.
 */
export async function selectJobsToMatch(
  db: Db,
  limit: number,
  options: { skipQueued?: boolean; freshnessHours?: number } = {},
): Promise<string[]> {
  const skipQueued = options.skipQueued ?? true;
  const freshnessHours = options.freshnessHours ?? FRESHNESS_HOURS;
  const queued = skipQueued
    ? sql`and not exists (
        select 1 from pgboss.job q
         where q.name = ${MATCH_JOB_QUEUE}
           and q.singleton_key = j.id::text
           and (q.state in ('created', 'retry', 'active')
                or q.created_on > now() - make_interval(hours => ${MATCH_RETRY_AFTER_HOURS}))
      )`
    : sql``;

  const result = await db.execute<{ id: string }>(sql`
    select j.id
    from jobs j
    join job_enrichment e on e.job_id = j.id
    join job_embeddings je on je.job_id = j.id
    left join lateral (
      select max(m.updated_at) as last_matched_at, min(m.scorer_version) as oldest_scorer_version
      from matches m
      where m.job_id = j.id
    ) mm on true
    where j.status = 'open'
      and j.duplicate_of_job_id is null
      and e.asks_candidate_for_money = false
      and j.last_verified_live_at >= now() - make_interval(hours => ${freshnessHours})
      and (
        mm.last_matched_at is null
        or mm.oldest_scorer_version < ${SCORER_VERSION}
        or mm.last_matched_at < greatest(e.updated_at, je.updated_at)
      )
      ${queued}
    order by (mm.last_matched_at is not null), e.updated_at desc, j.id
    limit ${limit}
  `);
  return result.rows.map((r) => r.id);
}

export interface MatchSweepResult {
  selected: number;
  enqueued: number;
}

/** Selects and enqueues. Never evaluates anything itself. */
export async function sweepMatch(boss: PgBoss, db: Db, limit: number): Promise<MatchSweepResult> {
  const ids = await selectJobsToMatch(db, limit);
  const now = Date.now();
  let enqueued = 0;
  for (let i = 0; i < ids.length; i += INSERT_SLICE) {
    const inserted = await boss.insert(
      MATCH_JOB_QUEUE,
      ids.slice(i, i + INSERT_SLICE).map((jobId) => ({
        data: { jobId } satisfies MatchJobData,
        singletonKey: jobId,
        priority: 0,
        startAfter: new Date(now + Math.floor(Math.random() * MATCH_JITTER_SECONDS * 1000)),
      })),
      { returnId: true },
    );
    enqueued += inserted?.length ?? 0;
  }
  return { selected: ids.length, enqueued };
}
