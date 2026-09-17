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
import { readWorkerEnv } from "./env";
import {
  createEnrichQueues,
  readEnrichEnv,
  scheduleEnrichSweep,
  startEnrichWorkers,
} from "./enrich";
import {
  createIngestQueues,
  runCompanySync,
  scheduleIngestJobs,
  startIngestWorkers,
} from "./ingest/workers";

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

// Phase 05 added two more sweep/handler pairs (enrich, company-evidence) on top of ingest's 7 ATS
// queues plus 4 maintenance queues, all on this one Drizzle pool. Regular (non-transactional)
// pg-boss handlers only borrow a pooled connection for their own queries, not for the job's whole
// duration, so this is sized for default-env concurrency (ingest ~11 + enrich 2 + company-evidence
// 2 = ~15) with headroom left for the sweep/maintenance queues and the boot company sync.
const db = createDb(env.databaseUrl, { max: 20, application_name: "pemby-worker" });
try {
  await db.$client.query("select 1");
  console.log("database connected");
} catch (error) {
  console.error(`database connection failed: ${error instanceof Error ? error.name : "error"}`);
  process.exit(1);
}

// pg-boss keeps its tables in schema `pgboss`, which Drizzle migrations never touch.
//
// Phase 05 raised the number of registered `boss.work` calls to 15 (7 ATS + 4 ingest maintenance
// queues + enrich.sweep/enrich.job + company-evidence.check/.sweep), each polling on its own
// interval (10-60s). None of them run `transactional: true`, so pg-boss only borrows a pooled
// connection for a fetch/complete/fail call, never for the whole handler run; max 10 stays enough
// headroom for occasional overlap between polling loops.
const boss = new PgBoss({
  connectionString: env.databaseUrl,
  max: 10,
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
