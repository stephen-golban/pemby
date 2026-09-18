// Matcher knobs from the environment. Names are listed in .env.example by the integration order.
//
// MATCH_ENABLED           "true" registers the sweep schedule; anything else removes it (default
//                         off, like ENRICH_ENABLED and EMBED_ENABLED).
// MATCH_SWEEP_LIMIT       newly enriched jobs enqueued per sweep (every 10 minutes), default 200,
//                         1 to 2000. A job fan-out costs no model call (PLAN D18), so the ceiling
//                         is database work, not spend: 200 a sweep is 28,800 a day, well above the
//                         ~5k jobs staging enriches in a week.
// MATCH_CONCURRENCY       match.job handlers per process, default 2, 1 to 8. match.profile always
//                         runs one at a time: it is personal data and there are never many waiting.
// MATCH_PROFILE_JOB_LIMIT candidate jobs loaded and scored for one profile run, default 500, 50 to
//                         5000. This is the only unbounded read in the profile direction, so it is
//                         a knob rather than a constant; the largest target country holds under a
//                         hundred rows at green+yellow today.

export interface MatchEnv {
  enabled: boolean;
  sweepLimit: number;
  concurrency: number;
  profileJobLimit: number;
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

export function readMatchEnv(env: EnvLike = process.env): MatchEnv {
  const enabled = env.MATCH_ENABLED?.trim().toLowerCase();
  if (enabled && !["true", "false", "1", "0"].includes(enabled)) {
    throw new Error("MATCH_ENABLED must be true or false");
  }
  return {
    enabled: enabled === "true" || enabled === "1",
    sweepLimit: int(env, "MATCH_SWEEP_LIMIT", 200, 1, 2000),
    concurrency: int(env, "MATCH_CONCURRENCY", 2, 1, 8),
    profileJobLimit: int(env, "MATCH_PROFILE_JOB_LIMIT", 500, 50, 5000),
  };
}
