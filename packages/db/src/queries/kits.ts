// Application kits (PLAN D9, phase 09): the free-quota count, the write, and the two reads the
// kit surface needs.
//
// Called from `apps/worker` (which generates a kit) and from `apps/web` (which decides whether the
// user may ask for one, and renders what came back). `apps/web` may *call* a helper here but may
// not write a query of its own: there is one `drizzle-orm` in the store and `apps/web/package.json`
// does not declare it, so `import { eq } from "drizzle-orm"` does not resolve there. Anything whose
// correctness depends on there being exactly one implementation — the quota count above all — lives
// here and is called from both sides.
//
// Conventions, from `./matching.ts`: array parameters always go through `sql.param` (a bare array
// in an `sql` template is expanded into a parenthesised `($1, $2)` list, which is not an array);
// every timestamp read through `db.execute` is selected as epoch milliseconds and rebuilt, because
// a raw execute has no column mappers and a `timestamptz` arrives as Postgres's own text.
import { and, desc, eq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Db } from "../client";
import { kits } from "../schema";

export type Kit = typeof kits.$inferSelect;
export type NewKit = typeof kits.$inferInsert;

const epochMs = (column: SQL, alias: string): SQL =>
  sql`(extract(epoch from ${column}) * 1000)::bigint as ${sql.raw(alias)}`;

/**
 * How many kits this user has generated in the calendar month containing `now`, in UTC.
 *
 * This is the number the free quota is checked against, and `kits` rows are what it counts —
 * **never `ai_usage`**, whose rows are per model *attempt*: a fallback to a second model and a
 * repair retry are separate rows for one kit, so counting them would charge a user two or three
 * kits for one, and would charge them for a generation that failed and produced nothing.
 *
 * The verdict itself is not taken here. `kitQuotaVerdict` in `@pemby/core` owns the rule and the
 * number 3; this returns a count and nothing else, so no caller can re-derive a quota.
 *
 * **No demo exclusion, deliberately.** Every other helper in phase 09 that touches a rule which
 * spends money or changes a real job joins `profiles.is_demo = false`, because `is_demo` exists
 * only on `profiles`, `companies` and `jobs` and the seed writes demo rows everywhere else. Here
 * that join would be backwards: this counts one named user's own rows against their own quota, and
 * excluding a demo user would return 0 for them for ever — an *unlimited* kit allowance for the
 * one account that is meant to be fictional. Whether a demo user may spend at all is a question for
 * the worker that generates the kit, not for the counter.
 *
 * **`key_class = 'user'` rows do not count.** The free quota is Pemby's own spend, and a kit paid
 * for with the user's own connected OpenRouter key costs Pemby nothing. Counting those would mean:
 * a free user connects their key on the 3rd, generates ten kits on their own credits, disconnects
 * on the 20th — and is then refused all three of the free kits they are owed, for the crime of
 * having paid for their own. Spelled `<> 'user'` rather than `in ('public','private')` so the
 * meaning stays "kits Pemby paid for" if a fourth key class is ever added.
 *
 * Month bounds are computed in SQL (`date_trunc('month', ...) at time zone 'UTC'`) so the range
 * lands on `kits_user_created_idx` and so the boundary is decided by one clock, the database's,
 * rather than by whichever process happened to build the Date.
 */
export async function countKitsThisMonth(db: Db, userId: string, now: Date): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`
    select count(*)::int as n
      from kits
     where user_id = ${userId}
       and ${pembyPaid()}
       and ${inMonth(now)}
  `);
  return Number(rows.rows[0]?.n ?? 0);
}

/** Kits Pemby paid for. A user-key kit is free to us and never counts against the free quota. */
const pembyPaid = (): SQL => sql`key_class <> 'user'`;

/** The calendar month containing `at`, in UTC, as a predicate on `kits.created_at`. */
const inMonth = (at: Date): SQL => {
  const iso = at.toISOString();
  const start = sql`(date_trunc('month', ${iso}::timestamptz at time zone 'UTC') at time zone 'UTC')`;
  const end = sql`((date_trunc('month', ${iso}::timestamptz at time zone 'UTC') + interval '1 month') at time zone 'UTC')`;
  return sql`created_at >= ${start} and created_at < ${end}`;
};

/**
 * Store a generated kit, unconditionally. Returns the new row's id.
 *
 * **Enforces no quota.** Use `insertKitWithinQuota` on any path a free user can reach; this one is
 * for the paths where the entitlement question has already been answered by something other than a
 * count — a pass holder, or a kit paid for with the user's own key.
 */
