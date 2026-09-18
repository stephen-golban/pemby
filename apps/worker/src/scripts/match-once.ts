// Runs the matcher in-process, without pg-boss, for one profile or one job.
//
// Usage: pnpm --filter @pemby/worker match:once -- --user <id> | --profile <id> | --job <id> [--dry-run] [--include-unonboarded] [--job-limit N]
//
// --user                  fan one person's profile out over the open jobs (match.profile).
// --profile               the same, addressed by profile id instead of user id.
// --job                   fan one job out over every eligible user (match.job). This is the
//                         measurement the definition of done asks for: it prints users, pages and
//                         milliseconds per user.
// --dry-run               evaluate and count; write no `matches` rows, and retire none either.
// --include-unonboarded   include profiles that have not finished onboarding — the one being
//                         matched with --user/--profile, or the users a --job run fans out over.
//                         Off by default, as in the queue handler (PLAN D5), because a Brief needs
//                         a finished profile.
// --job-limit N           candidate jobs loaded for a profile run (50-5000); defaults to
//                         MATCH_PROFILE_JOB_LIMIT.
//
// **No model call happens here** (PLAN D18): the matcher is gates, a weighted score over embeddings
// another module wrote, and templated reasons. Nothing in `apps/worker/src/match/**` imports
// `@pemby/ai`, so this script cannot spend anything and needs no cap guard.
//
// Needs DATABASE_URL and the private config (PRIVATE_CONFIG_*, for the scoring weights). Prints
// ids, counts, scores and milliseconds only: never a job title, a profile field or a reason string.
//
// It also prints the gate notes the run's rows carried, by reason key: how often a gate let a job
// through and said honestly what the gap was, rather than dropping it.
//
// After the distribution it prints how many rows carried 1, 2 or 3 reason bullets, and one line per
// best pair: the components that scored, the ones that were not applicable, the ones missing, the
// evidence, the ceiling, and whether the ceiling or the job's own fit bound the score. That is the
// measurement the evidence rule in `scoring/score.ts` has to be checked against, and component
// names are public vocabulary — the private weights never appear.
import { loadScoringWeights } from "@pemby/core/private-config";
import { createDb } from "@pemby/db";

import {
  formatMatchJob,
  formatMatchProfile,
  matchOneJob,
  matchOneProfile,
  readMatchEnv,
  type MatchTally,
} from "../match";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error(`--${name} needs a value`);
    process.exit(2);
  }
  return value;
}

const userArg = flag("user");
const profileArg = flag("profile");
const jobArg = flag("job");
const dryRun = process.argv.includes("--dry-run");
const includeUnonboarded = process.argv.includes("--include-unonboarded");

const targets = [userArg, profileArg, jobArg].filter((v) => v !== undefined);
if (targets.length !== 1) {
  console.error(
    "usage: match:once -- --user <id> | --profile <id> | --job <id> [--dry-run] [--include-unonboarded] [--job-limit N]",
  );
  process.exit(2);
}

