// Everything `/api/applications/*` reads and writes.
//
// Two rules from `docs/phases/09-contract.md` shape this file.
//
// **The web may call a `@pemby/db` helper that takes a `Db`; it may not write a Drizzle query.**
// `apps/web/package.json` does not declare `drizzle-orm`, so `import { eq } from "drizzle-orm"`
// does not even resolve. Anything whose correctness depends on there being exactly one
// implementation — the application upsert, the tracker read — goes through the kernel helper that
// the worker and the bot also call. Ordinary per-surface SQL stays raw on `getDb().$client`, which
// is what every other `_lib/db.ts` in this app does.
//
// **The column is not decided here.** `selectTracker` returns facts and `trackerColumnOf` in
// `@pemby/core` turns them into a column, on the server and in the browser and in the worker. A
// second mapping written in this file would be the drift the owner's decision exists to prevent.

import { getDb, selectTracker, upsertApplication } from "@pemby/db";
import type { TrackerApplicationState } from "@pemby/core";
import type { TrackerRowView, TrackerView } from "./view";

/**
 * Everything the board may show for this person, most recently active first.
 *
 * **`is_demo` is read in a second statement rather than added to the kernel helper.** `TrackerRow`
 * is `@pemby/db`'s type and this order does not own that package; the alternative to one small
 * `where id = any(...)` was either a cross-order change to a wave-1 file or a board on which a
 * seeded, fictional employer reads exactly like a real application someone made. DESIGN.md is not
 * ambiguous about which of those is acceptable. It is a candidate to fold into `selectTracker`.
 */
