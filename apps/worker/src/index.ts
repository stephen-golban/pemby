import { loadRoutingTable } from "@pemby/ai";
import { createAtsHttpClient } from "@pemby/ats";
import {
  PrivateConfigError,
  loadPrivateConfig,
  loadRoutingConfig,
} from "@pemby/core/private-config";
import { createDb } from "@pemby/db";
import { PgBoss } from "pg-boss";
import {
  createCompanyEvidenceQueues,
  readCompanyEvidenceEnv,
  scheduleCompanyEvidenceSweep,
  startCompanyEvidenceWorkers,
} from "./company-evidence";
import { createCvQueues, readCvEnv, startCvWorkers } from "./cv";
import {
  createDeliverQueues,
  describeDeliverEnv,
  readDeliverEnv,
  scheduleDeliverSweep,
  startDeliverWorkers,
} from "./deliver";
import { createEmbedQueues, readEmbedEnv, scheduleEmbedSweep, startEmbedWorkers } from "./embed";
import { readWorkerEnv } from "./env";
import {
  createEnrichQueues,
  readEnrichEnv,
  scheduleEnrichSweep,
  startEnrichWorkers,
} from "./enrich";
import { createFlagQueues, readFlagsEnv, scheduleFlagSweep, startFlagWorkers } from "./flags";
import {
  createIngestQueues,
  runCompanySync,
  scheduleIngestJobs,
  startIngestWorkers,
} from "./ingest/workers";
import { createMatchQueues, readMatchEnv, scheduleMatchSweep, startMatchWorkers } from "./match";
import {
  createTrackerQueues,
  describeTrackerEnv,
  readTrackerEnv,
  startTrackerWorkers,
} from "./tracker";

const appEnv = process.env.APP_ENV ?? "development";

// Load private config at boot so a bad token, ref or layout crashes the deploy instead of the
// first job (docs/private-config.md). Log the version and counts only, never contents.
try {
  const { version, prompts, sourceLists } = await loadPrivateConfig();
  console.log(
    `private config loaded: source=${version.source} ref=${version.ref ?? "-"} id=${version.shortId} prompts=${prompts.size} sourceLists=${sourceLists.size}`,
  );
} catch (error) {
  // PrivateConfigError messages are safe to log; anything else is reduced to its name.
  const detail =
    error instanceof PrivateConfigError
      ? `${error.code}: ${error.message}`
      : `unexpected ${error instanceof Error ? error.name : "error"}`;
  console.error(`private config failed to load: ${detail}`);
  process.exit(1);
}

let env: ReturnType<typeof readWorkerEnv>;
try {
  env = readWorkerEnv();
} catch (error) {
  console.error(`worker env invalid: ${error instanceof Error ? error.message : "error"}`);
  process.exit(1);
}

let enrichEnv: ReturnType<typeof readEnrichEnv>;
try {
  enrichEnv = readEnrichEnv();
} catch (error) {
  console.error(`enrich env invalid: ${error instanceof Error ? error.message : "error"}`);
  process.exit(1);
}

let companyEvidenceEnv: ReturnType<typeof readCompanyEvidenceEnv>;
try {
  companyEvidenceEnv = readCompanyEvidenceEnv();
} catch (error) {
  console.error(
    `company evidence env invalid: ${error instanceof Error ? error.message : "error"}`,
  );
  process.exit(1);
}

let cvEnv: ReturnType<typeof readCvEnv>;
try {
  cvEnv = readCvEnv();
} catch (error) {
  console.error(`cv env invalid: ${error instanceof Error ? error.message : "error"}`);
  process.exit(1);
}

let embedEnv: ReturnType<typeof readEmbedEnv>;
try {
  embedEnv = readEmbedEnv();
} catch (error) {
  console.error(`embed env invalid: ${error instanceof Error ? error.message : "error"}`);
  process.exit(1);
}

let matchEnv: ReturnType<typeof readMatchEnv>;
try {
  matchEnv = readMatchEnv();
} catch (error) {
  console.error(`match env invalid: ${error instanceof Error ? error.message : "error"}`);
  process.exit(1);
}

