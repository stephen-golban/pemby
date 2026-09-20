// Registers the flag sweep and the flags.process handler on one pg-boss instance.
//
// The sweep does three things in order, and the order is the design:
//
//   1. **Re-weigh** the open backlog (`reweighOpenFlags`). `flags.weight` is the anti-abuse knob the
//      eligibility engine already reads, and it has to be right *before* anything counts it — not
//      only for the flag being processed but for every other open flag on the same job, because
//      `countIndependentFlags` sums them all. This is also the pass over flags stored before these
//      rules existed: there is no separate backfill to remember to run, and re-writing the same
//      number is a no-op.
//   2. **Claim** up to `sweepLimit` flags (`claimFlagsToProcess`), which stamps `processing_at` and
//      increments `claim_attempts` inside one `update ... for update of c skip locked`. Demo flags,
//      demo jobs and demo companies are excluded there, and that guard is load-bearing rather than
//      decorative: staging holds a seeded flag that is `status = 'open'` while carrying
//      `action_taken = 'reverification_queued'`, and nothing else keeps it away from these rules.
//   3. **Enqueue** one `flags.process` job per claimed flag, carrying the flag id and nothing else.
//
// The claim is taken by the sweep and released by the handler, so `FLAGS_CLAIM_STALE_MINUTES` has to
// cover the queue wait as well as the run. See `./env.ts` for why the default is 30 rather than the
// kernel's 15.
import { claimFlagsToProcess, type Db, type FlagToProcess } from "@pemby/db";
import type { HttpClient } from "@pemby/ats";
import type { PgBoss } from "pg-boss";

import { safeErrorLabel } from "../cv/workers";
import type { FlagsEnv } from "./env";
import { loadFlagForRule } from "./load";
import {
  FLAG_PROCESS_QUEUE,
  FLAG_SWEEP_CRON,
  FLAG_SWEEP_QUEUE,
  type FlagProcessData,
} from "./queues";
import { ruleFor, type RuleDeps, type RuleResult } from "./rules";
import { reweighOpenFlags } from "./weight";

export interface FlagWorkerDeps {
  boss: PgBoss;
  db: Db;
  env: FlagsEnv;
  /**
   * The process's one ATS client, so the per-host limits the board reads share hold across the flag
   * rules too. `closed_or_fake` reads a real board; without this it would open a second pool of
   * limits and could push a vendor over its rate limit while ingestion is reading the same host.
   */
  http: HttpClient;
}

/** Registers the sweep cron when FLAGS_ENABLED, and removes it otherwise. */
export async function scheduleFlagSweep(boss: PgBoss, env: FlagsEnv): Promise<void> {
  if (!env.enabled) {
    await boss.unschedule(FLAG_SWEEP_QUEUE);
    return;
  }
  await boss.schedule(FLAG_SWEEP_QUEUE, FLAG_SWEEP_CRON, {}, { tz: "UTC" });
}

export interface FlagSweepResult {
  reweighed: number;
  reweighChanged: number;
  claimed: number;
  enqueued: number;
}

/** Re-weigh, claim, enqueue. Returns counts only; no id and no value is ever logged. */
export async function sweepFlags(boss: PgBoss, db: Db, env: FlagsEnv): Promise<FlagSweepResult> {
  const reweigh = await reweighOpenFlags(db, env.reweighLimit);
  const claimed = await claimFlagsToProcess(db, {
    limit: env.sweepLimit,
    staleClaimMs: env.staleClaimMs,
    maxAttempts: env.maxAttempts,
  });

  let enqueued = 0;
  for (const flag of claimed) {
    // `flags.process` is `exclusive` on the flag id, so a send for a flag whose previous job is
    // still in flight returns null. That is the correct no-op, not an error: the claim it carries
    // is the same claim, and the running job will write the verdict.
    const id = await boss.send(
      FLAG_PROCESS_QUEUE,
      { flagId: flag.flagId } satisfies FlagProcessData,
      { singletonKey: flag.flagId },
    );
    if (id) enqueued += 1;
  }

  return {
    reweighed: reweigh.considered,
    reweighChanged: reweigh.changed,
    claimed: claimed.length,
    enqueued,
  };
}

/** One line per flag. Ids and counts only — never a country, a field value or a note. */
function formatResult(flag: FlagToProcess, result: RuleResult): string {
  const head = `flags.process flag=${flag.flagId} reason=${flag.reason} attempt=${flag.claimAttempts}`;
  switch (result.kind) {
    case "actioned":
      return `${head} -> ${result.status}/${result.action} (${result.detail})`;
    case "deferred":
      return `${head} -> deferred (${result.detail})`;
    case "lost":
      return `${head} -> already actioned by another worker (${result.detail})`;
  }
}

/** Run one flag's rule. Exported for `flags:once`. */
export async function processFlag(deps: RuleDeps, flagId: string): Promise<RuleResult | null> {
  const flag = await loadFlagForRule(deps.db, flagId);
  // Null means: gone, already carrying a verdict, or demo. None of the three is a rule's business,
  // and writing any verdict on a demo row would be this module editing seed data.
  if (!flag) return null;
  const result = await ruleFor(flag.reason)(deps, flag);
  console.log(formatResult(flag, result));
  return result;
}

export async function startFlagWorkers(deps: FlagWorkerDeps): Promise<void> {
  const { boss, db, env, http } = deps;

  await boss.work(FLAG_SWEEP_QUEUE, { pollingIntervalSeconds: 30 }, async () => {
    const r = await sweepFlags(boss, db, env);
    console.log(
      `flags.sweep: reweighed=${r.reweighChanged}/${r.reweighed} claimed=${r.claimed} enqueued=${r.enqueued}`,
    );
  });

  await boss.work<FlagProcessData>(
    FLAG_PROCESS_QUEUE,
    { batchSize: 1, localConcurrency: env.concurrency, pollingIntervalSeconds: 10 },
    async ([job]) => {
      if (!job) return;
      const { flagId } = job.data;
      try {
        const result = await processFlag({ db, boss, http, signal: job.signal }, flagId);
        if (result === null) console.log(`flags.process flag=${flagId} skipped: not actionable`);
      } catch (error) {
        // pg-boss stores what a handler throws in `pgboss.job.output`. A driver error's message
        // quotes its parameters, and this module's parameters include a flagger's country, so the
        // original error never leaves this function.
        const label = safeErrorLabel(error);
        if (!job.signal.aborted) console.error(`flags.process flag=${flagId} failed: ${label}`);
        throw new Error(label);
      }
    },
  );
}
