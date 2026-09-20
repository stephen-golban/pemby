// Database side of `/api/brief`. Raw SQL on the shared pool for the same reason as
// `app/api/profile/_lib/db.ts` and `lib/teaser/load.ts`: apps/web cannot import drizzle-orm
// operators that type-check against @pemby/db's schema (pnpm resolves a second drizzle-orm copy
// for web), so the query helpers in `packages/db/src/queries/matching.ts` — which are written
// against that builder and take a `Db` — are not reachable from here. Table and column names are
// the ones in `packages/db/src/schema/{matching,jobs,flags,profiles}.ts`.

import {
  DB_SENIORITIES,
  FRESHNESS_HOURS,
  ROLE_FAMILIES,
  SCORE_REASON_KEYS,
  SENIORITIES,
  applyPassFeedback,
  fromDbSeniority,
  type NudgeJob,
  type RoleFamily,
  type Seniority,
} from "@pemby/core";
import { nextProgramSteps, type ProgramNextStep } from "@pemby/core/programs";
import { getDb, upsertApplication } from "@pemby/db";
import {
  MATCH_STATES,
  MIN_SCORE_FLOOR,
  NEAR_MISS_BLOCKERS,
  type BriefMatchView,
  type BriefView,
  type DbWayOfWorking,
  type FlagBody,
  type HeldView,
  type MatchState,
  type NearMissBlocker,
  type NearMissGroupView,
  type PassReason,
  type PreferencesPatch,
  type ScoreReasonView,
} from "./view";
import type { EligibilityTier, EngineReasonKey, ScoreReasonKey } from "@pemby/core";

/** Most matches one Brief shows. The Brief is not a feed; this is a guard, not a page size. */
const MATCH_LIMIT = 60;
/** Example jobs shown under each near-miss group, as job chips. */
const EXAMPLES_PER_GROUP = 4;

// The four predicates every Brief read applies ------------------------------
//
// The matcher decides once, when it writes the row; the row then sits in the table while the post
// closes, is merged into another one, ages out of the freshness window, or simply is not due yet.
// None of that is visible to the matcher, so the read re-applies the parts of the verdict that can
// go out of date. Each one is spelled here once and pasted into all three statements below, so the
// match list, the held count and the near-miss groups cannot disagree about what is shown.

/** PLAN section 4.5: a dead job is closed and pulled from Briefs. A duplicate is not the post. */
const LIVE_JOB = `j.status = 'open' and j.duplicate_of_job_id is null`;

/**
 * The `freshness` hard gate, re-applied on read (PLAN D6).
 *
 * The gate runs once, when the match is written, and the row then ages: a post verified 20h ago
 * clears the bar, and four hours later the same stored row would fail the gate it passed. The bar
 * itself is `FRESHNESS_HOURS` from `@pemby/core` — one hard gate, one number, no local copy.
 */
const fresh = (hours: string): string =>
  `j.last_verified_live_at is not null
       and j.last_verified_live_at >= now() - make_interval(hours => ${hours}::int)`;

/** PLAN D2 as amended 2026-09-17: white and red never show, whatever a stored row says. */
const SHOWN_TIERS = `m.tier in ('green','yellow')`;

/**
 * PLAN D13: on a free account a match is delivered 24h after the post was first seen, on every
 * channel. The web Brief is a channel, so a match that is not yet due is not shown here either —
 * `loadBrief` answers with a count and a time instead (`SELECT_HELD`).
 */
const DUE = `(m.deliver_after is null or m.deliver_after <= now())`;

