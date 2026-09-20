// How much one person's flag counts (PLAN section 6: "flags from pass holders and accurate past
// flaggers weigh more; daily flag limit per user").
//
// **This is a security control, not a tuning knob.** `flags.weight` defaults to 1, nothing computed
// anything else before this file, and the eligibility engine downgrades a company's tier once red
// flag evidence sums to 2 (`packages/core/src/eligibility/engine/index.ts:1324`). The kernel's
// `flagIsReal` excludes flaggers with a *demo* profile, so a user with **no profile at all** —
// signed up, never onboarded — counted in full. With open sign-up on staging that was two throwaway
// accounts to downgrade a real company's tier.
//
// **One ladder, not two.** `flags.weight` is not the only thing that reaches the engine's sum: the
// tracker's "rejected because of my location?" also writes an `eligibility_evidence` row, at
// `LOCATION_REPORT_WEIGHT` (`apps/web/app/api/applications/_lib/db.ts`). Both land in the same
// column and are added up by the same engine, so they are one scale and are set together. The
// ordering is the part that matters, and it runs:
//
//   a report from someone holding a **real application** on a job Pemby delivered them
//     > a flag from a pass holder or a flagger with a good record
//       > a flag from an ordinary onboarded account
//         > a flag from an account that signed up minutes ago
//
// A person who applied and was told no is the strongest evidence in the system: it costs a delivered
// match and a recorded application to produce, neither of which an abuser can mint. A flag costs an
// email address.
//
// The policy, stated plainly:
//
//     weight = clamp(base x accuracy x burst, 0.05, 1.00)
//
//   base      0.20  no `profiles` row, or onboarding never completed   <- **a new account**
//             0.40  onboarded, account younger than 24 hours
//             0.60  onboarded, account at least 24 hours old            <- the honest norm
//             0.80  holds an active pass, at any account age
//
//   accuracy  1.50  >= 2 upheld and 0 dismissed       (over this user's OTHER resolved flags)
//             1.25  >= 1 upheld and 0 dismissed
//             1.00  nothing resolved yet
//             0.50  exactly 1 dismissed
//             0.20  >= 2 dismissed
//
//   burst     1.00  N <= 3      (N = flags this user filed in the trailing 24 h, this one included)
//             3/N   N > 3       (the 4th weighs 3/4 of it, the 10th 0.3)
//
// **A brand-new unonboarded account is worth 0.20**, so ten are needed to reach the engine's
// threshold of 2 — and the per-user daily limit that already exists (`flag:user:<id>`, 24 h, max 10,
// in `apps/web/lib/cv/rate-limit.ts` and the bot's copy) plus the one-flag-per-(job, user) rule mean
// those ten must be ten separate sign-ups filing on the same posting.
//
// **The ceiling is 1.00, and that is the ordering as an invariant rather than as a comment.** No
// flag, however good its author's record, may outweigh a real applicant's report. Without the cap a
// pass holder with two upheld flags would come to 1.20 and quietly outrank the strongest evidence
// the product has.
//
// **PLAN section 6's "2+ independent flags downgrade the tier" cannot be read as "any two
// accounts", and this is where that is decided.** The same document asks for pass holders and
// accurate flaggers to weigh more, and the phase contract requires that two throwaway accounts not
// reach the threshold — a literal reading contradicts both. It is read here as *two of the reports
// we trust most*: two location reports from real applicants, or two flags from the best-regarded
// flaggers, reach 2. Four ordinary onboarded accounts do. Ten throwaways do.
//
// **Designed to be recoverable rather than perfect.** A mistaken downgrade is undone by dismissing
// the flag: `recordFlagOutcome` withdraws its evidence on `dismissed`, and `deleteFlagEvidence` is
// exported for the owner's admin surface. That is why this errs toward acting on real signals
// rather than toward never acting.
//
// **`DELIVER_TEST_PASS_HOLDERS` is deliberately not honoured here.** It is phase 08's stand-in
// allowlist for delivery timing, set from an environment variable, and an environment variable that
// makes someone's reports heavier is an abuse path with a deploy in front of it. Only a real row in
// `passes` counts.
//
// The weight is recomputed for every open flag on each sweep, before any rule counts anything, so
// the backlog of flags stored before this file existed is re-weighed too — there is no separate
// backfill to forget to run. An UPDATE that writes the same value is a no-op, so the pass is cheap
// and idempotent.
import type { Db } from "@pemby/db";
import { sql } from "drizzle-orm";