const env = readMatchEnv();
let jobLimit = env.profileJobLimit;
const jobLimitArg = flag("job-limit");
if (jobLimitArg !== undefined) {
  const value = Number(jobLimitArg);
  if (!Number.isInteger(value) || value < 50 || value > 5000) {
    console.error("--job-limit must be an integer from 50 to 5000");
    process.exit(2);
  }
  jobLimit = value;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

/** Quantiles and a coarse histogram of the scores that produced a row. Numbers only. */
function scoreDistribution(scores: readonly number[]): string[] {
  if (scores.length === 0) return ["  scores: none (no row written)"];
  const sorted = [...scores].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  // Ten buckets over 0-100; `matches.score` is stored on that scale.
  const buckets = new Array<number>(10).fill(0);
  for (const s of sorted) buckets[Math.min(9, Math.max(0, Math.floor(s / 10)))]! += 1;
  const histogram = buckets
    .map((n, i) => (n === 0 ? null : `${i * 10}-${i * 10 + 9}:${n}`))
    .filter((v): v is string => v !== null)
    .join(" ");
  return [
    `  scores: n=${sorted.length} min=${sorted[0]!.toFixed(1)} p25=${at(0.25).toFixed(1)} p50=${at(0.5).toFixed(1)} p75=${at(0.75).toFixed(1)} max=${sorted[sorted.length - 1]!.toFixed(1)} mean=${mean.toFixed(1)}`,
    `  histogram: ${histogram}`,
  ];
}

/**
 * What the run did with rows no live scorer stands behind: deleted (pure matcher output) and
 * withdrawn (kept whole because the person saved, applied, passed or was sent it).
 */
function retiredLine(retired: { deleted: number; withdrawn: number }): string {
  return `  retired: deleted=${retired.deleted} withdrawn=${retired.withdrawn}`;
}

/**
 * The run's best pairs, one line each: what scored, what was not applicable, what was missing, the
 * evidence and the ceiling, and which of the fit or the ceiling bound the score. Job ids, component
 * names and numbers only — no title, no profile field, no rendered reason.
 */
function topPairs(tally: MatchTally): string[] {
  if (tally.top.length === 0) return ["  top: none"];
  return tally.top.map((p) => {
    // The ceiling bound the score when the fit reached it; otherwise the job's own fit did, and no
    // amount of extra evidence would have raised it.
    const bound = p.fit >= p.ceiling - 0.05 ? "ceiling" : "fit";
    const list = (values: readonly string[]) => (values.length === 0 ? "-" : values.join(","));
    return [
      `  top job=${p.jobId} ${p.kind}${p.blocker ? `/${p.blocker}` : ""}`,
      `total=${p.total}`,
      `fit=${p.fit.toFixed(1)}`,
      `ceiling=${p.ceiling.toFixed(1)}`,
      `evidence=${p.evidence.toFixed(3)}`,
      `bound=${bound}`,
      `reasons=${p.reasonCount}`,
      `scored=${list(p.scored)}`,
      `n/a=${list(p.notApplicable)}`,
      `missing=${list(p.missing)}`,
    ].join(" ");
  });
}

/** How many rows carried 0, 1, 2 or 3 reason bullets — all rows, then matches alone. */
function reasonBulletCounts(tally: MatchTally): string {
  const histogram = (counts: readonly number[]) =>
    counts
      .map((n, bullets) => (n === 0 ? null : `${bullets}:${n}`))
      .filter((v): v is string => v !== null)
      .join(" ") || "none";
  return `  reason bullets: rows ${histogram(tally.bullets)} | matches ${histogram(tally.matchBullets)}`;
}

/**
 * Gate notes carried by the rows written, most common first. These are the labels the gates put on
 * a verdict they let through — a tolerated years shortfall, an unknown years figure — so the line
 * says how often the product told someone the truth about a gap instead of hiding the job. Reason
 * keys only, never a rendered sentence.
 */
function gateNoteBreakdown(tally: MatchTally): string {
  const entries = Object.entries(tally.gateNotes).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  if (entries.length === 0) return "  gate notes: none";
  return `  gate notes: ${entries.map(([key, n]) => `${key}=${n}`).join(" ")}`;
}

/** Near misses by blocker, most common first. Database spellings, which are public enum values. */
function blockerBreakdown(tally: MatchTally): string {
  const entries = Object.entries(tally.blockers).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  if (entries.length === 0) return "  blockers: none";
  return `  blockers: ${entries.map(([key, n]) => `${key}=${n}`).join(" ")}`;
}

const db = createDb(url, { max: 4, application_name: "pemby-match-once" });

let exitCode = 0;
try {
  // Loaded once and passed in, so a run makes exactly one private-config read.
  const weights = await loadScoringWeights();

  if (jobArg !== undefined) {
    const outcome = await matchOneJob({ db, weights, dryRun, includeUnonboarded }, jobArg);
    console.log(`match:once dryRun=${dryRun}`);
    console.log(formatMatchJob(jobArg, outcome));
    if (outcome.kind === "matched") {
      console.log(blockerBreakdown(outcome.tally));
      console.log(gateNoteBreakdown(outcome.tally));
      console.log(retiredLine(outcome.retired));
      for (const line of scoreDistribution(outcome.tally.scores)) console.log(line);
      console.log(reasonBulletCounts(outcome.tally));
      for (const line of topPairs(outcome.tally)) console.log(line);
    }
  } else {
    const id = userArg !== undefined ? { userId: userArg } : { profileId: profileArg! };
    const outcome = await matchOneProfile(
      { db, weights, jobLimit, dryRun, includeUnonboarded },
      id,
    );
    console.log(`match:once dryRun=${dryRun} jobLimit=${jobLimit}`);
    // `matchOneProfile` returns counts, not the row, so the id printed is the one that was asked
    // for — tagged `user:` when that is what it is, rather than mislabelled as a profile id.
    console.log(
      formatMatchProfile(userArg !== undefined ? `user:${userArg}` : profileArg!, outcome),
    );
    if (outcome.kind === "matched") {
      console.log(blockerBreakdown(outcome.tally));
      console.log(gateNoteBreakdown(outcome.tally));
      console.log(retiredLine(outcome.retired));
      for (const line of scoreDistribution(outcome.tally.scores)) console.log(line);
      console.log(reasonBulletCounts(outcome.tally));
      for (const line of topPairs(outcome.tally)) console.log(line);
    }
  }
} catch (error) {
  exitCode = 1;
  console.error(
    `match:once failed: ${error instanceof Error ? `${error.name}: ${error.message}` : "error"}`,
  );
} finally {
  await db.$client.end().catch(() => undefined);
}
process.exit(exitCode);
