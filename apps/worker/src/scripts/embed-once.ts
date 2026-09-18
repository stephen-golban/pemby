// Runs the embedding handlers in-process, without pg-boss, and prints one line per row.
//
// Usage: pnpm --filter @pemby/worker embed:once -- \
//          --profiles N | --profile <id> | --jobs N | --job <id> [--include-demo] [--dry-run]
//
// --profile        embed that one profile (personal data; private ZDR key).
// --profiles N     the N profiles `selectProfilesToEmbed` returns — a vector that is missing, built
//                  with another model, or older than the profile row or its newest parsed CV.
// --job / --jobs N the same for job posts, through `embed.job`.
// --include-demo   also embed seeded demo profiles, which the sweep's selector leaves out.
// --dry-run        select and count; send nothing and write nothing.
//
// Both handlers check the global daily cap and the embedding sub-budget before every request, so a
// capped day stops here with a message instead of spending. Nothing raises either ceiling.
//
// **Privacy.** `embed.profile` values are CV-derived personal data and go out on the
// `profile-embedding` route: private key, `personalData: true`, and `withEnforcedZdr` rewrites the
// body to `provider: { zdr: true, data_collection: "deny" }` at the fetch layer. This script prints
// ids, counts, characters, tokens, cost and milliseconds — never a profile field, a CV, a job title
// or any part of the embedded text.
//
// Needs DATABASE_URL, OPENROUTER_KEY_PRIVATE and the private config (PRIVATE_CONFIG_*, for routing).
import { DailyCapReachedError, createDailyCapGuard, type DailyCapGuard } from "@pemby/ai";
import { createAiUsageLedger, createDb } from "@pemby/db";

import {
  describeEmbedError,
  embedJob,
  embedProfile,
  embedSpentTodayUsd,
  readEmbedEnv,
  selectJobsToEmbed,
  selectProfilesToEmbed,
  type EmbedDeps,
  type EmbedOutcome,
} from "../embed";

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

function count(name: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 5000) {
    console.error(`--${name} must be an integer from 1 to 5000`);
    process.exit(2);
  }
  return value;
}

const profileArg = flag("profile");
const jobArg = flag("job");
const profilesArg = count("profiles", flag("profiles"));
const jobsArg = count("jobs", flag("jobs"));
const includeDemo = process.argv.includes("--include-demo");
const dryRun = process.argv.includes("--dry-run");

const targets = [profileArg, jobArg, profilesArg, jobsArg].filter((v) => v !== undefined);
if (targets.length !== 1) {
  console.error(
    "usage: embed:once -- --profiles N | --profile <id> | --jobs N | --job <id> [--include-demo] [--dry-run]",
  );
  process.exit(2);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const env = readEmbedEnv();

/** One line per row. Ids, counts, cost and milliseconds only, never text. */
function formatOutcome(outcome: EmbedOutcome): string {
  switch (outcome.kind) {
    case "skipped":
      return `skipped: ${outcome.reason}`;
    case "unchanged":
      return "unchanged (no model call)";
    case "embedded":
      return `embedded chars=${outcome.chars} tokens=${outcome.inputTokens} cost=${outcome.costUsd.toFixed(6)} model=${outcome.model} requests=${outcome.requests} ms=${outcome.latencyMs}`;
  }
}

const db = createDb(url, { max: 2, application_name: "pemby-embed-once" });
const ledger = createAiUsageLedger(db);
const capGuard: DailyCapGuard = createDailyCapGuard({ ledger });

let exitCode = 0;
try {
  const kind = profileArg !== undefined || profilesArg !== undefined ? "profile" : "job";
  let ids: string[];
  if (profileArg !== undefined) ids = [profileArg];
  else if (jobArg !== undefined) ids = [jobArg];
  else if (profilesArg !== undefined) {
    ids = await selectProfilesToEmbed(db, profilesArg, { skipQueued: false, includeDemo });
  } else {
    ids = await selectJobsToEmbed(db, jobsArg!, { skipQueued: false });
  }

  const spent = await embedSpentTodayUsd(db);
  console.log(
    `embed:once kind=${kind} selected=${ids.length} dryRun=${dryRun} includeDemo=${includeDemo} embedSpentToday=${spent.toFixed(6)} budget=${env.budgetUsd.toFixed(6)}`,
  );
  if (dryRun) {
    for (const id of ids) console.log(`${kind}=${id} selected`);
    ids = [];
  }

  const deps: EmbedDeps = {
    db,
    ledger,
    capGuard,
    budgetUsd: env.budgetUsd,
    runLabel: "embed-once",
  };
  let embedded = 0;
  let unchanged = 0;
  let skipped = 0;
  const skipReasons: Record<string, number> = {};
  let totalTokens = 0;
  let totalCost = 0;

  for (const id of ids) {
    try {
      const outcome = kind === "profile" ? await embedProfile(deps, id) : await embedJob(deps, id);
      console.log(`${kind}=${id} ${formatOutcome(outcome)}`);
      if (outcome.kind === "embedded") {
        embedded += 1;
        totalTokens += outcome.inputTokens;
        totalCost += outcome.costUsd;
      } else if (outcome.kind === "unchanged") unchanged += 1;
      else {
        skipped += 1;
        skipReasons[outcome.reason] = (skipReasons[outcome.reason] ?? 0) + 1;
      }
    } catch (error) {
      if (error instanceof DailyCapReachedError) {
        // Nothing was sent: the global cap or the embed sub-budget was already reached. Stop the
        // whole run rather than retrying every remaining row against the same ceiling.
        exitCode = 1;
        console.error(
          `embed:once stopped at ${kind}=${id}: daily cap reached (spent=${error.spentUsd.toFixed(6)} cap=${error.capUsd.toFixed(6)}); nothing sent for this row`,
        );
        break;
      }
      exitCode = 1;
      console.error(`${kind}=${id} failed: ${describeEmbedError(error)}`);
    }
  }

  const reasons = Object.entries(skipReasons)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, n]) => `${reason}:${n}`)
    .join(" ");
  console.log(
    `embed:once done embedded=${embedded} unchanged=${unchanged} skipped=${skipped}${reasons ? ` (${reasons})` : ""} tokens=${totalTokens} cost=${totalCost.toFixed(6)}`,
  );
} catch (error) {
  exitCode = 1;
  console.error(
    `embed:once failed: ${error instanceof Error ? `${error.name}: ${error.message}` : "error"}`,
  );
} finally {
  await db.$client.end().catch(() => undefined);
}
process.exit(exitCode);