let deliverEnv: ReturnType<typeof readDeliverEnv>;
try {
  deliverEnv = readDeliverEnv();
} catch (error) {
  console.error(`deliver env invalid: ${error instanceof Error ? error.message : "error"}`);
  process.exit(1);
}

let flagsEnv: ReturnType<typeof readFlagsEnv>;
try {
  flagsEnv = readFlagsEnv();
} catch (error) {
  console.error(`flags env invalid: ${error instanceof Error ? error.message : "error"}`);
  process.exit(1);
}

let trackerEnv: ReturnType<typeof readTrackerEnv>;
try {
  trackerEnv = readTrackerEnv();
} catch (error) {
  console.error(`tracker env invalid: ${error instanceof Error ? error.message : "error"}`);
  process.exit(1);
}

// Every handler in this process shares this one Drizzle pool. Regular (non-transactional) pg-boss
// handlers only borrow a pooled connection for their own queries, not for the job's whole duration,
// so what this has to cover is the number of queries that can be *in flight* at once, not the
// number of running jobs.
//
// Redone for phase 07 (embed and match), at default-env concurrency:
//   ingest        ~11 (7 ATS queues: greenhouse, lever and ashby at 1, the rest at INGEST_CONCURRENCY 2)
//   maintenance     4 (schedule-ingest, verify-live, sync-companies, source-health; all rare)
//   enrich          2   company-evidence 2   cv 3 (extract 1 + parse 2, staging only)
//   embed           3 (embed.job 2 + embed.profile 1)
//   match           ~9 (match.job 2 x up to 4 batched reads per page + match.profile 1 + sweep 1)
//   deliver         ~7 (deliver.sweep 1 + up to 3 concurrent channel drains, each holding at most
//                   2 at a time: its two opening reads run together, then one claim/record at a
//                   time per message)
// which is ~41 if literally everything overlapped, against the 15 phase 05 sized for. The match
// fan-out is the shape that set this: it issues its per-page similarity, CV-domain and pass reads
// concurrently, so one handler can hold several connections for a few milliseconds. Delivery is the
// opposite shape — long, mostly spent waiting on a provider with no connection held at all.
//
// 36 covers the realistic peak (a match fan-out running while ingest reads boards and three drains
// send) with headroom; the remainder queues inside node-postgres rather than failing, which is the
// right behaviour for a burst of short reads. Raised from 30.
const db = createDb(env.databaseUrl, { max: 36, application_name: "pemby-worker" });
try {
  await db.$client.query("select 1");
  console.log("database connected");
} catch (error) {
  console.error(`database connection failed: ${error instanceof Error ? error.name : "error"}`);
  process.exit(1);
}

// pg-boss keeps its tables in schema `pgboss`, which Drizzle migrations never touch.
//
// Registered `boss.work` calls, each polling on its own interval (1-60 s), recounted for phase 07:
//   7 ATS + 4 ingest maintenance                                        = 11
//   enrich.sweep, enrich.job                                            =  2
//   company-evidence.check, company-evidence.sweep                      =  2
//   cv.extract, cv.cleanup, cv.parse (staging only)                     =  3
//   embed.sweep, embed.job, embed.profile                               =  3
//   match.sweep, match.job, match.profile                               =  3
//   deliver.sweep, deliver.channel                                      =  2
//                                                                        ---
//                                                                         26
// None of them run `transactional: true`, so pg-boss borrows a pooled connection for a
// fetch/complete/fail call only, never for the whole handler run. 14 (raised from 12) keeps the
// same roughly-one-connection-per-two-polling-loops headroom the count of 15 had.
const boss = new PgBoss({
  connectionString: env.databaseUrl,
  max: 14,
  application_name: "pemby-worker-queue",
});
boss.on("error", (error) => {
  // pg-boss attaches queue and worker ids to the message; errors from pg may have no name.
  console.error(`pg-boss error: ${error.message}`);
});

