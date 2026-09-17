// Runs ONLY the CV drop queues (cv.extract, cv.parse, cv.cleanup) for local development against
// staging, without ingest or enrichment, which would race the deployed worker.
//
// Usage:
//   pnpm --filter @pemby/worker cv:dev
//       boots private config, the database and pg-boss, creates the cv queues and registers their
//       handlers and the cleanup schedule (needs CV_DROP_ENABLED=true and APP_ENV != production).
//   pnpm --filter @pemby/worker cv:dev -- --cleanup-once [--ttl-hours N] [--user <id>]...
//       [--orphan-min-age-minutes N]
//       runs the cleanup once in-process and exits. With --user, only those anonymous users are
//       candidates and rate limits are not purged (scoped proof mode).
//
// Prints ids, statuses, codes, counts and ms only.
import { loadRoutingTable } from "@pemby/ai";
import { PrivateConfigError, loadPrivateConfig } from "@pemby/core/private-config";
import { createDb } from "@pemby/db";
import { PgBoss } from "pg-boss";

import {
  createCvBucket,
  createCvQueues,
  readCvAnonTtlHours,
  readCvEnv,
  runCvCleanup,
  startCvWorkers,
} from "../cv";

function flagValues(name: string): string[] {
  const values: string[] = [];
  process.argv.forEach((arg, i) => {
    if (arg !== `--${name}`) return;
    const value = process.argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      console.error(`--${name} needs a value`);
      process.exit(2);
    }
    values.push(value);
  });
  return values;
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

let cvEnv: ReturnType<typeof readCvEnv>;
try {
  cvEnv = readCvEnv();
} catch (error) {
  console.error(`cv env invalid: ${error instanceof Error ? error.message : "error"}`);
  process.exit(1);
}
if (!cvEnv.enabled || !cvEnv.bucket) {
  console.error("cv:dev needs CV_DROP_ENABLED=true outside production");
  process.exit(1);
}

const db = createDb(databaseUrl, { max: 6, application_name: "pemby-cv-dev" });

if (process.argv.includes("--cleanup-once")) {
  const ttlArg = flagValues("ttl-hours")[0];
  const ttlHours = ttlArg === undefined ? readCvAnonTtlHours() : Number(ttlArg);
  if (!Number.isInteger(ttlHours) || ttlHours < 0) {
    console.error("--ttl-hours must be a non-negative integer");
    process.exit(2);
  }
  const users = flagValues("user");
  const orphanArg = flagValues("orphan-min-age-minutes")[0];
  const orphanMinAgeMinutes = orphanArg === undefined ? undefined : Number(orphanArg);
  if (orphanMinAgeMinutes !== undefined && !(orphanMinAgeMinutes >= 0)) {
    console.error("--orphan-min-age-minutes must be a non-negative number");
    process.exit(2);
  }
  let code = 0;
  try {
    const started = Date.now();
    const r = await runCvCleanup(db, createCvBucket(cvEnv.bucket), {
      ttlHours,
      ...(users.length > 0 ? { onlyUserIds: users } : {}),
      ...(orphanMinAgeMinutes === undefined ? {} : { orphanMinAgeMinutes }),
    });
    console.log(
      `cv.cleanup once: scope=${users.length > 0 ? `users:${users.length}` : "global"} ttlHours=${ttlHours} users=${r.users} cvFiles=${r.cvFiles} objects=${r.objects} orphanObjects=${r.orphanObjects} rateLimits=${r.rateLimits} failed=${r.failed} ms=${Date.now() - started}`,
    );
  } catch (error) {
    console.error(`cv.cleanup once failed: ${error instanceof Error ? error.name : "error"}`);
    code = 1;
  } finally {
    await db.$client.end().catch(() => undefined);
  }
  process.exit(code);
}

try {
  const { version, prompts } = await loadPrivateConfig();
  console.log(`private config loaded: id=${version.shortId} prompts=${prompts.size}`);
  await loadRoutingTable();
} catch (error) {
  const detail =
    error instanceof PrivateConfigError
      ? `${error.code}: ${error.message}`
      : `unexpected ${error instanceof Error ? error.name : "error"}`;
  console.error(`private config failed to load: ${detail}`);
  process.exit(1);
}

const boss = new PgBoss({
  connectionString: databaseUrl,
  max: 4,
  application_name: "pemby-cv-dev-queue",
});
boss.on("error", (error) => console.error(`pg-boss error: ${error.name}`));

let stopping = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`cv:dev received ${signal}, shutting down`);
  await boss.stop({ graceful: true, timeout: 10_000, close: true }).catch(() => undefined);
  await db.$client.end().catch(() => undefined);
  process.exit(0);
}
process.on("SIGTERM", (s) => void shutdown(s));
process.on("SIGINT", (s) => void shutdown(s));

try {
  await db.$client.query("select 1");
  await boss.start();
  await createCvQueues(boss);
  await startCvWorkers({ boss, db, env: cvEnv });
  console.log(`cv:dev started (env: ${cvEnv.appEnv}) anonTtlHours=${cvEnv.anonTtlHours}`);
} catch (error) {
  console.error(
    `cv:dev boot failed: ${error instanceof Error ? `${error.name}: ${error.message}` : "error"}`,
  );
  await boss.stop({ graceful: false, close: true }).catch(() => undefined);
  await db.$client.end().catch(() => undefined);
  process.exit(1);
}
