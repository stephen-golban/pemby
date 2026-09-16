import { createAtsHttpClient } from "@pemby/ats";
import { PrivateConfigError, loadPrivateConfig } from "@pemby/core/private-config";
import { createDb } from "@pemby/db";
import { PgBoss } from "pg-boss";
import { readWorkerEnv } from "./env";
import { SYNC_COMPANIES_QUEUE } from "./ingest/queues";
import { createIngestQueues, scheduleIngestJobs, startIngestWorkers } from "./ingest/workers";

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

const db = createDb(env.databaseUrl, { max: 15, application_name: "pemby-worker" });
try {
  await db.$client.query("select 1");
  console.log("database connected");
} catch (error) {
  console.error(`database connection failed: ${error instanceof Error ? error.name : "error"}`);
  process.exit(1);
}

// pg-boss keeps its tables in schema `pgboss`, which Drizzle migrations never touch.
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

try {
  await boss.start();
  await createIngestQueues(boss);
  await scheduleIngestJobs(boss, env);
  // One HTTP client for the process, so per-host limits hold across concurrent board reads.
  await startIngestWorkers({ boss, db, http: createAtsHttpClient(), env });
  // Company sync at boot; it also enqueues boards that were never read.
  await boss.send(SYNC_COMPANIES_QUEUE, {});
} catch (error) {
  console.error(
    `worker boot failed: ${error instanceof Error ? `${error.name}: ${error.message}` : "error"}`,
  );
  await boss.stop({ graceful: false, close: true }).catch(() => undefined);
  await db.$client.end().catch(() => undefined);
  process.exit(1);
}

console.log(
  `worker started (env: ${appEnv}) ingestEvery=${env.ingestIntervalHours}h verifyMaxAge=${env.verifyLiveMaxAgeHours}h concurrency=${env.ingestConcurrency}`,
);