let stopping = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`worker received ${signal}, shutting down`);
  try {
    // Waits up to 25 s for running board reads, then fails them back to the queue for retry.
    await boss.stop({ graceful: true, timeout: 25_000, close: true });
  } catch (error) {
    console.error(`pg-boss stop failed: ${error instanceof Error ? error.name : "error"}`);
  }
  await db.$client.end().catch(() => undefined);
  process.exit(0);
}
process.on("SIGTERM", (s) => void shutdown(s));
process.on("SIGINT", (s) => void shutdown(s));

let deps: Parameters<typeof runCompanySync>[0];
try {
  await boss.start();

  // `tracker.sync` is created first, before anything else, because its **sender is another
  // service**. `apps/web` runs its pg-boss client with `createSchema: false` and `migrate: false`,
  // so it can send and cannot create, and a send to a queue that does not exist is silently
  // dropped. Every other queue in this file is created before the handler that sends to it starts
  // (the note below on the embed/match pair is the same rule); this one has to be created before
  // the *web app* starts, which in practice means as early as this process can manage.
  await createTrackerQueues(boss);

  await createIngestQueues(boss);
  const { version } = await loadPrivateConfig();
  await scheduleIngestJobs(boss, env, version.id);
  // One HTTP client for the process, so per-host limits hold across concurrent board reads.
  deps = { boss, db, http: createAtsHttpClient(), env };
  await startIngestWorkers(deps);

  // A bad routing.json crashes the deploy here instead of the first AI call. Model ids are public
  // but live in the private config, so only whether an override is in effect is logged.
  await loadRoutingTable();
  const routingConfig = await loadRoutingConfig();
  console.log(`routing: ${routingConfig ? routingConfig.version : "default"}`);

  await createEnrichQueues(boss);
  await startEnrichWorkers({ boss, db, env: enrichEnv });
  await scheduleEnrichSweep(boss, enrichEnv);
  console.log(
    `enrich: ${enrichEnv.enabled ? "enabled" : "disabled"} sweepLimit=${enrichEnv.sweepLimit} concurrency=${enrichEnv.concurrency}${enrichEnv.sampleMaxJobs !== null ? ` sampleMaxJobs=${enrichEnv.sampleMaxJobs}` : ""}`,
  );

  await createCompanyEvidenceQueues(boss);
  await startCompanyEvidenceWorkers({ boss, db, env: companyEvidenceEnv });
  await scheduleCompanyEvidenceSweep(boss, companyEvidenceEnv);
  console.log(
    `company-evidence: ${companyEvidenceEnv.enabled ? "enabled" : "disabled"} maxAgeDays=${companyEvidenceEnv.maxAgeDays} sweepLimit=${companyEvidenceEnv.sweepLimit}`,
  );

  // Phase 06 CV drop: cv.extract, cv.parse and the cv.cleanup cron (off in production).
  await createCvQueues(boss);
  await startCvWorkers({ boss, db, env: cvEnv });
  console.log(`cv: ${cvEnv.enabled ? "enabled" : "disabled"} anonTtlHours=${cvEnv.anonTtlHours}`);

  // Phase 07 embeddings: embed.job, embed.profile and the embed.sweep cron. Model calls on the
  // private ZDR key for profiles, the public key for posts; both under the daily cap.
  //
  // The match queues are created here, before the embed handlers start, and not in the match block
  // below: a successful embed enqueues `match.job` / `match.profile` itself (a new vector is what
  // makes a pair scoreable, see `embed/workers.ts`), and `boss.send` to a queue that does not exist
  // yet throws. The handlers registered further down are what drain them.
  await createEmbedQueues(boss);
  await createMatchQueues(boss);
  await startEmbedWorkers({ boss, db, env: embedEnv });
  await scheduleEmbedSweep(boss, embedEnv);
  console.log(
    `embed: ${embedEnv.enabled ? "enabled" : "disabled"} sweepLimit=${embedEnv.sweepLimit} profileSweepLimit=${embedEnv.profileSweepLimit} concurrency=${embedEnv.concurrency}`,
  );

  // Phase 07 matcher: match.job, match.profile and the match.sweep cron. No model call ever
  // (PLAN D18), so there is no ledger and no cap guard to hand it. The three queues themselves were
  // created above, before the embed handlers that send to two of them.
  await startMatchWorkers({ boss, db, env: matchEnv });
  await scheduleMatchSweep(boss, matchEnv);
  console.log(
    // `testPassHolders` is counted, never listed: a user id is personal data. It is reported on the
    // match line as well as the deliver one because the matcher is where it decides
    // `matches.deliver_after`, and a zero here is why nobody is being delivered instantly.
    `match: ${matchEnv.enabled ? "enabled" : "disabled"} sweepLimit=${matchEnv.sweepLimit} concurrency=${matchEnv.concurrency} profileJobLimit=${matchEnv.profileJobLimit} testPassHolders=${matchEnv.testPassHolders.length}`,
  );

  // Phase 08 dispatcher: deliver.channel and the deliver.sweep cron. The sweep releases claims a
  // crashed dispatcher left behind and then hands each configured channel a drain; a channel whose
  // credentials are missing is simply never registered, so this is also the line that says which of
  // Telegram, email and push this deploy can actually reach. No model call, no @pemby/ai.
  await createDeliverQueues(boss);
  const deliverChannels = await startDeliverWorkers({ boss, db, env: deliverEnv });
  await scheduleDeliverSweep(boss, deliverEnv);
  console.log(describeDeliverEnv(deliverEnv, deliverChannels));

  // Phase 09 flag rules: flags.process and the flags.sweep cron (PLAN section 6).
  //
  // Registered **last of the queue-creating blocks**, and that is the ordering rule this file has
  // followed since phase 07: a handler must not start before the queues it sends to exist. A flag
  // rule sends to `enrich.job` (a forced re-enrichment for "wrong details") and to
  // `company-evidence.check` (a re-check for "doesn't hire from my country"), both created above.
  // Putting this block earlier would boot green and throw on the first flag of either reason.
  //
  // `http` is the process's one ATS client, shared with ingestion so the per-host rate limits hold
  // across both: the "closed or fake" rule reads a real board.
  await createFlagQueues(boss);
  await startFlagWorkers({ boss, db, env: flagsEnv, http: deps.http });
  await scheduleFlagSweep(boss, flagsEnv);
  console.log(
    `flags: ${flagsEnv.enabled ? "enabled" : "disabled"} sweepLimit=${flagsEnv.sweepLimit} concurrency=${flagsEnv.concurrency} staleClaimMin=${flagsEnv.staleClaimMs / 60_000} maxAttempts=${flagsEnv.maxAttempts} reweighLimit=${flagsEnv.reweighLimit}`,
  );

  // Phase 09 tracker sync: the handler for the queue created at the top of this block. No sweep —
  // a person moving a card is the only thing that creates this work.
  await startTrackerWorkers({ boss, db, env: trackerEnv });
  console.log(describeTrackerEnv(trackerEnv));
} catch (error) {
  console.error(
    `worker boot failed: ${error instanceof Error ? `${error.name}: ${error.message}` : "error"}`,
  );
  await boss.stop({ graceful: false, close: true }).catch(() => undefined);
  await db.$client.end().catch(() => undefined);
  process.exit(1);
}

// Company sync at boot runs here, in this process, with the config this process loaded. Sending it
// through the queue let an old container (still up during a deploy, with its older config) take
// the job. A failure only logs: the daily schedule retries.
try {
  await runCompanySync(deps, "boot");
} catch (error) {
  console.error(
    `sync-companies: boot sync failed: ${error instanceof Error ? `${error.name}: ${error.message}` : "error"}`,
  );
}

console.log(
  `worker started (env: ${appEnv}) ingestEvery=${env.ingestIntervalHours}h verifyMaxAge=${env.verifyLiveMaxAgeHours}h concurrency=${env.ingestConcurrency}`,
);
