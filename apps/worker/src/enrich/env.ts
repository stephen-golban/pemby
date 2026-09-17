// Enrichment knobs from the environment. Names are listed in .env.example by the integration order.
//
// ENRICH_ENABLED          "true" registers the sweep schedule; anything else removes it (default off).
// ENRICH_SWEEP_LIMIT      jobs enqueued per sweep (every 20 minutes), default 10, 1 to 200. Ten per
//                         sweep is 720 calls a day, under the free route's ~950-per-account quota.
// ENRICH_SAMPLE_MAX_JOBS  optional hard stop: no new job is enriched once `job_enrichment` has this
//                         many rows (staging sample). Re-enriching an existing row is still allowed.
// ENRICH_CONCURRENCY      enrich.job handlers per process, default 2, 1 to 8.

export interface EnrichEnv {
  enabled: boolean;
  sweepLimit: number;
  sampleMaxJobs: number | null;
  concurrency: number;
}

type EnvLike = Record<string, string | undefined>;

function int(env: EnvLike, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

export function readEnrichEnv(env: EnvLike = process.env): EnrichEnv {
  const enabled = env.ENRICH_ENABLED?.trim().toLowerCase();
  if (enabled && !["true", "false", "1", "0"].includes(enabled)) {
    throw new Error("ENRICH_ENABLED must be true or false");
  }
  const sampleRaw = env.ENRICH_SAMPLE_MAX_JOBS?.trim();
  return {
    enabled: enabled === "true" || enabled === "1",
    sweepLimit: int(env, "ENRICH_SWEEP_LIMIT", 10, 1, 200),
    sampleMaxJobs: sampleRaw ? int(env, "ENRICH_SAMPLE_MAX_JOBS", 0, 0, 1_000_000) : null,
    concurrency: int(env, "ENRICH_CONCURRENCY", 2, 1, 8),
  };
}
