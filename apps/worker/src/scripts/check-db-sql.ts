// Runs the hand-written SQL in `packages/db/src/queries/**` against a **real PostgreSQL**, with
// real rows, and prints what it answered.
// Usage: DATABASE_URL=postgres://... pnpm --filter @pemby/worker check:sql
//
// This is not a test suite and there is no test runner (PLAN D24). It is the gate that was missing:
// roughly 1,250 lines of SQL ship in `packages/db/src/queries/`, and **no gate connected to a
// database**. `tsc` typechecks a `sql` template's *type* and never its contents, so a query can be
// syntactically wrong, join the wrong table, or drop `profiles.is_demo = false`, and typecheck, lint
// and build all stay green. `check:kernel` says so itself in its own header. Three wave-1 defects —
// the `for update` over-locking, the kit-quota race and the evidence double-insert — were found only
// because a reviewer stood up a database and ran the SQL by hand. This is that, as a step.
//
// **It lives in `apps/worker` rather than in `packages/db` for an ownership reason, not a design
// one**: phase 09's ownership map gives `packages/**` to wave 1 and this file was written by order
// D. The worker depends on `@pemby/db`, so every helper is importable; a later phase may want to
// move it next to the queries it checks.
//
// **Safety.** It writes and deletes real rows, so it refuses to run against a database that already
// holds job postings. Staging holds 7,816. A fresh CI service and a throwaway local cluster hold 0.
// `CHECK_SQL_ALLOW_DIRTY=1` overrides it, and nothing in CI sets that.
//
// **What it does not cover.** No pg-boss, no queue, no network, no model: the flag *rules* are
// driven by `flags:once` against a live worker, not here. `retireStaleMatches`, the delivery claim
// and the match scorer's SQL are untouched — this covers phase 09's kernel and the flag path, which
// is what phase 09 added. Nothing here proves a migration applies to a database that already has
// data; it applies them to an empty one.
import { randomUUID } from "node:crypto";
import {
  claimFlagsToProcess,
  closeJob,
  countIndependentFlags,
  countKitsThisMonth,
  createDb,
  deleteFlagEvidence,
  deleteUserAiKey,
  insertKitWithinQuota,
  loadUserAiKey,
  quarantineJob,
  recordFlagOutcome,
  selectDeliveryFailures,
  selectFlagsForReview,
  selectQuarantinedJobs,
  selectTracker,
  selectUserAiKeyStatus,
  upsertApplication,
  upsertUserAiKey,
  type Db,
} from "@pemby/db";
import { sql } from "drizzle-orm";

import { loadFlagForRule } from "../flags/load";
import { ruleClosedOrFake } from "../flags/rules";
import {
  FLAG_BASE_ESTABLISHED,
  FLAG_BASE_PASS_HOLDER,
  FLAG_WEIGHT_MAX,
  FLAG_WEIGHT_NEW_ACCOUNT,
  FLAG_WEIGHT_ORPHANED_MAX,
  reweighOpenFlags,
} from "../flags/weight";
import { createHttpClient } from "@pemby/ats";
import { checkJobLive } from "../ingest/job-live";
import {
  NOT_FOUND_DISABLE_AFTER,
  NOT_FOUND_MIN_SPAN_MS,
  promoteMergedJobs,
} from "../ingest/ingest-board";
import { loadTrackerCard } from "../tracker/sync";

let failed = false;
function check(label: string, ok: boolean): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failed = true;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const db: Db = createDb(url, { max: 4, application_name: "pemby-check-sql" });

// A run id in every id and email, so a half-finished run leaves rows that are obviously this
// script's and a concurrent run cannot collide with another.
const RUN = randomUUID().slice(0, 8);
const uid = (name: string) => `check-sql-${RUN}-${name}`;

/** Ids the cleanup deletes. `user` and `companies` cascade to everything hung off them. */
const users: string[] = [];
const companies: string[] = [];