/**
 * The reader's own score bar, re-applied on read — the fifth predicate, and the newest
 * (owner decision 2026-09-19, amending PLAN D6).
 *
 * A `score` near miss is a row that **passed every hard gate** and landed between the near-miss
 * floor and the configured match threshold. Nothing about it is wrong except the bar, and the bar
 * is now the reader's to move. So when `profiles.score_floor` is set and the row clears it, this
 * read calls it what it is: a match.
 *
 * It belongs here for the same reason the other four predicates do. The matcher decides once, when
 * it writes the row, against the threshold from the private config; `profiles.score_floor` is set
 * afterwards, by the person, and the matcher has no idea it exists — `apps/worker/src/match/` still
 * reads `weights.thresholds.match` alone. Re-deciding on read is what makes the one-tap fix deliver
 * the rows its own count promises, in the same frame rather than at some later run.
 *
 * Two consequences, stated because they are real:
 *
 *  - A null `score_floor` makes the second arm `null`, never `true`, so an untouched profile reads
 *    exactly as it did before this column existed.
 *  - This changes **the web Brief only.** Telegram and email dispatch from `matches.kind = 'match'`,
 *    which these rows are not, so a lowered bar does not send anything anywhere.
 */
const ownBar = (floor: string): string =>
  `(${floor}::smallint is not null and m.blocker = 'score' and m.score >= ${floor}::smallint)`;

const isIn = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((s): s is string => typeof s === "string" && s !== "") : [];

// Reading ----------------------------------------------------------------

interface ProfileRow {
  residence_country: string | null;
  seniority: string | null;
  include_yellow: boolean;
  hide_no_salary: boolean;
  score_floor: number | string | null;
  stack: string[] | null;
}

/**
 * One eligibility row per match, chosen in SQL rather than in Node: the post's verdict for the
 * user's own country first, then the one whose tier the matcher recorded, then a region or `*`
 * scope. Without the `limit 1` a post with a country, a region and a worldwide rule would
 * multiply its match row three times.
 */
const ELIGIBILITY_JOIN = `
  left join lateral (
    select el.reason_key, el.reason_params, el.reason
      from job_eligibility el
     where el.job_id = j.id
       and (m.way_of_working is null or el.way_of_working = m.way_of_working)
     order by (el.scope = $2) desc nulls last,
              (el.tier = m.tier) desc,
              (el.scope <> '*') desc
     limit 1
  ) el on true`;

interface MatchRow {
  match_id: string;
  job_id: string;
  title: string;
  company_name: string;
  url: string;
  apply_url: string | null;
  locations: string[] | null;
  stack: string[] | null;
  tier: EligibilityTier;
  way_of_working: DbWayOfWorking | null;
  reasons: string[] | null;
  /**
   * Aliased away from `matches.reason_keys` / `reason_params`: the eligibility lateral join in the
   * same statement already selects `reason_key`, `reason_params` and `reason`, and two columns of
   * the same name in one result set silently leave only the last one.
   */
  score_reason_keys: string[] | null;
  score_reason_params: unknown;
  gap: string | null;
  gap_key: string | null;
  gap_params: unknown;
  score: number;
  state: string;
  pass_reason: string | null;
  last_verified_live_at: Date | null;
  reason_key: string | null;
  reason_params: unknown;
  reason: string | null;
  flagged: boolean;
  is_demo: boolean;
}

/**
 * The matches this user is being shown right now: $1 the user, $2 their country, $3 the freshness
 * bar in hours, $4 their own score bar (`profiles.score_floor`, null for the configured one).
 *
 * Every predicate above is applied, which is the difference between "the matcher said yes once"
 * and "this is a match today". A row that fails one of them is not quietly softened into a match
 * with a caveat printed on it; it is not a match, and `SELECT_NEAR_MISSES` decides whether it has
 * anywhere honest left to go.
 */
const SELECT_MATCHES = `
  select m.id as match_id, m.score, m.tier::text as tier, m.way_of_working::text as way_of_working,
         m.reasons, m.reason_keys as score_reason_keys, m.reason_params as score_reason_params,
         m.gap, m.gap_key, m.gap_params,
         m.state::text as state, m.pass_reason::text as pass_reason,
         j.id as job_id, j.title, j.url, j.apply_url, j.locations, j.last_verified_live_at,
         j.is_demo,
         c.name as company_name,
         e.stack,
         el.reason_key, el.reason_params, el.reason,
         exists (select 1 from flags f where f.job_id = j.id and f.user_id = $1) as flagged
    from matches m
    join jobs j on j.id = m.job_id
    join companies c on c.id = j.company_id
    left join job_enrichment e on e.job_id = j.id
    ${ELIGIBILITY_JOIN}
   where m.user_id = $1 and (m.kind = 'match' or ${ownBar("$4")})
     and ${SHOWN_TIERS} and ${DUE}
     and ${LIVE_JOB} and ${fresh("$3")}
   order by m.score desc, j.first_seen_at desc, m.id
   limit ${MATCH_LIMIT}`;

