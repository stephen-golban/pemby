// Worker knobs from the environment, with defaults. Names are listed in .env.example.
import { ATS_KINDS, type AtsKind } from "@pemby/core/private-config";

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function atsListFromEnv(name: string): ReadonlySet<AtsKind> {
  const raw = process.env[name]?.trim();
  if (!raw) return new Set();
  const kinds = new Set<AtsKind>();
  for (const part of raw.split(",")) {
    const kind = part.trim().toLowerCase();
    if (!kind) continue;
    if (!(ATS_KINDS as readonly string[]).includes(kind)) {
      throw new Error(`${name} has an unknown ATS kind "${kind}"`);
    }
    kinds.add(kind as AtsKind);
  }
  return kinds;
}

function listFromEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface WorkerEnv {
  databaseUrl: string;
  /** Hours between full reads of every enabled board (cron step, so best as a divisor of 24). */
  ingestIntervalHours: number;
  /** A board is re-read by verify-live when an open job was last verified longer ago than this. */
  verifyLiveMaxAgeHours: number;
  /** pg-boss workers per ATS queue in this process. */
  ingestConcurrency: number;
  /** ATS kinds the worker neither enqueues nor reads. */
  disabledAts: ReadonlySet<AtsKind>;
  /** Private source lists that supply boards. */
  sourceLists: string[];
}

export function readWorkerEnv(): WorkerEnv {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  return {
    databaseUrl,
    ingestIntervalHours: intFromEnv("INGEST_INTERVAL_HOURS", 6, 1, 12),
    verifyLiveMaxAgeHours: intFromEnv("VERIFY_LIVE_MAX_AGE_HOURS", 10, 1, 10),
    ingestConcurrency: intFromEnv("INGEST_CONCURRENCY", 2, 1, 10),
    disabledAts: atsListFromEnv("INGEST_DISABLED_ATS"),
    sourceLists: listFromEnv("INGEST_SOURCE_LISTS", ["ats-boards"]),
  };
}
