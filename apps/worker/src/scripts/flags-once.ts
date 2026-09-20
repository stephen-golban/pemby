// Runs the flag rules once, in this process, and prints one line per flag.
//
// Usage: pnpm --filter @pemby/worker flags:once -- [--flag <id>] [--limit N] [--dry-run]
//
// --flag <id>   run the rule for that one flag, whatever the sweep would have chosen. The flag is
//               **not** claimed first, so this is the way to look at a flag the sweep has given up
//               on (`claim_attempts` at the ceiling) — the rule still refuses a demo one.
// --limit N     flags to claim and process this run. Default `FLAGS_SWEEP_LIMIT`.
// --dry-run     re-weigh and claim nothing; print what `claimFlagsToProcess` would return, using a
//               read-only count instead. Sends nothing, writes no verdict.
//
// Shaped like `enrich:once`, `embed:once` and `match:once`: the same handlers the worker registers,
// driven by hand, so an owner can push the backlog through without waiting for a 5-minute cron and
// without restarting the service.
//
// **pg-boss is started**, unlike `embed:once`, because two of the five rules send jobs: a
// `wrong_details` flag enqueues a forced `enrich.job`, and a `not_hiring_from_country` flag enqueues
// a `company-evidence.check`. Running them without a queue would make both silently do nothing,
// which is the failure mode this phase is about. The queues are created here for the same reason
// `apps/worker/src/index.ts` creates them before the handlers start.
//
// **What it can spend.** A `wrong_details` flag queues a model call; it does not make one — the
// worker process does, when it drains `enrich.job`. A `closed_or_fake` flag reads a public ATS
// board over the network. Nothing else here touches a provider.
//
// **Privacy.** Ids, counts and rule outcomes only. Never a country, a picker value or a note — this
// script never loads `flags.note`, because nothing in this module does.
import { createAtsHttpClient } from "@pemby/ats";
import { createDb } from "@pemby/db";
import { PgBoss } from "pg-boss";

import { createCompanyEvidenceQueues } from "../company-evidence/workers";
import { createEnrichQueues } from "../enrich";
import {
  createFlagQueues,
  processFlag,
  readFlagsEnv,
  reweighOpenFlags,
  sweepFlags,
} from "../flags";

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

const flagId = flag("flag");
const limitRaw = flag("limit");
const dryRun = process.argv.includes("--dry-run");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const env = readFlagsEnv();
const limit = limitRaw === undefined ? env.sweepLimit : Number(limitRaw);
if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
  console.error("--limit must be an integer from 1 to 500");
  process.exit(2);
}

const db = createDb(url, { max: 4, application_name: "pemby-flags-once" });
const boss = new PgBoss({ connectionString: url, max: 2, application_name: "pemby-flags-once-q" });
const http = createAtsHttpClient();
const controller = new AbortController();

try {
  await boss.start();
  // Every queue a rule may send to, before any rule runs.
  await createEnrichQueues(boss);
  await createCompanyEvidenceQueues(boss);
  await createFlagQueues(boss);

  if (flagId) {
    const result = await processFlag({ db, boss, http, signal: controller.signal }, flagId);
    if (result === null) console.log(`flag ${flagId}: not actionable (gone, resolved, or demo)`);
    process.exitCode = 0;
  } else if (dryRun) {
    const r = await reweighOpenFlags(db, env.reweighLimit);
    console.log(
      `dry run: reweighed ${r.changed}/${r.considered} open flags (${r.discounted} now weigh under 1); claimed nothing`,
    );
  } else {
    const swept = await sweepFlags(boss, db, { ...env, sweepLimit: limit });
    console.log(
      `sweep: reweighed=${swept.reweighChanged}/${swept.reweighed} claimed=${swept.claimed} enqueued=${swept.enqueued}`,
    );
    // The sweep only enqueues. Drain what it just claimed, here, so one command is one pass.
    const drained = await boss.fetch("flags.process", { batchSize: limit });
    for (const job of drained ?? []) {
      const data = job.data as { flagId: string };
      try {
        const result = await processFlag(
          { db, boss, http, signal: controller.signal },
          data.flagId,
        );
        if (result === null) console.log(`flags.process flag=${data.flagId} not actionable`);
        await boss.complete("flags.process", job.id);
      } catch (error) {
        // The label, never the original: a driver error's message quotes its parameters.
        const label = error instanceof Error ? error.name : "error";
        console.error(`flags.process flag=${data.flagId} failed: ${label}`);
        await boss.fail("flags.process", job.id, { label });
      }
    }
    console.log(`drained ${drained?.length ?? 0} flag job(s)`);
  }
} finally {
  await boss.stop({ graceful: false, close: true }).catch(() => undefined);
  await db.$client.end().catch(() => undefined);
}