interface HeldRow {
  count: number | string;
  next_at: Date | null;
}

/**
 * How many matches are found but not due yet, and when the first of them lands: $1 the user, $2
 * the freshness bar in hours (PLAN D13).
 *
 * An aggregate on purpose. It is the only thing the Brief may say about an undelivered match, so
 * it is the only thing this statement is able to return — there is no title, company or URL in
 * the result set to leak by accident later. The same live, canonical, in-window and tier
 * predicates apply: a held match whose post dies before its delivery time was never a match, and
 * promising it would be a second dishonest line rather than a fix for the first.
 */
const SELECT_HELD = `
  select count(*)::int as count, min(m.deliver_after) as next_at
    from matches m
    join jobs j on j.id = m.job_id
   where m.user_id = $1 and m.kind = 'match'
     and ${SHOWN_TIERS}
     and m.deliver_after is not null and m.deliver_after > now()
     and ${LIVE_JOB} and ${fresh("$2")}`;

interface NearMissRow {
  blocker: string | null;
  total: string | number;
  yellow_total: string | number;
  at_floor_total: string | number;
  job_id: string;
  title: string;
  company_name: string;
  is_demo: boolean;
}

/**
 * Near misses grouped by the one gate that blocked them (PLAN D7), with a few example posts each:
 * $1 the user, $2 the freshness bar in hours, $3 the user's own score bar, $4 the lowest bar they
 * may set (`MIN_SCORE_FLOOR`).
 *
 * The count is the whole group, not the examples: the window functions count before the
 * `row_number` cut, so "66 look likely" stays true while only four names are shown. `yellow_total`
 * is counted separately because the "include the likely ones" fix only reaches yellow posts, and
 * `at_floor_total` for the same reason: dropping the score bar to its floor opens only the rows
 * that already score at or above it, so that is the number the `score` fix is offered against.
 *
 * $3 also takes rows **out** of this list. A `score` near miss the reader's own bar already clears
 * is not a near miss any more — `SELECT_MATCHES` is showing it as a match — and leaving it here
 * would count it twice on one page, once as delivered and once as still blocked.
 *
 * Three rules decide what may be called a near miss:
 *
 * 1. **It names its gate.** `retireStaleMatches` withdraws a verdict it can no longer stand behind
 *    by setting `kind = 'near_miss', blocker = null` while keeping everything the person did with
 *    the row. That is "nothing current has judged this", not "one thing away", and rendering it
 *    put a job the person had already applied to back in their own Brief as an unexplained near
 *    miss. `blocker is not null` is the same rule `countNearMissesByBlocker` in `@pemby/db` keeps.
 * 2. **Nobody has acted on it.** A near miss is a recommendation, and a post the person saved,
 *    applied to or passed on is not one — it would come back around as a nameless chip. This also
 *    keeps the stale arm below from re-presenting the person's own row.
 * 3. **It is a post they are allowed to see**: live, canonical, green or yellow (PLAN D2: white
 *    and red never show, so a stray row cannot surface even if something writes one) and due.
 *
 * The second arm is where a match goes when the freshness window closes under it. The verdict is
 * no longer true, but the post still exists and still failed exactly one hard gate, which is what
 * the near-miss mechanism is for; `freshness` is already one of the eight blockers, with its own
 * words and its own honest "no setting opens this group". A closed or superseded post has no such
 * place and simply leaves the Brief.
 */