export async function insertKit(db: Db, row: NewKit): Promise<{ id: string }> {
  const [inserted] = await db.insert(kits).values(row).returning({ id: kits.id });
  if (!inserted) throw new Error("insertKit wrote no row");
  return inserted;
}

export interface KitQuotaParams {
  /**
   * How many Pemby-paid kits this user may have this month, or **null for unlimited** (a pass
   * holder, or a connected own key).
   *
   * The number comes from `entitlementsFor` / `kitQuotaVerdict` in `@pemby/core` and **nowhere
   * else**. This file does not know that the free allowance is 3 and must never learn it: a second
   * copy of the number is a second policy.
   */
  limit: number | null;
  now: Date;
}

export type KitInsertResult =
  | { status: "inserted"; id: string; usedThisMonth: number }
  | { status: "quota-exhausted"; usedThisMonth: number }
  /**
   * There is no `profiles` row for this user, so there was nothing to lock and nothing was written.
   * Its own status rather than folding into `quota-exhausted`, because the two need opposite
   * answers on screen: one says "you have used your three", the other means the account never
   * finished onboarding, and telling that person their quota is gone would send them looking for a
   * problem that does not exist.
   */
  | { status: "no-profile" };

/**
 * Insert a kit **only if the user's quota still has room**, counting and inserting in one statement.
 *
 * **Why this exists.** `countKitsThisMonth` followed by `insertKit` is a read-then-write with no
 * reservation, and it loses the race exactly as you would expect: measured against a real table
 * with 2 kits written and a quota of 3, four concurrent quota reads all returned 2, all passed
 * `2 < 3`, and every insert succeeded — 4 kits in the month, reachable by anybody with two browser
 * tabs. The flag path was given `FOR UPDATE SKIP LOCKED` precisely to stop a double spend; this is
 * the same problem on the path that actually spends the money, and it deserves the same treatment.
 *
 * **How the reservation holds, and why it is two statements inside one transaction.** The first
 * statement takes a `FOR UPDATE` row lock on the user's own `profiles` row. The second counts and
 * inserts. In READ COMMITTED every statement takes a **fresh snapshot at its own start**, so the
 * count in statement two is taken after the lock was granted — which is after every caller ahead of
 * us committed — and therefore sees their kits.
 *
 * Doing both halves in **one** statement does not work, and I shipped that version first and caught
 * it in verification rather than in review, so the reasoning is recorded here. A single statement
 * takes its snapshot once, at statement start. Four concurrent callers all take their snapshots
 * before any of them holds the lock; the lock then serialises them perfectly, and every one of them
 * still counts against the state it saw before waiting. Measured on a real table, from empty, with a
 * quota of 3: **4 concurrent callers inserted 4 kits, and 8 concurrent callers also inserted 4.** It
 * looked correct in the case I first tested — where the quota was already spent by rows committed
 * before the statements began — which is exactly the shape of test that certifies a race as fixed.
 *
 * `profiles` is the right row to lock because it is already 1:1 with the person and already the home
 * of every other per-user entitlement input, and because locking it costs nothing to anyone else:
 * callers for different users never touch the same row. A user with **no** profile row locks nothing
 * and writes nothing, and gets `no-profile` rather than `quota-exhausted` — no profile means no
 * onboarding, and telling an un-onboarded person they had spent an allowance would send them looking
 * for a problem that does not exist.
 *
 * The caller can tell the two outcomes apart from `status`, and gets `usedThisMonth` either way so
 * a refusal can say "3 of 3 used" without a second query.
 */