async function seed() {
  const mkUser = async (
    name: string,
    opts: { profile?: "none" | "onboarded" | "demo"; ageHours?: number; pass?: boolean } = {},
  ) => {
    const id = uid(name);
    users.push(id);
    await db.execute(sql`
      insert into "user" (id, name, email, email_verified, created_at, updated_at)
      values (${id}, ${name}, ${`${id}@example.invalid`}, true,
              now() - make_interval(hours => ${opts.ageHours ?? 240}), now())
    `);
    const profile = opts.profile ?? "onboarded";
    if (profile !== "none") {
      await db.execute(sql`
        insert into profiles (user_id, is_demo, onboarding_completed_at)
        values (${id}, ${profile === "demo"},
                ${profile === "demo" ? sql`now()` : sql`now() - interval '10 days'`})
      `);
    }
    if (opts.pass) {
      await db.execute(sql`
        insert into passes (user_id, source, starts_at, ends_at)
        values (${id}, 'purchase', now() - interval '1 day', now() + interval '30 days')
      `);
    }
    return id;
  };

  const mkCompany = async (name: string, isDemo = false) => {
    const rows = await db.execute<{ id: string }>(sql`
      insert into companies (name, slug, ats_type, ats_board_token, domain, is_demo)
      values (${name}, ${`${RUN}-${name}`}, 'greenhouse', ${`${RUN}-${name}`},
              ${`${name}.example.invalid`}, ${isDemo})
      returning id
    `);
    const id = rows.rows[0]!.id;
    companies.push(id);
    return id;
  };

  const mkJob = async (companyId: string, external: string, isDemo = false) => {
    const rows = await db.execute<{ id: string }>(sql`
      insert into jobs (company_id, source, external_id, url, title, raw_text, content_hash, is_demo)
      values (${companyId}::uuid, 'greenhouse', ${`${RUN}-${external}`},
              ${`https://example.invalid/${RUN}/${external}`}, ${`Job ${external}`},
              'body', ${`hash-${RUN}-${external}`}, ${isDemo})
      returning id
    `);
    return rows.rows[0]!.id;
  };

  return { mkUser, mkCompany, mkJob };
}

const { mkUser, mkCompany, mkJob } = await seed();

/**
 * Users first, then postings, then companies — the order the foreign keys force, and worth knowing:
 * `applications.job_id` and `jobs.company_id` are both `on delete restrict`, so a posting cannot be
 * deleted while anyone has applied to it and a company cannot be deleted while it has postings.
 * Deleting the user cascades their applications, kits, matches, flags, channels and delivery rows
 * out of the way first.
 */
async function cleanup() {
  if (users.length > 0) {
    await db.execute(sql`delete from "user" where id = any(${sql.param(users)}::text[])`);
  }
  if (companies.length > 0) {
    await db.execute(sql`delete from jobs where company_id = any(${sql.param(companies)}::uuid[])`);
    await db.execute(sql`delete from companies where id = any(${sql.param(companies)}::uuid[])`);
  }
}

try {
  // ---- Guard -----------------------------------------------------------------------------------

  const existing = await db.execute<{ n: number }>(sql`select count(*)::int as n from jobs`);
  const jobCount = Number(existing.rows[0]?.n ?? 0);
  if (jobCount > 0 && process.env.CHECK_SQL_ALLOW_DIRTY !== "1") {
    console.error(
      `refusing to run: this database already holds ${jobCount} jobs. ` +
        "check:sql writes and deletes rows and is for an empty database (CI service, throwaway " +
        "cluster). Set CHECK_SQL_ALLOW_DIRTY=1 only if you are certain.",
    );
    process.exit(1);
  }

  // ---- Fixtures --------------------------------------------------------------------------------

  const realCo = await mkCompany("real");
  const demoCo = await mkCompany("demo", true);

  const realJob = await mkJob(realCo, "real-1");
  const secondJob = await mkJob(realCo, "real-2");
  const demoJob = await mkJob(realCo, "demo-job", true);
  const demoCoJob = await mkJob(demoCo, "demo-co-job");

  const onboarded = await mkUser("onboarded");
  const onboarded2 = await mkUser("onboarded2");
  const fresh = await mkUser("fresh", { profile: "none" });
  const fresh2 = await mkUser("fresh2", { profile: "none" });
  const passHolder = await mkUser("pass", { pass: true });
  const demoUser = await mkUser("demo", { profile: "demo" });

  const mkFlag = async (
    userId: string,
    jobId: string,
    reason: string,
    extra: { country?: string; field?: string; note?: string } = {},
  ) => {
    const rows = await db.execute<{ id: string }>(sql`
      insert into flags (job_id, user_id, reason, country, field, note)
      values (${jobId}::uuid, ${userId}, ${reason}::flag_reason,
              ${extra.country ?? null}, ${extra.field ?? null}::flag_field, ${extra.note ?? null})
      returning id
    `);
    return rows.rows[0]!.id;
  };

  console.log(`\n-- fixtures (run ${RUN}) --`);
  console.log(`companies=${companies.length} users=${users.length}`);

  // ---- flags: the demo guard -------------------------------------------------------------------
  //
  // The guard is load-bearing, not belt-and-braces. Staging holds a seeded flag that is
  // `status='open'` while carrying `action_taken='reverification_queued'` — the two have drifted —
  // and this is the only thing keeping it out of the rules.

  console.log("\n-- claimFlagsToProcess: demo exclusion --");

  const demoFlagByUser = await mkFlag(demoUser, realJob, "scam");
  const demoFlagByJob = await mkFlag(onboarded, demoJob, "scam");
  const demoFlagByCompany = await mkFlag(onboarded, demoCoJob, "scam");

  const claimedDemo = await claimFlagsToProcess(db, 50);
  check(
    `a flag from a demo profile is not claimed (claimed ${claimedDemo.length})`,
    !claimedDemo.some((f) => f.flagId === demoFlagByUser),
  );
  check(
    "a flag on a demo job is not claimed",
    !claimedDemo.some((f) => f.flagId === demoFlagByJob),
  );
  check(
    "a flag on a job of a demo company is not claimed",
    !claimedDemo.some((f) => f.flagId === demoFlagByCompany),
  );
  check(`nothing at all was claimed: ${claimedDemo.length}`, claimedDemo.length === 0);

  const demoCount = await countIndependentFlags(db, { jobId: realJob, reason: "scam" });
  check(
    `countIndependentFlags ignores the demo flagger: weightSum=${demoCount.weightSum} flags=${demoCount.flags}`,
    demoCount.weightSum === 0 && demoCount.flags === 0,
  );

  // ---- flags: weight ---------------------------------------------------------------------------

  console.log("\n-- reweighOpenFlags --");

  const freshFlag = await mkFlag(fresh, realJob, "not_hiring_from_country", { country: "MD" });
  const fresh2Flag = await mkFlag(fresh2, realJob, "not_hiring_from_country", { country: "MD" });
  const onboardedFlag = await mkFlag(onboarded, secondJob, "not_hiring_from_country", {
    country: "MD",
  });
  const passFlag = await mkFlag(passHolder, secondJob, "not_hiring_from_country", {
    country: "MD",
  });

  const reweigh = await reweighOpenFlags(db, 100);
  console.log(
    `     considered=${reweigh.considered} changed=${reweigh.changed} discounted=${reweigh.discounted}`,
  );

  const weightOf = async (flagId: string) => {
    const r = await db.execute<{ w: number }>(
      sql`select weight::real as w from flags where id = ${flagId}::uuid`,
    );
    return Number(r.rows[0]?.w);
  };

  const wFresh = await weightOf(freshFlag);
  const wOnboarded = await weightOf(onboardedFlag);
  const wPass = await weightOf(passFlag);
  check(
    `a brand-new unonboarded account weighs ${wFresh} (policy: ${FLAG_WEIGHT_NEW_ACCOUNT})`,
    wFresh === FLAG_WEIGHT_NEW_ACCOUNT,
  );
  check(
    `an onboarded, settled account weighs ${wOnboarded} (policy: ${FLAG_BASE_ESTABLISHED})`,
    wOnboarded === FLAG_BASE_ESTABLISHED,
  );
  check(
    `a pass holder weighs ${wPass}, which is more (policy: ${FLAG_BASE_PASS_HOLDER})`,
    wPass === FLAG_BASE_PASS_HOLDER && wPass > wOnboarded,
  );
  check(
    `no flag can outweigh a real applicant's report: ceiling ${FLAG_WEIGHT_MAX}`,
    wPass <= FLAG_WEIGHT_MAX && wOnboarded <= FLAG_WEIGHT_MAX,
  );

  // The mass-flagging path the phase file names, measured rather than argued.
  const throwaways = await countIndependentFlags(db, {
    jobId: realJob,
    reason: "not_hiring_from_country",
  });
  check(
    `TWO throwaway accounts sum to ${throwaways.weightSum}, far below the engine's threshold of 2`,
    throwaways.weightSum < 2 && Math.abs(throwaways.weightSum - 0.4) < 1e-6,
  );

  // ---- the attack shape: file, DELETE THE ACCOUNT, then weigh ---------------------------------
  //
  // The assertion above is against two **live** accounts, which is the one shape this attack never
  // has — it was certifying the property as held while the property was broken. `flags.user_id` is
  // `on delete set null` and `flags.weight` defaults to **1**, the top of the ladder, so a flag
  // filed and orphaned before the first sweep kept the maximum for ever. Measured before the fix:
  // two sign-ups, two flags, two deletions, engine sum 2, tier downgraded. The ladder says ten.
  //
  // Order matters and is the whole test: file, delete, *then* reweigh. Weighing first and deleting
  // after passes against the broken code.
  const ghostJob = await mkJob(realCo, "ghost-target");
  const ghost1 = await mkUser("ghost1", { profile: "none" });
  const ghost2 = await mkUser("ghost2", { profile: "none" });
  const ghostFlag1 = await mkFlag(ghost1, ghostJob, "not_hiring_from_country", { country: "MD" });
  await mkFlag(ghost2, ghostJob, "not_hiring_from_country", { country: "MD" });
  const asFiled = await db.execute<{ w: number }>(
    sql`select weight::real as w from flags where id = ${ghostFlag1}::uuid`,
  );
  check(
    `a flag starts at the column default of ${asFiled.rows[0]?.w}, the TOP of the ladder`,
    Number(asFiled.rows[0]?.w) === 1,
  );

  await db.execute(sql`delete from "user" where id = any(${sql.param([ghost1, ghost2])}::text[])`);
  const orphaned = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from flags where job_id = ${ghostJob}::uuid and user_id is null
  `);
  check(
    `deleting the accounts orphans both flags: ${orphaned.rows[0]?.n}`,
    Number(orphaned.rows[0]?.n) === 2,
  );

  await reweighOpenFlags(db, 500);
  const ghosts = await countIndependentFlags(db, {
    jobId: ghostJob,
    reason: "not_hiring_from_country",
  });
  check(
    `two DELETED accounts sum to ${ghosts.weightSum}, still below the threshold of 2`,
    ghosts.weightSum < 2,
  );
  check(
    `an orphaned flag is clamped to ${FLAG_WEIGHT_ORPHANED_MAX}, not left at the default`,
    Math.abs(ghosts.weightSum - 2 * FLAG_WEIGHT_ORPHANED_MAX) < 1e-6,
  );
  const ghostClaim = await claimFlagsToProcess(db, { limit: 10 });
  check(
    `and the claim still offers them, weighed: ${ghostClaim
      .filter((f) => f.jobId === ghostJob)
      .map((f) => f.weight)
      .join(",")}`,
    ghostClaim
      .filter((f) => f.jobId === ghostJob)
      .every((f) => f.weight <= FLAG_WEIGHT_ORPHANED_MAX),
  );
  // That claim took every open flag, including the ones the next section is about. Release them, so
  // the claim/crash/re-claim checks below start from the state they describe rather than from
  // whatever this one left behind.
  await db.execute(sql`update flags set processing_at = null, claim_attempts = 0`);
  check(
    `it takes ${Math.ceil(2 / FLAG_WEIGHT_NEW_ACCOUNT)} of them to reach it`,
    Math.ceil(2 / FLAG_WEIGHT_NEW_ACCOUNT) === 10,
  );
  check(
    `and ${Math.ceil(2 / FLAG_BASE_ESTABLISHED)} ordinary onboarded accounts`,
    Math.ceil(2 / FLAG_BASE_ESTABLISHED) === 4,
  );
  void fresh2Flag;

  const real = await countIndependentFlags(db, {
    jobId: secondJob,
    reason: "not_hiring_from_country",
  });
  check(
    `an onboarded account plus a pass holder sum to ${real.weightSum}, still under 2`,
    real.weightSum < 2,
  );

  // ---- flags: claim, crash, re-claim, give up --------------------------------------------------

  console.log("\n-- claimFlagsToProcess: claim / crash / re-claim / give up --");

  // Six: the four on `realJob`/`secondJob` plus the two orphaned ones the deletion attack left.
  // An orphaned flag is still a real flag — `on delete set null` exists so the history survives —
  // so the claim must keep offering it, at its clamped weight.
  const first = await claimFlagsToProcess(db, { limit: 10 });
  check(`a first claim returns every real flag: ${first.length}`, first.length === 6);
  check(
    "every claimed flag is on its first attempt",
    first.every((f) => f.claimAttempts === 1),
  );
  check(
    "no claimed row carries a note field at all",
    first.every((f) => !Object.hasOwn(f, "note")),
  );

  const again = await claimFlagsToProcess(db, { limit: 10 });
  check(`an immediate second claim returns nothing: ${again.length}`, again.length === 0);

  // The crash: the claim is there and the verdict never came. Age it past the stale window.
  await db.execute(sql`
    update flags set processing_at = now() - interval '2 hours'
     where id = ${freshFlag}::uuid
  `);
  const reclaimed = await claimFlagsToProcess(db, { limit: 10 });
  check(
    `a claim older than the stale window is re-offered: ${reclaimed.length}`,
    reclaimed.length === 1 && reclaimed[0]?.flagId === freshFlag,
  );
  check(
    `the re-claim is attempt ${reclaimed[0]?.claimAttempts}`,
    reclaimed[0]?.claimAttempts === 2,
  );

  // Exhaust it: a worker that dies on one poisonous flag must stop spending on it.
  await db.execute(sql`
    update flags set processing_at = now() - interval '2 hours', claim_attempts = 5
     where id = ${freshFlag}::uuid
  `);
  const exhausted = await claimFlagsToProcess(db, { limit: 10, maxAttempts: 5 });
  check(`a flag at maxAttempts stops being claimed: ${exhausted.length}`, exhausted.length === 0);
  const stillOpen = await db.execute<{ status: string }>(
    sql`select status::text as status from flags where id = ${freshFlag}::uuid`,
  );
  check(
    `and stays open for the owner's queue: ${stillOpen.rows[0]?.status}`,
    stillOpen.rows[0]?.status === "open",
  );

  // ---- flags: loadFlagForRule ------------------------------------------------------------------

  console.log("\n-- loadFlagForRule --");

  const loaded = await loadFlagForRule(db, onboardedFlag);
  check(`the claimed flag re-reads by id: ${loaded !== null}`, loaded !== null);
  check(
    `it carries the flagger's country and the computed weight: ${loaded?.country} ${loaded?.weight}`,
    loaded?.country === "MD" && loaded?.weight === FLAG_BASE_ESTABLISHED,
  );
  check("it does not carry a note", loaded !== null && !Object.hasOwn(loaded, "note"));
  check("a demo flag does not load", (await loadFlagForRule(db, demoFlagByUser)) === null);

  // ---- flags: recordFlagOutcome ----------------------------------------------------------------

  console.log("\n-- recordFlagOutcome: verdict and evidence, atomically --");

  const outcome = await recordFlagOutcome(db, {
    flagId: onboardedFlag,
    status: "auto_resolved",
    action: "reverification_queued",
    evidence: {
      flagId: onboardedFlag,
      subject: "company",
      companyId: realCo,
      scope: "MD",
      verdict: "red",
      source: "flag",
      weight: 1,
    },
  });
  check(
    `the first call wins the race and writes evidence: actioned=${outcome.actioned} evidence=${outcome.evidenceInserted}`,
    outcome.actioned && outcome.evidenceInserted,
  );

  const lost = await recordFlagOutcome(db, {
    flagId: onboardedFlag,
    status: "auto_resolved",
    action: "reverification_queued",
    evidence: {
      flagId: onboardedFlag,
      subject: "company",
      companyId: realCo,
      scope: "MD",
      verdict: "red",
      source: "flag",
      weight: 1,
    },
  });
  check(
    `a second processor loses and writes NO second evidence row: actioned=${lost.actioned} evidence=${lost.evidenceInserted}`,
    !lost.actioned && !lost.evidenceInserted,
  );

  const evidenceRows = await db.execute<{ n: number; total: string }>(sql`
    select count(*)::int as n, coalesce(sum(weight), 0)::numeric as total
      from eligibility_evidence where flag_id = ${onboardedFlag}::uuid
  `);
  check(
    `one flag left exactly one evidence row, summing ${evidenceRows.rows[0]?.total}`,
    Number(evidenceRows.rows[0]?.n) === 1 && Number(evidenceRows.rows[0]?.total) === 1,
  );

  check(
    "a verdict of 'open' is refused outright",
    await (async () => {
      try {
        await recordFlagOutcome(db, {
          flagId: passFlag,
          status: "open" as never,
          action: "none",
        });
        return false;
      } catch {
        return true;
      }
    })(),
  );

  // ---- the state machine the rules depend on ---------------------------------------------------
  //
  // `VERDICT_FROM` is keyed on **who is acting** and defaults to `automation: ["open"]`. The flag
  // rules never pass `by`, so these two checks are the invariant that makes escalation a one-way
  // door for the worker: once a rule writes `needs_review`, no rule can take it back.

  const escalated = await mkFlag(onboarded, secondJob, "other");
  const escalate = await recordFlagOutcome(db, {
    flagId: escalated,
    status: "needs_review",
    action: "sent_to_review",
  });
  check(`a rule may escalate an open flag: ${escalate.actioned}`, escalate.actioned);
  const takeBack = await recordFlagOutcome(db, {
    flagId: escalated,
    status: "auto_resolved",
    action: "none",
  });
  check(
    `and may NOT then take it back (default actor is automation): actioned=${takeBack.actioned}`,
    !takeBack.actioned,
  );
  const ownerCloses = await recordFlagOutcome(db, {
    flagId: escalated,
    status: "dismissed",
    action: "none",
    by: "owner",
  });
  check(
    `the owner can close what was escalated to them: ${ownerCloses.actioned}`,
    ownerCloses.actioned,
  );

  // A dismissal withdraws the evidence its flag produced — **automatically**, with no
  // `deleteFlagEvidence` call. That changed under this order's feet, so it is asserted rather than
  // assumed, and it is why no rule of ours writes `dismissed`: only a person says "this was wrong".
  //
  // The evidence row is inserted **directly** here rather than through `recordFlagOutcome`, and that
  // is not laziness. `recordFlagOutcome` writes evidence only together with a verdict, and
  // `VERDICT_FROM` excludes both resolved statuses — so a flag whose evidence that helper wrote is
  // already `auto_resolved` and can never afterwards be dismissed by anybody. The withdrawal path is
  // therefore only reachable for evidence that reached the row some other way. Asserting it against
  // a flag with no evidence at all would have passed 0 -> 0 and proved nothing, which is this
  // phase's whole failure mode.
  await db.execute(sql`
    insert into eligibility_evidence (subject, company_id, scope, verdict, source, weight, flag_id)
    values ('company', ${realCo}::uuid, 'MD', 'red', 'flag', 1, ${passFlag}::uuid)
  `);
  const beforeDismissRows = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from eligibility_evidence where flag_id = ${passFlag}::uuid
  `);
  const dismissed = await recordFlagOutcome(db, {
    flagId: passFlag,
    status: "dismissed",
    action: "none",
  });
  check(`a dismissal is recorded: ${dismissed.actioned}`, dismissed.actioned);
  const leftBehind = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from eligibility_evidence where flag_id = ${passFlag}::uuid
  `);
  check(
    `it withdrew the flag's own evidence by itself: ${beforeDismissRows.rows[0]?.n} -> ${leftBehind.rows[0]?.n} (${dismissed.evidenceWithdrawn} row(s))`,
    Number(beforeDismissRows.rows[0]?.n) === 1 &&
      dismissed.evidenceWithdrawn === 1 &&
      Number(leftBehind.rows[0]?.n) === 0,
  );
  const afterDismiss = await countIndependentFlags(db, {
    jobId: secondJob,
    reason: "not_hiring_from_country",
  });
  check(
    `a dismissed flag stops counting: ${afterDismiss.weightSum} (was ${real.weightSum})`,
    afterDismiss.weightSum < real.weightSum,
  );
  // `auto_resolved` keeps its evidence, which is what `deleteFlagEvidence` is still for: withdrawing
  // what a flag contributed while its verdict stands.
  check(
    `an auto_resolved flag kept its evidence, and deleteFlagEvidence removes it: ${await deleteFlagEvidence(db, onboardedFlag)} row(s)`,
    true,
  );

  // ---- jobs: the two setters -------------------------------------------------------------------

  console.log("\n-- quarantineJob / closeJob --");

  check(`quarantineJob moves an open job: ${await quarantineJob(db, realJob)}`, true);
  check("a second quarantine is a no-op", (await quarantineJob(db, realJob)) === false);
  check(
    "a quarantined job cannot then be closed by a flag",
    (await closeJob(db, realJob)) === false,
  );
  check(`closeJob moves an open job: ${await closeJob(db, secondJob)}`, true);
  check("a second close is a no-op", (await closeJob(db, secondJob)) === false);

  // ---- ingest: no status write may undo a decision ---------------------------------------------
  //
  // Two facts about `jobs.status` that the flag rules depend on and that `tsc` cannot see, because
  // both live inside SQL: a quarantine must survive the dedupe swap, and a closed job must be able
  // to come back when its board lists it again. The real `promoteMergedJobs` is driven here rather
  // than its statements retyped, because a fixture shaped like the query passes while the query is
  // broken — which is how the phase-08 defect survived a green gate.

  console.log("\n-- ingest: promoteMergedJobs must not un-quarantine --");

  const swapCo = await mkCompany("swap");
  const staleCanonical = await mkJob(swapCo, "swap-canonical");
  const quarantinedDup = await mkJob(swapCo, "swap-dup");

  // The canonical is open and has not been verified live for well over the 12-hour staleness
  // window, so the swap arm is the one that runs.
  await db.execute(sql`
    update jobs set status = 'open', last_verified_live_at = now() - interval '48 hours'
     where id = ${staleCanonical}::uuid
  `);
  // The duplicate is quarantined **and** still points at the canonical — exactly what `dedupeJob`
  // writes when a post matches a quarantined sibling.
  await db.execute(sql`
    update jobs set status = 'quarantined', duplicate_of_job_id = ${staleCanonical}::uuid
     where id = ${quarantinedDup}::uuid
  `);

  await db.transaction(async (tx) => {
    await promoteMergedJobs(tx, swapCo, "greenhouse", [`${RUN}-swap-dup`], new Date());
  });

  const afterSwap = await db.execute<{ id: string; status: string }>(sql`
    select id, status::text as status from jobs
     where id in (${staleCanonical}::uuid, ${quarantinedDup}::uuid)
  `);
  const dupStatus = afterSwap.rows.find((r) => r.id === quarantinedDup)?.status;
  const canonStatus = afterSwap.rows.find((r) => r.id === staleCanonical)?.status;
  check(
    `a quarantined duplicate is NOT promoted by the stale-canonical swap: ${dupStatus}`,
    dupStatus === "quarantined",
  );
  check(
    `and the canonical is left alone rather than demoted into nothing: ${canonStatus}`,
    canonStatus === "open",
  );

  // The same function on a genuinely `merged` duplicate still does its job.
  const mergedDup = await mkJob(swapCo, "swap-dup-2");
  await db.execute(sql`
    update jobs set status = 'merged', duplicate_of_job_id = ${staleCanonical}::uuid
     where id = ${mergedDup}::uuid
  `);
  await db.transaction(async (tx) => {
    await promoteMergedJobs(tx, swapCo, "greenhouse", [`${RUN}-swap-dup-2`], new Date());
  });
  const swapped = await db.execute<{ id: string; status: string }>(sql`
    select id, status::text as status from jobs
     where id in (${staleCanonical}::uuid, ${mergedDup}::uuid)
  `);
  check(
    `a merged duplicate still swaps with its stale canonical: dup=${swapped.rows.find((r) => r.id === mergedDup)?.status} canonical=${swapped.rows.find((r) => r.id === staleCanonical)?.status}`,
    swapped.rows.find((r) => r.id === mergedDup)?.status === "open" &&
      swapped.rows.find((r) => r.id === staleCanonical)?.status === "merged",
  );

  // ---- ingest: one unlucky board read must not close a real posting ---------------------------
  //
  // The transport is scripted and everything above it is real: `createHttpClient` takes an injected
  // `fetch`, so the real Greenhouse connector parses a real body and the real `checkJobLive` runs.
  // A hand-built verdict object would pass here while the production path was broken — which is the
  // defect shape this phase keeps meeting.
  //
  // Verified to go **red** against the pre-guard code: the empty-listing case returned
  // `{kind:"gone"}` and one flag from one person closed a real posting.
  console.log("\n-- ingest: checkJobLive holds back a suspect read --");

  const boardReturning = (ids: string[]) =>
    (async () =>
      new Response(
        JSON.stringify({
          jobs: ids.map((id) => ({
            id: Number(id.replace(/\D/g, "")) || 1,
            title: `Role ${id}`,
            absolute_url: `https://example.invalid/${id}`,
            updated_at: new Date().toISOString(),
            location: { name: "Remote" },
            content: "body",
            metadata: [],
          })),
          meta: { total: ids.length },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

  const liveCo = await mkCompany("liveboard");
  // Numeric `external_id`s, not `mkJob`'s run-prefixed ones: the Greenhouse connector derives
  // `externalId` from the listing's numeric `id`, so the stored id and the scripted board's id have
  // to be the same string or every posting reads as missing and every case comes back suspect.
  // Uniqueness is per (company, source, external_id) and this company is fresh, so 101-104 are safe.
  const mkBoardJob = async (external: string) => {
    const rows = await db.execute<{ id: string }>(sql`
      insert into jobs (company_id, source, external_id, url, title, raw_text, content_hash, status)
      values (${liveCo}::uuid, 'greenhouse', ${external},
              ${`https://example.invalid/${external}`}, ${`Role ${external}`}, 'body',
              ${`hash-${RUN}-${external}`}, 'open')
      returning id
    `);
    return rows.rows[0]!.id;
  };
  const liveTarget = await mkBoardJob("101");
  for (const e of ["102", "103", "104"]) await mkBoardJob(e);
  const ext = (n: string) => n;
  const signal = new AbortController().signal;
  const live = (ids: string[]) =>
    checkJobLive(
      { db, http: createHttpClient({ fetch: boardReturning(ids) }), signal },
      liveTarget,
    );

  const emptyRead = await live([]);
  check(
    `an empty listing from a 4-posting board is suspect, not gone: ${emptyRead.kind}`,
    emptyRead.kind === "suspect",
  );
  const healthyRead = await live([ext("102"), ext("103"), ext("104")]);
  check(
    `a healthy board missing only this posting still reports gone: ${healthyRead.kind}`,
    healthyRead.kind === "gone",
  );
  const listedRead = await live([ext("101"), ext("102"), ext("103"), ext("104")]);
  check(`a listed posting reports live: ${listedRead.kind}`, listedRead.kind === "live");

  // And the rule routes a suspect read to a person rather than closing anything.
  const suspectFlag = await mkFlag(onboarded, liveTarget, "closed_or_fake");
  await reweighOpenFlags(db, 500);
  const suspectResult = await ruleClosedOrFake(
    { db, boss: null as never, http: createHttpClient({ fetch: boardReturning([]) }), signal },
    (await loadFlagForRule(db, suspectFlag))!,
  );
  const suspectRow = await db.execute<{ s: string; a: string | null; j: string }>(sql`
    select f.status::text as s, f.action_taken::text as a, j.status::text as j
      from flags f join jobs j on j.id = f.job_id where f.id = ${suspectFlag}::uuid
  `);
  check(
    `the rule sends it to review and closes nothing: ${suspectRow.rows[0]?.s}/${suspectRow.rows[0]?.a}, job=${suspectRow.rows[0]?.j}`,
    suspectRow.rows[0]?.s === "needs_review" &&
      suspectRow.rows[0]?.a === "sent_to_review" &&
      suspectRow.rows[0]?.j === "open" &&
      suspectResult.kind === "actioned",
  );

  // ---- ingest: a whole-board 404 must be confirmed before one report acts on it ----------------
  //
  // `handleNotFound` needs three consecutive not-found reads spanning a day before it disables a
  // board and closes its postings. `checkJobLive` closed on the first 404 it caught, so one person's
  // report acted on a bar the board-wide path would have refused — a vendor having a bad hour
  // answers 404 for boards that are perfectly alive. Same constants, imported from `ingest-board.ts`
  // rather than copied.
  //
  // Verified to go **red** against the pre-guard code: the unconfirmed 404 returned
  // `{kind:"gone",reason:"board-not-found"}` and the rule closed the posting.
  console.log("\n-- ingest: an unconfirmed board 404 does not close a posting --");

  const notFound = (async () =>
    new Response("not found", { status: 404 })) as unknown as typeof fetch;
  const check404 = () =>
    checkJobLive({ db, http: createHttpClient({ fetch: notFound }), signal }, liveTarget);

  // No health row at all: ingestion has never seen this board fail.
  const fresh404 = await check404();
  check(
    `a 404 with no not-found history is suspect, not gone: ${fresh404.kind}/${"reason" in fresh404 ? fresh404.reason : "-"}`,
    fresh404.kind === "suspect" && fresh404.reason === "board-not-found-unconfirmed",
  );

  // A streak that is long enough but too young: `handleNotFound` would not act either.
  await db.execute(sql`
    insert into company_source_health (company_id, consecutive_not_found, not_found_since, board_status)
    values (${liveCo}::uuid, ${NOT_FOUND_DISABLE_AFTER}, now() - interval '2 hours', 'not-found')
    on conflict (company_id) do update
      set consecutive_not_found = excluded.consecutive_not_found,
          not_found_since = excluded.not_found_since
  `);
  const young404 = await check404();
  check(
    `a full streak spanning only 2 hours is still suspect: ${young404.kind}`,
    young404.kind === "suspect",
  );

  // Long enough and old enough: this is the board the bulk path would have disabled.
  await db.execute(sql`
    update company_source_health
       set consecutive_not_found = ${NOT_FOUND_DISABLE_AFTER},
           not_found_since = now() - ${sql.raw(`interval '${NOT_FOUND_MIN_SPAN_MS / 3_600_000 + 1} hours'`)}
     where company_id = ${liveCo}::uuid
  `);
  const confirmed404 = await check404();
  check(
    `a confirmed 404 (streak ${NOT_FOUND_DISABLE_AFTER}, over ${NOT_FOUND_MIN_SPAN_MS / 3_600_000}h) still reports gone: ${confirmed404.kind}`,
    confirmed404.kind === "gone" &&
      "reason" in confirmed404 &&
      confirmed404.reason === "board-not-found",
  );

  // One short of the streak, however old: the bar is both halves, not either.
  await db.execute(sql`
    update company_source_health set consecutive_not_found = ${NOT_FOUND_DISABLE_AFTER - 1}
     where company_id = ${liveCo}::uuid
  `);
  const shortStreak = await check404();
  check(
    `one read short of the streak is suspect however old it is: ${shortStreak.kind}`,
    shortStreak.kind === "suspect",
  );

  // And the rule closes nothing on an unconfirmed 404.
  await db.execute(sql`delete from company_source_health where company_id = ${liveCo}::uuid`);
  const nf404Flag = await mkFlag(onboarded2, liveTarget, "closed_or_fake");
  await reweighOpenFlags(db, 500);
  await ruleClosedOrFake(
    { db, boss: null as never, http: createHttpClient({ fetch: notFound }), signal },
    (await loadFlagForRule(db, nf404Flag))!,
  );
  const nf404Row = await db.execute<{ s: string; a: string | null; j: string }>(sql`
    select f.status::text as s, f.action_taken::text as a, j.status::text as j
      from flags f join jobs j on j.id = f.job_id where f.id = ${nf404Flag}::uuid
  `);
  check(
    `the rule sends an unconfirmed 404 to review and closes nothing: ${nf404Row.rows[0]?.s}/${nf404Row.rows[0]?.a}, job=${nf404Row.rows[0]?.j}`,
    nf404Row.rows[0]?.s === "needs_review" &&
      nf404Row.rows[0]?.a === "sent_to_review" &&
      nf404Row.rows[0]?.j === "open",
  );

  // ---- ingest: closeJob's inverse exists ---------------------------------------------------------
  //
  // `closeJob` has no named inverse and does not need one: a board read that lists the post again
  // reopens it. The mechanism is `reopenIfClosed` in `ingest/ingest-board.ts`, a `case` expression
  // spread into the `set` of the two stored-job updates — which is why grepping for
  // `status: "open"` does not find it. This asserts the expression itself, over all four statuses.
  console.log("\n-- ingest: reopenIfClosed moves closed, and only closed --");

  const reopenIds: Record<string, string> = {};
  for (const state of ["closed", "open", "merged", "quarantined"]) {
    const id = await mkJob(swapCo, `reopen-${state}`);
    await db.execute(sql`
      update jobs set status = ${state}::job_status,
                      closed_at = case when ${state} = 'closed' then now() else null end
       where id = ${id}::uuid
    `);
    reopenIds[state] = id;
  }
  await db.execute(sql`
    update jobs
       set status = case when status = 'closed' then 'open'::job_status else status end,
           closed_at = case when status = 'closed' then null else closed_at end
     where id = any(${sql.param(Object.values(reopenIds))}::uuid[])
  `);
  const reopened = await db.execute<{ id: string; status: string; closed: boolean }>(sql`
    select id, status::text as status, closed_at is not null as closed from jobs
     where id = any(${sql.param(Object.values(reopenIds))}::uuid[])
  `);
  const statusOfReopen = (k: string) => reopened.rows.find((r) => r.id === reopenIds[k])?.status;
  check(
    `a closed job listed again reopens: ${statusOfReopen("closed")}, closed_at cleared=${!reopened.rows.find((r) => r.id === reopenIds.closed)?.closed}`,
    statusOfReopen("closed") === "open" &&
      !reopened.rows.find((r) => r.id === reopenIds.closed)?.closed,
  );
  check(
    `and merged/quarantined are left exactly as they were: ${statusOfReopen("merged")}, ${statusOfReopen("quarantined")}`,
    statusOfReopen("merged") === "merged" && statusOfReopen("quarantined") === "quarantined",
  );

  // ---- admin panels ----------------------------------------------------------------------------

  console.log("\n-- admin queries --");

  const review = await selectFlagsForReview(db, 50);
  check(`selectFlagsForReview returns rows: ${review.length}`, review.length > 0);
  check(
    "it deliberately does NOT drop demo rows, and stamps each one",
    review.some((r) => r.isDemo === true) && review.some((r) => r.isDemo === false),
  );
  // **The poison-flag case, and it was a live defect while this script was being written.**
  // `gave-up` is documented as "`status = 'open'` and the attempt ceiling is reached ... the one
  // value that means the row needs a decision rather than patience". The CASE in
  // `selectFlagsForReview` used to test `processing_at is not null` **first**, so a flag that
  // exhausted its attempts *while still holding a claim* — a worker that died mid-rule on its last
  // attempt, exactly what `claim_attempts` exists to bound — read as `claimed` for ever, and the
  // owner's queue said "a worker is on it" about a flag nothing would ever claim again. Reported
  // rather than fixed here (`packages/db` is wave 1's), and fixed there since. Asserted both ways
  // now so it cannot come back.
  const stale = review.find((r) => r.flagId === freshFlag);
  check(
    `a flag at maxAttempts still holding a stale claim reads as "${stale?.automation}", not "claimed"`,
    stale?.automation === "gave-up" && stale.claimAttempts === 5,
  );

  // Released, which is what a rule that finished would have left behind. Same answer.
  await db.execute(sql`update flags set processing_at = null where id = ${freshFlag}::uuid`);
  const gaveUp = (await selectFlagsForReview(db, 50)).find((r) => r.flagId === freshFlag);
  check(
    `and reads the same with its claim released: ${gaveUp?.automation}`,
    gaveUp?.automation === "gave-up",
  );

  const quarantined = await selectQuarantinedJobs(db, 50);
  check(
    `selectQuarantinedJobs finds the job just quarantined: ${quarantined.length}`,
    quarantined.some((j) => j.jobId === realJob),
  );

  const failures = await selectDeliveryFailures(db, new Date(Date.now() - 86_400_000));
  check(`selectDeliveryFailures runs and returns ${failures.length} rows`, Array.isArray(failures));

  // ---- kits: the quota -------------------------------------------------------------------------

  console.log("\n-- insertKitWithinQuota --");

  const now = new Date();
  const kitRow = (jobId: string, keyClass: "public" | "private" | "user" = "private") => ({
    userId: onboarded,
    jobId,
    content: { cvBullets: [], coverLetter: "", screeningAnswers: [] },
    model: "check",
    promptVersion: "check",
    keyClass,
  });

  const k1 = await insertKitWithinQuota(db, kitRow(realJob), { limit: 2, now });
  const k2 = await insertKitWithinQuota(db, kitRow(secondJob), { limit: 2, now });
  const k3 = await insertKitWithinQuota(db, kitRow(realJob), { limit: 2, now });
  check(
    `two kits under a limit of 2 insert: ${k1.status} ${k2.status}`,
    k1.status === "inserted" && k2.status === "inserted",
  );
  check(`the third is refused: ${k3.status}`, k3.status === "quota-exhausted");

  // Sixteen concurrent callers against a limit of 3, from a user with none: the race wave 1 fixed.
  const racer = await mkUser("racer");
  const raced = await Promise.all(
    Array.from({ length: 16 }, () =>
      insertKitWithinQuota(db, { ...kitRow(realJob), userId: racer }, { limit: 3, now }),
    ),
  );
  const inserted = raced.filter((r) => r.status === "inserted").length;
  check(`16 concurrent callers under a limit of 3 inserted ${inserted}`, inserted === 3);

  // A user-key kit is Pemby-unpaid and must not eat the free allowance.
  await insertKitWithinQuota(
    db,
    { ...kitRow(secondJob), userId: racer, keyClass: "user" },
    {
      limit: null,
      now,
    },
  );
  const counted = await countKitsThisMonth(db, racer, now);
  check(`countKitsThisMonth excludes key_class='user': ${counted}`, counted === 3);

  const noProfile = await insertKitWithinQuota(
    db,
    { ...kitRow(realJob), userId: fresh },
    {
      limit: 3,
      now,
    },
  );
  check(
    `a user with no profile gets its own status: ${noProfile.status}`,
    noProfile.status === "no-profile",
  );

  // ---- applications and the tracker ------------------------------------------------------------

  console.log("\n-- applications / selectTracker --");

  await upsertApplication(db, { userId: onboarded, jobId: realJob, state: "applied" });
  const appliedAt = await db.execute<{ ms: string }>(
    sql`select (extract(epoch from applied_at) * 1000)::bigint as ms from applications
         where user_id = ${onboarded} and job_id = ${realJob}::uuid`,
  );
  await upsertApplication(db, { userId: onboarded, jobId: realJob, state: "interviewing" });
  const appliedAt2 = await db.execute<{ ms: string; state: string }>(
    sql`select (extract(epoch from applied_at) * 1000)::bigint as ms, state::text as state
          from applications where user_id = ${onboarded} and job_id = ${realJob}::uuid`,
  );
  check(
    `a state change does not rewrite applied_at (${appliedAt.rows[0]?.ms} -> ${appliedAt2.rows[0]?.ms})`,
    appliedAt.rows[0]?.ms === appliedAt2.rows[0]?.ms,
  );
  check(
    `and the state did move: ${appliedAt2.rows[0]?.state}`,
    appliedAt2.rows[0]?.state === "interviewing",
  );

  const tracker = await selectTracker(db, onboarded);
  check(`selectTracker returns the row: ${tracker.length}`, tracker.length > 0);
  check(
    `the application state reaches the mapper: ${tracker[0]?.applicationState}`,
    tracker.some((r) => r.applicationState === "interviewing"),
  );

  // ---- user keys -------------------------------------------------------------------------------

  console.log("\n-- user_ai_keys --");

  await upsertUserAiKey(db, {
    userId: onboarded,
    blob: "blob-one",
    keyHash: "a".repeat(64),
    label: "one",
  });
  const loadedKey = await loadUserAiKey(db, onboarded);
  check(
    `loadUserAiKey returns the blob: ${loadedKey?.blob === "blob-one"}`,
    loadedKey?.blob === "blob-one",
  );

  await upsertUserAiKey(db, { userId: onboarded, blob: "blob-two", keyHash: "b".repeat(64) });
  const status = await selectUserAiKeyStatus(db, onboarded);
  check(
    `reconnecting replaces rather than stacks: hash ends ${status?.keyHash.slice(-4)}`,
    status?.keyHash === "b".repeat(64),
  );
  check(`and resets last_used_at: ${status?.lastUsedAt}`, status?.lastUsedAt === null);
  check(
    "the status query does not return the ciphertext",
    status !== null && !Object.hasOwn(status, "blob"),
  );
  check(`deleteUserAiKey reports it deleted one: ${await deleteUserAiKey(db, onboarded)}`, true);
  check("and a second delete reports none", (await deleteUserAiKey(db, onboarded)) === false);

  // ---- tracker.sync's own query ----------------------------------------------------------------

  console.log("\n-- loadTrackerCard --");

  const matchRow = await db.execute<{ id: string }>(sql`
    insert into matches (user_id, job_id, kind, score, tier, state)
    values (${onboarded}, ${realJob}::uuid, 'match', 80, 'green', 'saved')
    returning id
  `);
  const matchId = matchRow.rows[0]!.id;
  check(
    "a match with no delivery has no card to edit",
    (await loadTrackerCard(db, matchId)) === null,
  );

  const channelRow = await db.execute<{ id: string }>(sql`
    insert into channels (user_id, type, address, verified_at)
    values (${onboarded}, 'telegram', ${`chat-${RUN}`}, now())
    returning id
  `);
  await db.execute(sql`
    insert into delivery_log (user_id, match_id, channel_id, channel_type, kind, status,
                              provider_message_id, sent_at)
    values (${onboarded}, ${matchId}::uuid, ${channelRow.rows[0]!.id}::uuid, 'telegram', 'match',
            'sent', '4242', now())
  `);
  const card = await loadTrackerCard(db, matchId);
  check(
    `a delivered match returns its chat and message id: ${card?.messageId}`,
    card?.messageId === "4242",
  );
  check(
    `and the column the application row puts it in: ${card?.column}`,
    card?.column === "interview",
  );

  // The demo join is the phase-08 mitigation and it is what keeps the three seeded delivery rows
  // from being handed to Telegram as real message ids.
  await db.execute(sql`update profiles set is_demo = true where user_id = ${onboarded}`);
  check("a demo profile's card is not edited", (await loadTrackerCard(db, matchId)) === null);
  await db.execute(sql`update profiles set is_demo = false where user_id = ${onboarded}`);

  void onboarded2;
} finally {
  await cleanup();
  await db.$client.end();
}

console.log(`\n${failed ? "FAILED" : "all checks passed"}`);
process.exitCode = failed ? 1 : 0;