const SELECT_NEAR_MISSES = `
  select blocker, total, yellow_total, at_floor_total, job_id, title, company_name, is_demo
    from (
      select blocker::text as blocker, job_id, title, company_name, is_demo,
             count(*) over (partition by blocker) as total,
             count(*) filter (where tier = 'yellow') over (partition by blocker) as yellow_total,
             count(*) filter (where blocker = 'score' and score >= $4::smallint)
               over (partition by blocker) as at_floor_total,
             row_number() over (
               partition by blocker order by score desc, first_seen_at desc, job_id
             ) as rn
        from (
          select case when m.kind = 'match' then 'freshness'::match_gate else m.blocker end
                   as blocker,
                 m.score, m.tier, j.id as job_id, j.title, j.first_seen_at,
                 c.name as company_name, (j.is_demo or c.is_demo) as is_demo
            from matches m
            join jobs j on j.id = m.job_id
            join companies c on c.id = j.company_id
           where m.user_id = $1
             and m.state = 'new'
             and ${SHOWN_TIERS} and ${DUE} and ${LIVE_JOB}
             and not (${ownBar("$3")})
             and case when m.kind = 'match' then not (${fresh("$2")})
                      else m.blocker is not null end
        ) judged
    ) grouped
   where rn <= ${EXAMPLES_PER_GROUP}
   order by total desc, blocker nulls last, rn`;

function toParams(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") out[key] = raw;
  }
  return out;
}

/** A stored key this build still knows; anything else falls back to the English beside it. */
const scoreKey = (value: unknown): ScoreReasonKey | null =>
  isIn<ScoreReasonKey>(SCORE_REASON_KEYS, value) ? value : null;

/**
 * The match's reason bullets, keys first.
 *
 * `reason_keys` and `reasons` are written together by the matcher, in the same order, so they are
 * zipped positionally. A row from before migration 0009 has no keys at all and yields English-only
 * views; a row whose two columns somehow disagree in length still renders, because each bullet
 * carries its own `text` and the renderer prefers whichever of the two it has.
 */
function toScoreReasons(row: MatchRow): ScoreReasonView[] {
  const english = strings(row.reasons).slice(0, 3);
  const keys = strings(row.score_reason_keys).slice(0, 3);
  const params = Array.isArray(row.score_reason_params) ? row.score_reason_params : [];
  if (keys.length === 0) return english.map((text) => ({ key: null, params: {}, text }));
  return keys.map((key, i) => ({
    key: scoreKey(key),
    params: toParams(params[i]),
    text: english[i] ?? null,
  }));
}

function toScoreGap(row: MatchRow): ScoreReasonView | null {
  if (row.gap_key === null && row.gap === null) return null;
  return { key: scoreKey(row.gap_key), params: toParams(row.gap_params), text: row.gap };
}

function toMatchView(row: MatchRow): BriefMatchView {
  const locations = strings(row.locations);
  return {
    matchId: row.match_id,
    jobId: row.job_id,
    title: row.title,
    company: row.company_name,
    url: row.apply_url ?? row.url,
    location: locations[0] ?? null,
    otherLocations: Math.max(0, locations.length - 1),
    tier: row.tier,
    wayOfWorking: row.way_of_working,
    lastVerifiedLiveAt: row.last_verified_live_at?.toISOString() ?? null,
    eligibility: {
      key: (row.reason_key as EngineReasonKey | null) ?? null,
      params: toParams(row.reason_params),
      text: row.reason,
    },
    reasons: toScoreReasons(row),
    gap: toScoreGap(row),
    score: Number(row.score),
    state: isIn(MATCH_STATES, row.state) ? row.state : "new",
    passReason: (row.pass_reason as PassReason | null) ?? null,
    flagged: row.flagged,
    stack: strings(row.stack),
    locations,
    demo: row.is_demo,
  };
}

function toGroups(rows: NearMissRow[]): NearMissGroupView[] {
  const groups = new Map<string, NearMissGroupView>();
  for (const row of rows) {
    const key = row.blocker ?? "";
    let group = groups.get(key);
    if (!group) {
      group = {
        blocker: isIn<NearMissBlocker>(NEAR_MISS_BLOCKERS, row.blocker) ? row.blocker : null,
        count: Number(row.total),
        yellowCount: Number(row.yellow_total),
        atFloorCount: Number(row.at_floor_total),
        examples: [],
      };
      groups.set(key, group);
    }
    group.examples.push({
      jobId: row.job_id,
      title: row.title,
      company: row.company_name,
      demo: row.is_demo,
    });
  }
  return [...groups.values()];
}

