// The user's own application tracker (PLAN D9, phase 09).
//
// `applications` shipped in 0001 and is unchanged here: unique `(user_id, job_id)`, indexed
// `(user_id, state)`. What phase 09 adds is the three statements the tracker surface and the
// worker's tracker sync need, all of them scoped by `user_id` inside the statement rather than by
// a check the caller is trusted to have made.
//
// **`selectTracker` returns facts, not columns.** The owner settled the tracker's five columns
// (`saved | applied | interview | offer | rejected`, with `interview` folding `screening` and
// `interviewing`), and the mapping from `matches.state` / `applications.state` onto them is one
// pure function in `@pemby/core` (`trackerColumnOf`) that both the web and the worker call. A
// pre-mapped column selected here would be a second implementation of that mapping, and two
// implementations of one mapping is how the two surfaces drift. So this file selects `matchState`
// and `applicationState` and stops.
//
// Conventions, from `./matching.ts`: `sql.param` for array parameters, and every timestamp read
// through `db.execute` selected as epoch milliseconds and rebuilt here, because a raw execute has
// no column mappers and a `timestamptz` arrives as Postgres's own text.
import { and, eq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Db } from "../client";
import { applications } from "../schema";
import type { JobStatus } from "./flags";
import type { MatchState } from "./matching";

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type ApplicationState = (typeof applications.$inferSelect)["state"];

const epochMs = (column: SQL, alias: string): SQL =>
  sql`(extract(epoch from ${column}) * 1000)::bigint as ${sql.raw(alias)}`;

const toDate = (ms: string | null): Date | null => (ms === null ? null : new Date(Number(ms)));

/**
 * Create the user's application row for a job, or update the one that is already there.
 *
 * **Only the fields the caller actually supplied are written on the conflict path.** Every column
 * on `applications` except `user_id` and `job_id` has a default, so an `excluded.*` set list would
 * quietly reset them: a second call that says nothing but "this is now an offer" would put
 * `applied_at` back to now, `rejected_for_location` back to false and `notes` back to null. The
 * conditional spreads below mean an omitted field is left exactly as it was, which is what "upsert"
 * has to mean when the row already carries the user's own decisions.
 *
 * `applied_at` is `least(existing, excluded)` rather than `excluded`: it records when the person
 * first applied, and moving through screening and interviewing months later must not rewrite it.
 * A caller that genuinely wants to correct the date earlier can; correcting it *later* is not
 * something the tracker asks for and is not worth the risk of a state change silently resetting it.
 *
 * `match_id` is `coalesce(excluded, existing)`: a row created from the Brief carries the match, and
 * a later update from a surface that does not know about the match must not un-link it — both
 * foreign keys off `matches` are `on delete set null`, so an accidental null here would be silent.
 */
export async function upsertApplication(db: Db, row: NewApplication): Promise<void> {
  await db
    .insert(applications)
    .values(row)
    .onConflictDoUpdate({
      target: [applications.userId, applications.jobId],
      set: {
        updatedAt: sql`now()`,
        ...(row.state === undefined ? {} : { state: sql`excluded.state` }),
        ...(row.matchId === undefined
          ? {}
          : { matchId: sql`coalesce(excluded.match_id, ${applications.matchId})` }),
        ...(row.appliedAt === undefined
          ? {}
          : { appliedAt: sql`least(${applications.appliedAt}, excluded.applied_at)` }),
        ...(row.rejectedForLocation === undefined
          ? {}
          : { rejectedForLocation: sql`excluded.rejected_for_location` }),
        ...(row.notes === undefined ? {} : { notes: sql`excluded.notes` }),
      },
    });
}

export interface SetApplicationStateParams {
  userId: string;
  jobId: string;
  state: ApplicationState;
  /** Omitted: left as it was. Only "rejected" ever sets it true. */
  rejectedForLocation?: boolean;
}

/**
 * Move an existing application to a new state.
 *
 * **Returns whether a row moved**, which the published signature in the phase contract gave as
 * `void`. A `void` update that matched nothing is exactly the failure phase 08 taught: a mechanism
 * reporting success about the work it did rather than the outcome it achieved. The caller here is
 * an optimistic UI that has already redrawn the screen, so "no row" is precisely the case it has to
 * roll back. Returning more than `void` breaks no caller that ignores it.
 *
 * Deliberately not an upsert: this is the "I heard back" path and there must already be an
 * application. Creating one here would let a state change invent an application the user never
 * made. `upsertApplication` is the call that creates.
 */
export async function setApplicationState(
  db: Db,
  { userId, jobId, state, rejectedForLocation }: SetApplicationStateParams,
): Promise<boolean> {
  const updated = await db
    .update(applications)
    .set({
      state,
      updatedAt: sql`now()`,
      ...(rejectedForLocation === undefined ? {} : { rejectedForLocation }),
    })
    .where(and(eq(applications.userId, userId), eq(applications.jobId, jobId)))
    .returning({ id: applications.id });
  return updated.length > 0;
}