export async function insertKitWithinQuota(
  db: Db,
  row: NewKit,
  { limit, now }: KitQuotaParams,
): Promise<KitInsertResult> {
  if (limit !== null && (!Number.isInteger(limit) || limit < 0)) {
    throw new Error(`kit quota limit must be a non-negative integer or null, got ${String(limit)}`);
  }
  if (limit === null) {
    const inserted = await insertKit(db, row);
    const usedThisMonth = await countKitsThisMonth(db, row.userId, now);
    return { status: "inserted", id: inserted.id, usedThisMonth };
  }

  return db.transaction(async (tx) => {
    // Statement one: the reservation. Everything after this runs with the lock held, so the count
    // below is taken against a snapshot that already includes every caller ahead of us.
    const locked = await tx.execute<{ user_id: string }>(sql`
      select user_id from profiles where user_id = ${row.userId} for update
    `);
    if (locked.rows.length === 0) return { status: "no-profile" as const };

    // Statement two: a fresh snapshot, so `used` is current, and the insert is gated on it.
    const rows = await tx.execute<{ id: string | null; used: number }>(sql`
      with used as (
        select count(*)::int as n
          from kits k
         where k.user_id = ${row.userId}
           and k.key_class <> 'user'
           and k.created_at >= (date_trunc('month', ${now.toISOString()}::timestamptz at time zone 'UTC') at time zone 'UTC')
           and k.created_at <  ((date_trunc('month', ${now.toISOString()}::timestamptz at time zone 'UTC') + interval '1 month') at time zone 'UTC')
      ), ins as (
        insert into kits (user_id, job_id, match_id, content, model, prompt_version, key_class, cost_usd)
        select ${row.userId}, ${row.jobId}::uuid, ${row.matchId ?? null}::uuid,
               ${JSON.stringify(row.content)}::jsonb, ${row.model}, ${row.promptVersion},
               ${row.keyClass}::key_class, ${row.costUsd ?? "0"}::numeric
          from used
         where used.n < ${limit}
        returning id
      )
      select (select id from ins) as id, (select n from used) as used
    `);

    const r = rows.rows[0];
    const used = Number(r?.used ?? 0);
    if (!r?.id) return { status: "quota-exhausted" as const, usedThisMonth: used };
    return { status: "inserted" as const, id: r.id, usedThisMonth: used + 1 };
  });
}

export interface SelectKitParams {
  userId: string;
  jobId: string;
}

/**
 * The user's kit for one job, or null.
 *
 * **Newest first, because `kits` has no unique key on `(user_id, job_id)`** and never has had one:
 * nothing stops a second kit being generated for the same pair, and a user who regenerates one
 * expects to see what they just got. The `limit 1` is therefore part of the meaning, not a
 * precaution. `user_id` is in the predicate rather than checked by the caller, so a kit can only
 * ever be read by the account that owns it.
 */
export async function selectKit(db: Db, { userId, jobId }: SelectKitParams): Promise<Kit | null> {
  const rows = await db
    .select()
    .from(kits)
    .where(and(eq(kits.userId, userId), eq(kits.jobId, jobId)))
    .orderBy(desc(kits.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export interface SelectKitByIdParams {
  kitId: string;
  userId: string;
}

/**
 * One kit by id, scoped to its owner. Null when the id does not exist **or** belongs to someone
 * else — the two are one answer on purpose, so a probe cannot tell a kit that is not yours from one
 * that does not exist.
 */
export async function selectKitById(
  db: Db,
  { kitId, userId }: SelectKitByIdParams,
): Promise<Kit | null> {
  const rows = await db
    .select()
    .from(kits)
    .where(and(eq(kits.id, kitId), eq(kits.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** One line per kit for the list view: the job it was written for, and when. No kit content. */
export interface KitSummary {
  kitId: string;
  jobId: string;
  matchId: string | null;
  title: string;
  companyName: string;
  url: string;
  applyUrl: string | null;
  createdAt: Date;
}

type RawKitSummary = {
  kit_id: string;
  job_id: string;
  match_id: string | null;
  title: string;
  company_name: string;
  url: string;
  apply_url: string | null;
  created_at_ms: string;
};

/**
 * The user's kits, newest first.
 *
 * Deliberately does not select `kits.content`: a list view renders titles and dates, and the
 * content is a cover letter written about this person — personal data that has no business being
 * loaded, serialized and shipped to a browser that is not going to render it.
 *
 * Ordered on `(user_id, created_at)`, which is exactly `kits_user_created_idx`.
 */
export async function listKits(db: Db, userId: string, limit: number): Promise<KitSummary[]> {
  const rows = await db.execute<RawKitSummary>(sql`
    select
      k.id as kit_id, k.job_id, k.match_id,
      ${epochMs(sql`k.created_at`, "created_at_ms")},
      j.title, j.url, j.apply_url,
      c.name as company_name
      from kits k
      join jobs j on j.id = k.job_id
      join companies c on c.id = j.company_id
     where k.user_id = ${userId}
     order by k.created_at desc, k.id desc
     limit ${limit}
  `);
  return rows.rows.map((r) => ({
    kitId: r.kit_id,
    jobId: r.job_id,
    matchId: r.match_id,
    title: r.title,
    companyName: r.company_name,
    url: r.url,
    applyUrl: r.apply_url,
    createdAt: new Date(Number(r.created_at_ms)),
  }));
}
