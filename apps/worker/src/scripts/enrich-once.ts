// Runs job enrichment in-process, without pg-boss, and prints a summary per job.
//
// Usage: pnpm --filter @pemby/worker enrich:once -- --job <id> | --sample N [--dry-run] [--model <id>]
//
// --job      enrich that job, even when its enrichment is up to date.
// --sample   the N newest open, non-demo, canonical jobs needing enrichment (at most 20).
// --dry-run  compute and print tier summaries; write no job tables. Paid calls are still real: they
//            are recorded in `ai_usage` (run label `enrich-once:dry-run`) and checked against the
//            daily cap. Job reads use a read-only session; ledger inserts use a second connection.
// --model    pin one model with no fallback (e.g. openai/gpt-oss-120b).
//
// Respects ENRICH_SAMPLE_MAX_JOBS when writing. Needs DATABASE_URL, OPENROUTER_KEY_PUBLIC and the
// private config (PRIVATE_CONFIG_*). Prints ids, titles, tiers, counts and cost; never post text,
// quotes or prompt text.
import { createDailyCapGuard, loadPrompt, type DailyCapGuard } from "@pemby/ai";
import { createAiUsageLedger, createDb } from "@pemby/db";

import {
  alertCapReached,
  computeEnrichment,
  describeEnrichError,
  readEnrichEnv,
  sampleSlotAvailable,
  selectJobsToEnrich,
  tierSummary,
  writeEnrichment,
  type EnrichDeps,
} from "../enrich";

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

const jobArg = flag("job");
const sampleArg = flag("sample");
const model = flag("model");
const dryRun = process.argv.includes("--dry-run");
if ((jobArg === undefined) === (sampleArg === undefined)) {
  console.error("usage: enrich:once -- --job <id> | --sample N [--dry-run] [--model <id>]");
  process.exit(2);
}
const sample = sampleArg === undefined ? 0 : Number(sampleArg);
if (sampleArg !== undefined && (!Number.isInteger(sample) || sample < 1 || sample > 20)) {
  console.error("--sample must be an integer from 1 to 20");
  process.exit(2);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const enrichEnv = readEnrichEnv();

// Dry runs read through one read-only connection; the ledger always writes through its own pool.
const db = createDb(url, { max: dryRun ? 1 : 2, application_name: "pemby-enrich-once" });
const ledgerDb = dryRun
  ? createDb(url, { max: 1, application_name: "pemby-enrich-once-ledger" })
  : db;
const ledger = createAiUsageLedger(ledgerDb);
const capGuard: DailyCapGuard = createDailyCapGuard({ ledger });

const deps: EnrichDeps = {
  db,
  ledger,
  capGuard,
  runLabel: dryRun ? "enrich-once:dry-run" : "enrich-once",
  ...(model ? { routeOverride: { model } } : {}),
};

let exitCode = 0;
try {
  if (dryRun) await db.$client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");

  let ids: string[];
  if (jobArg) ids = [jobArg];
  else {
    const { versionId } = await loadPrompt("job-enrichment");
    ids = await selectJobsToEnrich(db, sample, { skipQueued: false, promptVersion: versionId });
  }
  const cap = await capGuard.check();
  if (cap.state === "capped") {
    await alertCapReached(ledgerDb, cap);
    console.error(`enrich:once: daily AI cap reached ($${cap.spentUsd.toFixed(4)}); nothing sent`);
    exitCode = 1;
    ids = [];
  }
  console.log(`enrich:once jobs=${ids.length} dryRun=${dryRun} model=${model ?? "routing"}`);

  let totalCost = 0;
  for (const id of ids) {
    const started = Date.now();
    try {
      if (
        !dryRun &&
        enrichEnv.sampleMaxJobs !== null &&
        !(await sampleSlotAvailable(db, enrichEnv.sampleMaxJobs, id))
      ) {
        console.log(`\njob ${id}: skipped (sample-limit ${enrichEnv.sampleMaxJobs})`);
        continue;
      }
      const result = await computeEnrichment(deps, id, { force: true });
      if (result.kind === "skipped") {
        console.log(`\njob ${id}: skipped (${result.reason})`);
        continue;
      }
      const c = result.value;
      totalCost += c.ai.costUsd;
      const kinds = c.llm.signals.map((s) => `${s.kind}/${s.strength[0]}`).join(",") || "none";
      console.log(`\njob ${id}: ${c.job.title}`);
      console.log(
        `  model=${c.ai.model} outcome=${c.ai.outcome} attempts=${c.ai.attempts} cost=$${c.ai.costUsd.toFixed(6)} latency=${c.ai.latencyMs}ms prompt=${c.ai.promptVersion}`,
      );
      console.log(
        `  rules: signals=${c.rules.signals.length} unresolved=${c.rules.unresolved}; llm: signals=${c.llm.signals.length} [${kinds}] dropped=${c.llm.dropped} unverifiedQuotes=${c.llm.unverifiedQuotes} moneyAsk=${c.llm.asksCandidateForMoney}`,
      );
      console.log(
        `  enrichment: seniority=${c.ai.data.seniority ?? "-"} stack=${c.ai.data.stack.length} ways=${c.ai.data.waysOfWorking.join(",") || "-"} visa=${c.ai.data.visaSponsorship} timezone=${c.ai.data.timezone ? "yes" : "no"}`,
      );
      for (const line of tierSummary(c.verdicts)) console.log(`  ${line}`);
      if (!dryRun) {
        const written = await writeEnrichment(db, c);
        if (written.skipped) {
          console.log(`  not written: ${written.skipped}`);
          continue;
        }
        console.log(
          `  wrote job_eligibility=${written.eligibilityRows} eligibility_evidence=${written.evidenceRows} (${Date.now() - started} ms)`,
        );
      }
    } catch (error) {
      exitCode = 1;
      console.error(`\njob ${id}: failed: ${describeEnrichError(error)}`);
    }
  }
  console.log(`\ntotal cost $${totalCost.toFixed(6)} (recorded in ai_usage)`);
} catch (error) {
  exitCode = 1;
  console.error(
    `enrich:once failed: ${error instanceof Error ? `${error.name}: ${error.message}` : "error"}`,
  );
} finally {
  await db.$client.end().catch(() => undefined);
  if (ledgerDb !== db) await ledgerDb.$client.end().catch(() => undefined);
}
process.exit(exitCode);