/**
 * One row the tracker may show: the facts, with the column left to `trackerColumnOf`.
 *
 * `matchState` and `applicationState` are both nullable because a row reaches the tracker from
 * either side — a saved match with no application yet, or an application whose match row has since
 * been retired. Exactly one of `matchId` / `applicationId` is guaranteed non-null; both may be.
 */
export interface TrackerRow {
  jobId: string;
  /** Null when the application outlived its match row. `tracker.sync` needs this to edit a card. */
  matchId: string | null;
  applicationId: string | null;
  matchState: MatchState | null;
  applicationState: ApplicationState | null;
  /** False when there is no application row; the column only exists on `applications`. */
  rejectedForLocation: boolean;
  appliedAt: Date | null;
  /** The later of the application's and the match's own last change, for "last activity". */
  updatedAt: Date;
  title: string;
  companyName: string;
  url: string;
  applyUrl: string | null;
  /**
   * `open | closed | quarantined | merged`. Carried so the tracker can say a post has gone — a
   * person tracking an application wants to know the job closed, and hiding that would be the
   * tracker lying by omission.
   */
  jobStatus: JobStatus;
  notes: string | null;
}

type RawTrackerRow = {
  job_id: string;
  match_id: string | null;
  application_id: string | null;
  match_state: MatchState | null;
  application_state: ApplicationState | null;
  rejected_for_location: boolean | null;
  applied_at_ms: string | null;
  updated_at_ms: string;
  title: string;
  company_name: string;
  url: string;
  apply_url: string | null;
  job_status: JobStatus;
  notes: string | null;
};

/**
 * Everything the tracker may show for one user, most recently active first.
 *
 * Two arms, unioned: every `applications` row, with its match row attached when there still is one;
 * plus the matches the user acted on that have no application yet.
 *
 * **The `m.state in ('saved','applied')` predicate in the second arm is a pre-filter, not the
 * mapping.** A user has hundreds of `matches` rows and all but a handful are `new`, so the set has
 * to be narrowed in SQL — but the narrowing is written as "states the user could have reached by
 * acting", which is wider than the mapping needs, so that `trackerColumnOf` stays the only thing
 * that decides a column and can return null for a row it does not want. If the mapping ever admits
 * another match state, widen this list; it must never be *narrower* than the mapping.
 *
 * **No demo exclusion.** This reads one named user's own rows and spends nothing, changes no job
 * and sends nothing. Hiding a demo user's tracker from the demo user would make the seeded account
 * useless for exactly the walkthrough it exists for.
 */
export async function selectTracker(db: Db, userId: string): Promise<TrackerRow[]> {
  const rows = await db.execute<RawTrackerRow>(sql`
    select
      j.id as job_id, j.title, j.url, j.apply_url, j.status as job_status,
      c.name as company_name,
      m.id as match_id, m.state as match_state,
      a.id as application_id, a.state as application_state,
      a.rejected_for_location, a.notes,
      ${epochMs(sql`a.applied_at`, "applied_at_ms")},
      ${epochMs(sql`greatest(a.updated_at, m.updated_at)`, "updated_at_ms")}
      from applications a
      join jobs j on j.id = a.job_id
      join companies c on c.id = j.company_id
      left join matches m on m.user_id = a.user_id and m.job_id = a.job_id
     where a.user_id = ${userId}
    union all
    select
      j.id as job_id, j.title, j.url, j.apply_url, j.status as job_status,
      c.name as company_name,
      m.id as match_id, m.state as match_state,
      null as application_id, null as application_state,
      null as rejected_for_location, null as notes,
      null as applied_at_ms,
      ${epochMs(sql`m.updated_at`, "updated_at_ms")}
      from matches m
      join jobs j on j.id = m.job_id
      join companies c on c.id = j.company_id
     where m.user_id = ${userId}
       and m.state in ('saved', 'applied')
       and not exists (
             select 1 from applications a
              where a.user_id = m.user_id and a.job_id = m.job_id
           )
     order by updated_at_ms desc, job_id
  `);

  return rows.rows.map((r) => ({
    jobId: r.job_id,
    matchId: r.match_id,
    applicationId: r.application_id,
    matchState: r.match_state,
    applicationState: r.application_state,
    rejectedForLocation: r.rejected_for_location ?? false,
    appliedAt: toDate(r.applied_at_ms),
    updatedAt: new Date(Number(r.updated_at_ms)),
    title: r.title,
    companyName: r.company_name,
    url: r.url,
    applyUrl: r.apply_url,
    jobStatus: r.job_status,
    notes: r.notes,
  }));
}