export async function loadTracker(userId: string): Promise<TrackerView> {
  const [rows, profile] = await Promise.all([
    selectTracker(getDb(), userId),
    getDb().$client.query<{ residence_country: string | null }>(
      "select residence_country from profiles where user_id = $1",
      [userId],
    ),
  ]);

  const demo = new Set<string>();
  if (rows.length > 0) {
    const { rows: flagged } = await getDb().$client.query<{ id: string }>(
      "select id from jobs where id = any($1::uuid[]) and is_demo",
      [rows.map((row) => row.jobId)],
    );
    for (const row of flagged) demo.add(row.id);
  }

  return {
    readAt: new Date().toISOString(),
    country: profile.rows[0]?.residence_country ?? null,
    rows: rows.map((row): TrackerRowView => ({
      jobId: row.jobId,
      matchId: row.matchId,
      title: row.title,
      companyName: row.companyName,
      url: row.url,
      applyUrl: row.applyUrl,
      jobStatus: row.jobStatus,
      demo: demo.has(row.jobId),
      matchState: row.matchState,
      applicationState: row.applicationState,
      rejectedForLocation: row.rejectedForLocation,
      appliedAt: row.appliedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}

/**
 * The match behind a job for this user, and whether they already have an application on it.
 *
 * Both arms of `selectTracker` are reachable here: a saved match with no application yet, and an
 * application whose match row has since been retired by `retireStaleMatches`. A job that is neither
 * is a job this person has never been shown, and the routes answer 404 rather than creating an
 * application row for an arbitrary job id — the tracker is a record of what Pemby delivered, not an
 * open notebook, and an unchecked insert here would let anyone write rows against any job.
 */
async function claimOn(
  userId: string,
  jobId: string,
): Promise<{ matchId: string | null; hasApplication: boolean; companyId: string } | null> {
  const { rows } = await getDb().$client.query<{
    match_id: string | null;
    application_id: string | null;
    company_id: string;
  }>(
    `select m.id as match_id, a.id as application_id, j.company_id
       from jobs j
       left join matches m on m.job_id = j.id and m.user_id = $1
       left join applications a on a.job_id = j.id and a.user_id = $1
      where j.id = $2`,
    [userId, jobId],
  );
  const row = rows[0];
  if (!row || (row.match_id === null && row.application_id === null)) return null;
  return {
    matchId: row.match_id,
    hasApplication: row.application_id !== null,
    companyId: row.company_id,
  };
}

export interface StateWritten {
  /** For the `tracker.sync` enqueue. Null when the application has outlived its match row. */
  matchId: string | null;
}

/**
 * Record what happened to an application, creating the row when this is the first news of it.
 *
 * **This is the write that was missing.** Before phase 09 nothing in the product inserted an
 * `applications` row at all: both "I applied" paths — the Brief's `setMatchState` and the bot's —
 * moved `matches.state` and stopped, so the tracker's Applied column had no source and could never
 * fill. `upsertApplication` is the kernel helper; it writes only the fields supplied, so a later
 * "this is now an offer" cannot reset `applied_at`, `rejected_for_location` or `notes`.
 *
 * `applied_at` is deliberately **not** passed: the column defaults to `now()` on insert and the
 * helper leaves an omitted field alone on update, so the date records when the person first applied
 * and a move through screening months later does not rewrite it.
 *
 * **The match is marked applied afterwards, and not in the same transaction.** An application row
 * exists, so the person applied, and the Brief — which reads `matches.state` and knows nothing
 * about `applications` — has to agree. It is a second statement because the web cannot open a
 * Drizzle transaction around a kernel helper. The failure that leaves is a stale `matches.state`
 * with a correct `applications` row, and it is the harmless direction: `trackerColumnOf` gives the
 * application row priority, so the board stays right and only the Brief lags until the next write.
 */
export async function recordApplicationState(
  userId: string,
  jobId: string,
  state: TrackerApplicationState,
): Promise<StateWritten | null> {
  const claim = await claimOn(userId, jobId);
  if (!claim) return null;

  await upsertApplication(getDb(), {
    userId,
    jobId,
    ...(claim.matchId === null ? {} : { matchId: claim.matchId }),
    state,
  });

  if (claim.matchId !== null) {
    await getDb().$client.query(
      `update matches
          set state = 'applied', pass_reason = null, state_changed_at = now(), updated_at = now()
        where id = $1 and user_id = $2 and state <> 'applied'`,
      [claim.matchId, userId],
    );
  }

  return { matchId: claim.matchId };
}

/**
 * How much one person's "yes, it was my location" counts toward a company's eligibility verdict.
 *
 * **The invariant is the ordering, not the number.** A location report is the only evidence in this
 * system that a person cannot file without first having an `applications` row on a job Pemby
 * delivered to *them* — it costs a match, an application and a rejection to produce one. Every flag
 * costs a tap. So a location report must never weigh **less than any flag**, whoever filed it, and
 * whatever the two absolute values become. Anyone retuning these numbers should move them together
 * and check that this still holds; it is the property, and the numbers are only today's expression
 * of it.
 *
 * Today's ladder, which order D owns in `apps/worker/src/flags/weight.ts`, against the engine's
 * threshold of 2 (`packages/core/src/eligibility/engine/index.ts:1320-1327`, which sums `weight`
 * over red `flag` / `user_report` company evidence). The four flag rows are **base** weights, which
 * D then multiplies by an accuracy and a burst factor and clamps to [0.05, 1.00], so an effective
 * flag weight can be lower than its base and never higher:
 *
 *   flag, no profile / never onboarded   base 0.20   — 10 at full strength to move a tier
 *   flag, onboarded, account under 24h   base 0.40   —  5
 *   flag, onboarded, settled             base 0.60   —  4
 *   flag, pass holder                    base 0.80   —  3
 *   location report (here)               flat 1.00   —  2
 *
 * `FLAG_WEIGHT_MAX = 1` (`weight.ts:87`) is what makes the ordering an invariant rather than an
 * accident of today's bases: uncapped, a pass holder with a clean record and a quiet 24 hours
 * reaches 1.2 and outranks a real applicant. A flag may equal this value; nothing may exceed it.
 *
 * An earlier draft of this constant was 0.5, argued from the absolute threshold alone — "four
 * independent people before the tier moves" — and that reasoning put a report *below* an ordinary
 * onboarded flag, inverting the very ordering this comment now exists to protect. Arguing from the
 * threshold is how that happened; argue from the ordering.
 */
const LOCATION_REPORT_WEIGHT = 1.0;

export interface LocationReported {
  /** False when there is no application row for this job, or it is not in `rejected`. */
  eligible: boolean;
  /** False when the row was already reported. The call is still a success: see below. */
  recorded: boolean;
  /** True when an `eligibility_evidence` row was written as well. */
  evidence: boolean;
}

/**
 * "Rejected because of my location?" — answered yes.
 *
 * **One evidence row per (user, company), for ever.** This is the invariant, and getting it wrong
 * handed one account a tier downgrade on its own. The history is worth keeping:
 *
 * The first version deduplicated per **(user, job)**, on `rejected_for_location = false`. A blind
 * reviewer showed that this is not a limit at all for an employer hiring more than one role.
 * `eligibility_evidence` carries no `user_id`, and the unique index that would otherwise catch a
 * duplicate — `eligibility_evidence_flag_subject_scope_uq` — is partial `where flag_id is not null`
 * (`packages/db/src/schema/flags.ts:155-157`), which a location report, carrying no flag, never
 * satisfies. So one person with a match on two of a company's postings could file two rows at
 * weight 1.00 each, the engine sums them to 2, and the company's tier steps down **for every Pemby
 * user in that country** — with no flag, nothing in the review queue and nothing on the admin page.
 * Reproduced against a real PostgreSQL 18 through this function: `rows=2 sum(weight)=2`.
 *
 * So the guard is per company, and the `applications` table is where it has to live, because it has
 * the `user_id` that `eligibility_evidence` deliberately does not.
 *
 * **What a report actually costs, stated honestly.** An earlier version of this comment said a
 * report "costs a match, an application and a rejection to produce", and that was wrong in a way
 * that mattered: `claimOn` accepts a bare `matches` row, and `PATCH /api/applications` creates the
 * application and sets it to `rejected` in one call. The application and the rejection are
 * **self-asserted in the same two requests**. The only real precondition is a **match on the job** —
 * which is why the per-company cap is what makes the word "independent" true here. Two rows at one
 * company now mean two people, because one person can only ever write one.
 *
 * `rejected_for_location` is still set per job: which of a company's postings turned someone down
 * for where they live is their own record, and capping the *evidence* is not a reason to lose it.
 * A second report at the same company therefore returns `recorded: true, evidence: false`.
 *
 * **The advisory lock is what makes the check atomic, and a single statement would not be.** Every
 * CTE in one statement reads the same snapshot, so two concurrent reports on two of this company's
 * jobs would each look for the other's row, find nothing, and both insert — the quota race this
 * phase already shipped once, in a different table. `pg_advisory_xact_lock` on (user, company)
 * serializes exactly the pair that has to be serialized and is released at commit. It is used in
 * place of the `select … from profiles … for update` that `insertKitWithinQuota` and the Brief's
 * `setMatchState` take, because those two lock the profile row *after* touching `matches`, and
 * taking it here in the other order would put a deadlock between a Brief "Not for me" and a tracker
 * report by one person. Demonstrated both ways against a real database: without the lock, two
 * concurrent reports write two rows; with it, one.
 *
 * `state = 'rejected'` is required, not assumed from the client having shown the button.
 *
 * **One-way.** There is no un-report: `eligibility_evidence` has no `user_id`, so deleting "the" row
 * would mean deleting every user's row for that company and scope. The question is asked once and
 * the answer is a report, which is what the copy says it is.
 *
 * **Demo profiles write no evidence.** `is_demo` is the contract's standing mitigation and it is
 * load-bearing, not decorative: the seeded walkthrough account must not press on a real company's
 * tier. The application flag is still set for them, so their board reads correctly.
 *
 * **Scope is the reporter's own residence country**, read in the same statement — that is what
 * "because of my location" means. A profile with no country recorded sets the flag and writes no
 * evidence: there is no scope to file it under and `'*'` would say something much larger than the
 * person did. The per-company cap deliberately does **not** look at scope: someone who moves country
 * does not get a second report at the same employer.
 *
 * Nothing here recomputes the company's eligibility. `recomputeEligibilityForCompany` lives in the
 * worker and a model call is not something a tap on the tracker should be able to buy; the evidence
 * takes effect at the company's next check.
 */
export async function reportLocationRejection(
  userId: string,
  jobId: string,
): Promise<LocationReported | null> {
  const claim = await claimOn(userId, jobId);
  if (!claim) return null;
  if (!claim.hasApplication) return { eligible: false, recorded: false, evidence: false };

  const client = await getDb().$client.connect();
  let rows: { eligible: number; moved: number; evidence: number }[];
  try {
    await client.query("begin");
    // Serializes this person's reports at this company against each other, and nothing else.
    // Transaction-scoped: released by the commit or the rollback below, never leaked.
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `location-report:${userId}:${claim.companyId}`,
    ]);
    const result = await client.query<{ eligible: number; moved: number; evidence: number }>(
      `with target as (
         select job_id from applications
          where user_id = $1 and job_id = $2 and state = 'rejected'
       ),
       moved as (
         update applications
            set rejected_for_location = true, updated_at = now()
          where user_id = $1 and job_id = $2
            and state = 'rejected'
            and rejected_for_location = false
         returning job_id
       ),
       written as (
         insert into eligibility_evidence (subject, company_id, scope, verdict, source, weight)
         select 'company', j.company_id, p.residence_country, 'red', 'user_report', $3::real
           from moved
           join jobs j on j.id = moved.job_id
           join profiles p on p.user_id = $1
          where p.residence_country is not null
            and p.is_demo = false
            -- One report per person per company, whatever the scope and however many of that
            -- company's postings turned them down. Any *other* job of this company that this
            -- person has already reported closes the door.
            and not exists (
                  select 1
                    from applications a
                    join jobs oj on oj.id = a.job_id
                   where a.user_id = $1
                     and a.job_id <> $2
                     and a.rejected_for_location
                     and oj.company_id = j.company_id
                )
         returning id
       )
       select (select count(*) from target)::int as eligible,
              (select count(*) from moved)::int as moved,
              (select count(*) from written)::int as evidence`,
      [userId, jobId, LOCATION_REPORT_WEIGHT],
    );
    await client.query("commit");
    rows = result.rows;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const row = rows[0];
  return {
    // Every CTE reads the same snapshot, so `target` counts the row whether or not `moved` changed
    // it. That is what makes a second answer a success rather than a 409 on work already done.
    eligible: (row?.eligible ?? 0) > 0,
    recorded: (row?.moved ?? 0) > 0,
    evidence: (row?.evidence ?? 0) > 0,
  };
}