/**
 * The next real steps from the programs calendar, for a junior or intern with a silent Brief
 * (PLAN D7, D11). Above junior `nextProgramSteps` answers an empty list, and the Brief simply has
 * no programs section. The clock is passed in, as that module requires.
 */
function programsFor(country: string | null, seniority: Seniority | null): ProgramNextStep[] {
  try {
    return nextProgramSteps({ country, now: new Date(), seniority });
  } catch {
    // A programs.json that fails validation must not take the whole Brief down with it.
    return [];
  }
}

/**
 * The undelivered-match summary, with `nextAt` dropped when there is nothing to wait for: an empty
 * aggregate answers one row of zero and null, and a stale `min()` beside a zero count would be a
 * time with nothing attached to it.
 */
/**
 * `profiles.score_floor` as the view and the SQL both want it: an integer in range, or null.
 *
 * Anything else — a value written before the route's bounds existed, a hand-edited row — reads as
 * null, which is "use the configured threshold". Failing back to Pemby's own bar is the safe
 * direction: a bad value must never *widen* what a person is shown.
 */
function toScoreFloor(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < MIN_SCORE_FLOOR || value > 100) return null;
  return value;
}

function toHeld(row: HeldRow | undefined): HeldView {
  const count = Number(row?.count ?? 0);
  if (!Number.isFinite(count) || count <= 0) return { count: 0, nextAt: null };
  return { count, nextAt: row?.next_at?.toISOString() ?? null };
}

/** Everything the Brief page shows for one user, in one round trip. */
export async function loadBrief(userId: string): Promise<BriefView> {
  const client = getDb().$client;

  const profile = await client.query<ProfileRow>(
    `select residence_country, seniority::text as seniority, include_yellow, hide_no_salary,
            score_floor, stack
       from profiles where user_id = $1`,
    [userId],
  );
  const row = profile.rows[0];
  const country = row?.residence_country ?? null;
  const seniority: Seniority | null = isIn(SENIORITIES, row?.seniority) ? row.seniority : null;
  const scoreFloor = toScoreFloor(row?.score_floor);

  const [matches, held, nearMisses] = await Promise.all([
    client.query<MatchRow>(SELECT_MATCHES, [userId, country, FRESHNESS_HOURS, scoreFloor]),
    client.query<HeldRow>(SELECT_HELD, [userId, FRESHNESS_HOURS]),
    client.query<NearMissRow>(SELECT_NEAR_MISSES, [
      userId,
      FRESHNESS_HOURS,
      scoreFloor,
      MIN_SCORE_FLOOR,
    ]),
  ]);

  const groups = toGroups(nearMisses.rows);
  return {
    readAt: new Date().toISOString(),
    country,
    seniority,
    includeYellow: row?.include_yellow ?? false,
    hideNoSalary: row?.hide_no_salary ?? false,
    scoreFloor,
    matches: matches.rows.map(toMatchView),
    held: toHeld(held.rows[0]),
    nearMisses: groups,
    nearMissTotal: groups.reduce((sum, group) => sum + group.count, 0),
    programs: programsFor(country, seniority),
  };
}

// Writing ----------------------------------------------------------------