/** The floor keeps a flagger with a bad record countable but nearly weightless, never zero. */
export const FLAG_WEIGHT_MIN = 0.05;

/**
 * The ceiling, and it is load-bearing: **no flag may outweigh a real applicant's location report**
 * (`LOCATION_REPORT_WEIGHT` in `apps/web/app/api/applications/_lib/db.ts`, the same evidence scale).
 * Without it the accuracy multiplier lets a pass holder with a good record reach 1.2 and outrank the
 * strongest evidence the product can produce.
 */
export const FLAG_WEIGHT_MAX = 1;

/** What a brand-new, unonboarded account's flag is worth. **Ten** of them reach the engine's 2. */
export const FLAG_WEIGHT_NEW_ACCOUNT = 0.2;

/** Onboarded, but the account is younger than `FLAG_ACCOUNT_YOUNG_HOURS`. Five reach 2. */
export const FLAG_BASE_YOUNG = 0.4;

/** Onboarded and settled: the honest norm. **Four** of them reach 2. */
export const FLAG_BASE_ESTABLISHED = 0.6;

/** An active `passes` row. **Three** reach 2; with a good record, two do. */
export const FLAG_BASE_PASS_HOLDER = 0.8;

/**
 * The most an **orphaned** flag may be worth — one whose author has deleted their account.
 *
 * **This is a fix for a working attack, not a tuning choice.** `flags.user_id` is
 * `on delete set null`, `flags.weight` defaults to **1** (the top of this ladder), and there is a
 * self-service hard delete. So a flag filed and orphaned *before the first sweep* was never weighed
 * at all and kept the column default for ever. Measured against a real database: two sign-ups, two
 * flags, two account deletions, `engine_sum = 2`, tier downgraded — where the ladder says ten.
 *
 * Once the account is gone nothing about its author is verifiable: not whether they onboarded, not
 * how old the account was, not their past accuracy. So an orphan is worth what the **weakest**
 * account could ever have been worth, and no more. It is applied with `least(...)`, downward only,
 * so a flag already below this keeps its lower weight.
 *
 * The cost is that a pass holder who later deletes their account has their past reports discounted.
 * That is the right trade: the alternative is a two-account tier downgrade, and a downgrade is
 * recoverable (dismissing the flag withdraws its evidence) while an unbounded laundering path is
 * not.
 */
export const FLAG_WEIGHT_ORPHANED_MAX = FLAG_WEIGHT_NEW_ACCOUNT;

/** Flags per user per rolling 24 h before the burst divisor starts biting. */
export const FLAG_BURST_FREE = 3;

/** Account age, in hours, at which an onboarded account stops being "brand new". */
export const FLAG_ACCOUNT_YOUNG_HOURS = 24;

export interface ReweighResult {
  /** Open flags looked at. */
  considered: number;
  /** Of those, the ones whose stored weight this pass moved. */
  changed: number;
  /** Of those, the ones now weighing less than the column default of 1. */
  discounted: number;
}

/**
 * Recompute `flags.weight` for up to `limit` open flags, oldest first.
 *
 * One statement, because the inputs are all reads against tables the worker has no other reason to
 * pull into memory, and because a per-flag round trip over a backlog is a lot of latency for
 * arithmetic Postgres can do in the same plan.
 *
 * **Scope.** Open flags only. A flag that already has a verdict keeps the weight it was judged
 * under: `countIndependentFlags` includes actioned flags, and silently re-scoring history would
 * mean the same evidence adds up differently tomorrow with nothing in the database saying why.
 *
 * **Orphaned flags are weighed too, and that is the fix for the laundering attack.** This used to
 * target `f.user_id is not null` and leave a flag whose author deleted their account carrying
 * whatever it already had — which, for a flag filed and orphaned before the first sweep, is the
 * column default of **1**, the top of the ladder. Orphans are now clamped to
 * `FLAG_WEIGHT_ORPHANED_MAX` (downward only); see that constant for the measurement.
 *
 * **Demo is not excluded here and does not need to be.** This writes a number on a `flags` row and
 * spends nothing; the demo guard belongs where a rule acts, and it is in `claimFlagsToProcess` and
 * `countIndependentFlags` where it is load-bearing. Re-weighing a seeded flag changes a seeded
 * number.
 */
