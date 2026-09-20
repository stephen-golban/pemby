// Flag-rule knobs from the environment. Names are listed in `.env.example`.
//
// FLAGS_ENABLED              "true" registers the sweep schedule; anything else removes it
//                            (default off, like ENRICH_ENABLED and EMBED_ENABLED). The two
//                            queues are created either way, so a flag filed while the rules are
//                            off is simply left `open` for the owner's review queue.
// FLAGS_SWEEP_LIMIT          flags claimed and enqueued per sweep, default 20, 1 to 200.
// FLAGS_CONCURRENCY          flags.process handlers per process, default 2, 1 to 8.
// FLAGS_CLAIM_STALE_MINUTES  a claim not resolved within this long is re-offered, default 30,
//                            1 to 240. See the note below: this is a ceiling on how long the
//                            whole sweep-to-verdict path may take, not a retry knob.
// FLAGS_MAX_ATTEMPTS         claims one flag may collect before the rules give up on it and leave
//                            it for the owner, default 5, 1 to 20.
// FLAGS_REWEIGH_LIMIT        open flags re-weighed per sweep, default 200, 0 to 5000. 0 turns the
//                            weighting pass off, which is the escape hatch if it ever misbehaves;
//                            everything then weighs its stored value, which for a flag filed
//                            before this phase is the column default of 1.
import { MIN_FLAG_CLAIM_ATTEMPTS, MIN_FLAG_CLAIM_STALE_MS } from "@pemby/db";

export interface FlagsEnv {
  enabled: boolean;
  sweepLimit: number;
  concurrency: number;
  /** Milliseconds, as `claimFlagsToProcess` wants it. */
  staleClaimMs: number;
  maxAttempts: number;
  reweighLimit: number;
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

/**
 * Default 30 minutes rather than the kernel's own 15.
 *
 * **The claim is taken by the sweep and released by the handler**, so the window has to cover the
 * queue wait as well as the rule's own run — not just a crash. A `closed_or_fake` flag makes a real
 * ATS board read, which on a large Lever or Greenhouse board takes tens of seconds, and a
 * `wrong_details` flag waits for a whole forced re-enrichment to finish. At the default sweep limit
 * of 20 and a concurrency of 2 the worst realistic drain is well inside 30 minutes; 15 was not
 * obviously so, and a window that expires under a healthy backlog re-offers a flag that is being
 * processed right now, which is the one thing the claim exists to prevent.
 *
 * It is a bound, not a guarantee: `claim_attempts` is the guarantee, and `recordFlagOutcome`'s race
 * for the verdict is what stops a second processor writing a second one.
 */
export const FLAG_CLAIM_STALE_DEFAULT_MINUTES = 30;

export function readFlagsEnv(env: EnvLike = process.env): FlagsEnv {
  const enabled = env.FLAGS_ENABLED?.trim().toLowerCase();
  if (enabled && !["true", "false", "1", "0"].includes(enabled)) {
    throw new Error("FLAGS_ENABLED must be true or false");
  }
  const staleMinutes = int(
    env,
    "FLAGS_CLAIM_STALE_MINUTES",
    FLAG_CLAIM_STALE_DEFAULT_MINUTES,
    1,
    240,
  );
  const staleClaimMs = staleMinutes * 60_000;
  // The kernel throws below its own floor rather than clamping, and so does this: a caller that
  // asked for 30 seconds has made a mistake whose symptom is every worker processing every flag.
  if (staleClaimMs < MIN_FLAG_CLAIM_STALE_MS) {
    throw new Error(
      `FLAGS_CLAIM_STALE_MINUTES must be at least ${MIN_FLAG_CLAIM_STALE_MS / 60_000}`,
    );
  }
  return {
    enabled: enabled === "true" || enabled === "1",
    sweepLimit: int(env, "FLAGS_SWEEP_LIMIT", 20, 1, 200),
    concurrency: int(env, "FLAGS_CONCURRENCY", 2, 1, 8),
    staleClaimMs,
    maxAttempts: int(env, "FLAGS_MAX_ATTEMPTS", 5, MIN_FLAG_CLAIM_ATTEMPTS, 20),
    reweighLimit: int(env, "FLAGS_REWEIGH_LIMIT", 200, 0, 5000),
  };
}