/**
 * The Brief's "Apply" writes an `applications` row **before** it moves the match.
 *
 * This is the write that was missing. The tracker's Applied column reads `applications.state`
 * (`trackerColumnOf` in `@pemby/core`), and this surface moved `matches.state` and stopped — so a
 * job applied to from the Brief never reached the board at all. A blind review found the same hole
 * on the Telegram side of this phase; this is the third writer.
 *
 * `upsertApplication` from `@pemby/db` does the write, and nothing here hand-rolls the insert: one
 * implementation, called from the web tracker, the bot and here, is the whole point of the kernel
 * helper. `applied_at` is deliberately not passed, so the column's `now()` default records when
 * the person first applied and a later move through screening cannot rewrite it.
 *
 * **Before, and outside the transaction below.** The web cannot open a Drizzle transaction around a
 * kernel helper, so one of the two writes has to be able to fail alone, and the order decides which
 * way. This way the survivable failure is an `applications` row with a `matches.state` that has not
 * caught up — harmless, because the mapping gives the application row priority, so the board is
 * right and only the Brief lags until the next write. The other order leaves an applied match the
 * tracker cannot see, which is the defect being fixed.
 *
 * Returns quietly when the match is not this user's: the transaction below answers that case.
 */
async function recordApplied(userId: string, matchId: string): Promise<void> {
  const { rows } = await getDb().$client.query<{ job_id: string }>(
    "select job_id from matches where id = $1 and user_id = $2",
    [matchId, userId],
  );
  const jobId = rows[0]?.job_id;
  if (!jobId) return;
  await upsertApplication(getDb(), { userId, jobId, matchId, state: "applied" });
}

/**
 * Moves one match to a new state, and — for "Not for me" — folds the reason into the user's own
 * scoring nudges (PLAN D6: the one-tap reason tunes future scoring).
 *
 * Both writes happen on one connection inside a transaction, with the profile row locked, because
 * the nudge map is a read-modify-write on a jsonb column: two taps in the same second would
 * otherwise lose one of them. `applyPassFeedback` owns every bound on that map.
 *
 * Returns false when the match is not this user's, or is already gone.
 */