export async function reweighOpenFlags(db: Db, limit: number): Promise<ReweighResult> {
  if (limit <= 0) return { considered: 0, changed: 0, discounted: 0 };

  const rows = await db.execute<{ changed: boolean; weight: number }>(sql`
    with target as (
      select f.id, f.user_id, f.weight
        from flags f
       where f.status = 'open'
       order by f.created_at, f.id
       limit ${limit}
    ),
    scored as (
      select
        t.id,
        -- An orphaned flag: the author is gone, so nothing about them is verifiable and the
        -- ladder cannot be evaluated. Worth at most the weakest live account, never more, and
        -- never raised above what it already carries.
        case when t.user_id is null then least(t.weight::numeric, ${FLAG_WEIGHT_ORPHANED_MAX}::numeric)
        else
        -- base
        case
          when exists (
                 select 1 from passes p
                  where p.user_id = t.user_id
                    and p.revoked_at is null and p.paused_at is null
                    and p.starts_at <= now() and p.ends_at > now()
               ) then ${FLAG_BASE_PASS_HOLDER}::numeric
          when not exists (
                 select 1 from profiles pr
                  where pr.user_id = t.user_id and pr.onboarding_completed_at is not null
               ) then ${FLAG_WEIGHT_NEW_ACCOUNT}::numeric
          when (select u.created_at from "user" u where u.id = t.user_id)
               > now() - make_interval(hours => ${FLAG_ACCOUNT_YOUNG_HOURS})
            then ${FLAG_BASE_YOUNG}::numeric
          else ${FLAG_BASE_ESTABLISHED}::numeric
        end
        *
        -- accuracy, over this user's OTHER resolved flags
        case
          when (select count(*) from flags d
                 where d.user_id = t.user_id and d.id <> t.id
                   and d.status = 'dismissed') >= 2 then 0.2
          when (select count(*) from flags d
                 where d.user_id = t.user_id and d.id <> t.id
                   and d.status = 'dismissed') = 1 then 0.5
          when (select count(*) from flags a
                 where a.user_id = t.user_id and a.id <> t.id
                   and a.status = 'auto_resolved'
                   and a.action_taken is not null and a.action_taken <> 'none') >= 2 then 1.5
          when (select count(*) from flags a
                 where a.user_id = t.user_id and a.id <> t.id
                   and a.status = 'auto_resolved'
                   and a.action_taken is not null and a.action_taken <> 'none') >= 1 then 1.25
          else 1.0
        end
        *
        -- burst, over the trailing 24 h including this flag
        case
          when (select count(*) from flags b
                 where b.user_id = t.user_id
                   and b.created_at > now() - interval '24 hours') > ${FLAG_BURST_FREE}
          then ${FLAG_BURST_FREE}::numeric
               / (select count(*) from flags b
                   where b.user_id = t.user_id
                     and b.created_at > now() - interval '24 hours')::numeric
          else 1.0
        end
        end
        as raw
        from target t
    ),
    -- Clamped once, here, so the UPDATE and the "did it move" comparison cannot drift apart.
    final as (
      select s.id,
             least(${FLAG_WEIGHT_MAX}::real,
                   greatest(${FLAG_WEIGHT_MIN}::real, s.raw::real)) as weight
        from scored s
    )
    update flags f
       set weight = fi.weight,
           updated_at = case when f.weight is distinct from fi.weight then now() else f.updated_at end
      from final fi
     where f.id = fi.id
       and f.status = 'open'
    returning fi.weight as weight, (f.updated_at >= now()) as changed
  `);

  // `returning` reads the row as the UPDATE left it, so `updated_at >= now()` (statement time) is
  // true exactly for the rows the CASE above stamped — that is, the ones whose weight moved.
  return {
    considered: rows.rows.length,
    changed: rows.rows.filter((r) => r.changed).length,
    discounted: rows.rows.filter((r) => Number(r.weight) < 1).length,
  };
}