export async function setMatchState(
  userId: string,
  matchId: string,
  state: MatchState,
  passReason: PassReason | null,
): Promise<boolean> {
  // The tracker's source of truth, written first (see `recordApplied`).
  if (state === "applied") await recordApplied(userId, matchId);

  const client = await getDb().$client.connect();
  try {
    await client.query("begin");

    const updated = await client.query<{ job_id: string }>(
      `update matches
          set state = $3::match_state,
              pass_reason = $4::match_pass_reason,
              state_changed_at = now(),
              updated_at = now()
        where id = $2 and user_id = $1
        returning job_id`,
      [userId, matchId, state, state === "passed" ? passReason : null],
    );
    const jobId = updated.rows[0]?.job_id;
    if (!jobId) {
      await client.query("rollback");
      return false;
    }

    if (state === "passed" && passReason) {
      const profile = await client.query<{ scoring_nudges: unknown; stack: string[] | null }>(
        "select scoring_nudges, stack from profiles where user_id = $1 for update",
        [userId],
      );
      const current = profile.rows[0];
      if (current) {
        const job = await client.query<{
          company_id: string | null;
          role_family: string | null;
          seniority: string | null;
          lists_salary: boolean;
          stack: string[] | null;
        }>(
          `select j.company_id, j.role_family, e.seniority::text as seniority, e.stack,
                  (coalesce(e.salary_min, j.salary_min) is not null
                   or coalesce(e.salary_max, j.salary_max) is not null) as lists_salary
             from jobs j left join job_enrichment e on e.job_id = j.id
            where j.id = $1`,
          [jobId],
        );
        const facts = job.rows[0];
        if (facts) {
          const nudgeJob: NudgeJob = {
            companyId: facts.company_id,
            roleFamily: isIn<RoleFamily>(ROLE_FAMILIES, facts.role_family)
              ? facts.role_family
              : null,
            seniority: isIn(DB_SENIORITIES, facts.seniority)
              ? fromDbSeniority(facts.seniority)
              : null,
            stack: strings(facts.stack),
            listsSalary: facts.lists_salary,
          };
          const nudges = applyPassFeedback(
            typeof current.scoring_nudges === "object" && current.scoring_nudges !== null
              ? (current.scoring_nudges as Record<string, number>)
              : {},
            { reason: passReason, job: nudgeJob, userStack: strings(current.stack) },
          );
          await client.query(
            "update profiles set scoring_nudges = $2::jsonb, updated_at = now() where user_id = $1",
            [userId, JSON.stringify(nudges)],
          );
        }
      }
    }

    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** The post's own stack and locations: the fixed lists the "wrong details" picker offers. */
export async function loadFlagTarget(
  jobId: string,
): Promise<{ stack: string[]; locations: string[] } | null> {
  const { rows } = await getDb().$client.query<{
    stack: string[] | null;
    locations: string[] | null;
  }>(
    `select e.stack, j.locations
       from jobs j left join job_enrichment e on e.job_id = j.id
      where j.id = $1`,
    [jobId],
  );
  const row = rows[0];
  return row ? { stack: strings(row.stack), locations: strings(row.locations) } : null;
}

export async function hasFlagged(userId: string, jobId: string): Promise<boolean> {
  const { rows } = await getDb().$client.query<{ exists: boolean }>(
    "select exists (select 1 from flags where job_id = $1 and user_id = $2) as exists",
    [jobId, userId],
  );
  return rows[0]?.exists ?? false;
}

/**
 * Stores one flag (PLAN D26, section 6). `country` is the flagger's own residence, which is what
 * "doesn't hire from my country" means and what the worker's re-verification rule reads.
 *
 * `note` is left null on every path: this picker has no free text, so there is nothing to store
 * and nothing that could reach a model.
 */
export async function insertFlag(userId: string, body: FlagBody): Promise<boolean> {
  const { rows } = await getDb().$client.query<{ id: string }>(
    `insert into flags (job_id, user_id, reason, country, field, field_value)
     values ($1, $2, $3::flag_reason,
             (select residence_country from profiles where user_id = $2),
             $4::flag_field, $5)
     on conflict do nothing
     returning id`,
    [body.jobId, userId, body.reason, body.field ?? null, body.fieldValue ?? null],
  );
  return rows.length > 0;
}

export interface SavedPreferences {
  includeYellow: boolean;
  hideNoSalary: boolean;
  scoreFloor: number | null;
}

/**
 * The three one-tap fixes the near-miss groups offer (PLAN D7, plus the score bar added by the
 * owner decision of 2026-09-19). `include_yellow` is a free-tier setting since the D13 amendment of
 * 2026-09-17, so nothing here checks a pass, and neither does the score bar: it narrows or widens
 * one person's own Brief and costs nothing.
 *
 * The two booleans use `coalesce($n, column)`, where the parameter is null when the key was absent.
 * **`score_floor` cannot**, because null is one of its two meanings: absent is "leave the bar
 * alone" and `null` is "hand it back to the configured threshold". A second parameter carries the
 * difference, so a clear is a clear and an untouched key stays untouched.
 *
 * The route has already refused anything below `MIN_SCORE_FLOOR`; the bound is restated here
 * because this is the statement that writes the column.
 */
export async function patchPreferences(
  userId: string,
  patch: PreferencesPatch,
): Promise<SavedPreferences | null> {
  const client = getDb().$client;
  await client.query(
    `insert into profiles (user_id) select $1 where exists (select 1 from "user" where id = $1)
     on conflict (user_id) do nothing`,
    [userId],
  );
  const setsFloor = patch.scoreFloor !== undefined;
  const floor = setsFloor ? toScoreFloor(patch.scoreFloor) : null;
  const { rows } = await client.query<{
    include_yellow: boolean;
    hide_no_salary: boolean;
    score_floor: number | string | null;
  }>(
    `update profiles
        set include_yellow = coalesce($2::boolean, include_yellow),
            hide_no_salary = coalesce($3::boolean, hide_no_salary),
            score_floor = case when $4::boolean then $5::smallint else score_floor end,
            updated_at = now()
      where user_id = $1
      returning include_yellow, hide_no_salary, score_floor`,
    [userId, patch.includeYellow ?? null, patch.hideNoSalary ?? null, setsFloor, floor],
  );
  const row = rows[0];
  return row
    ? {
        includeYellow: row.include_yellow,
        hideNoSalary: row.hide_no_salary,
        scoreFloor: toScoreFloor(row.score_floor),
      }
    : null;
}
