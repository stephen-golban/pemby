// Registers the delivery sweep and the channel drain on one pg-boss instance, and builds the
// senders the drain uses.
//
// Two `boss.work` calls. A channel with no credentials is simply not in the sender map, so it is
// never selected for, never drained and never logged as failing: a worker deployed before the VAPID
// keys exist is a worker that delivers Telegram and email, not one that fills the log with push
// errors.
import type { ChannelType, Db } from "@pemby/db";
import type { PgBoss } from "pg-boss";

import { safeErrorLabel } from "../cv/workers";
import { drainChannel, formatDrain, reclaim } from "./dispatch";
import type { DeliverEnv } from "./env";
import {
  DELIVER_CHANNEL_QUEUE,
  DELIVER_SWEEP_CRON,
  DELIVER_SWEEP_QUEUE,
  type DeliverChannelData,
} from "./queues";
import { createEmailSender } from "./senders/email";
import { createPushSender } from "./senders/push";
import { createTelegramSender } from "./senders/telegram";
import type { Sender } from "./senders/types";
import { dbDeliveryStore, type DeliveryStore } from "./store";

export interface DeliverWorkerDeps {
  boss: PgBoss;
  db: Db;
  env: DeliverEnv;
}

/**
 * The senders this process can actually use: switched on in `DELIVER_CHANNELS` **and** holding the
 * credentials they need.
 *
 * Built once at boot rather than per drain, because each one owns a rate limiter whose whole job is
 * to be shared: a bucket rebuilt every minute would let a full burst through every minute.
 */
export function createSenders(env: DeliverEnv): Map<ChannelType, Sender> {
  const senders = new Map<ChannelType, Sender>();

  if (env.channels.has("telegram") && env.telegramBotToken !== null) {
    senders.set(
      "telegram",
      createTelegramSender({
        token: env.telegramBotToken,
        ratePerSecond: env.telegramRatePerSecond,
      }),
    );
  }
  if (env.channels.has("email") && env.resendApiKey !== null) {
    senders.set(
      "email",
      createEmailSender({
        apiKey: env.resendApiKey,
        from: env.emailFrom,
        ratePerSecond: env.emailRatePerSecond,
      }),
    );
  }
  if (env.channels.has("push") && env.vapid !== null) {
    senders.set(
      "push",
      createPushSender({ vapid: env.vapid, ratePerSecond: env.pushRatePerSecond }),
    );
  }

  return senders;
}

/** Registers the sweep cron when DELIVER_ENABLED, and removes it otherwise (as enrich does). */
export async function scheduleDeliverSweep(boss: PgBoss, env: DeliverEnv): Promise<void> {
  if (!env.enabled) {
    await boss.unschedule(DELIVER_SWEEP_QUEUE);
    return;
  }
  await boss.schedule(DELIVER_SWEEP_QUEUE, DELIVER_SWEEP_CRON, {}, { tz: "UTC" });
}

/**
 * Registers both handlers and returns the channels this process can actually reach, so the boot log
 * reports the senders that were built rather than building a second set to count them.
 */
export async function startDeliverWorkers(deps: DeliverWorkerDeps): Promise<ChannelType[]> {
  const { boss, db, env } = deps;
  const store: DeliveryStore = dbDeliveryStore(db);
  const senders = createSenders(env);

  // The sweep never touches a provider: it releases stale claims and asks each live channel to
  // drain. Sending is `deliver.channel`'s job, so one slow provider cannot delay the others or the
  // reclaim.
  await boss.work(DELIVER_SWEEP_QUEUE, { pollingIntervalSeconds: 15 }, async () => {
    const released = await reclaim(store, env, new Date());
    // A healthy dispatcher releases none of these. A steady non-zero count means processes are
    // dying mid-send, or the cutoff is too short for a provider that got slower.
    if (released > 0) console.warn(`deliver.sweep: released ${released} stale claims`);

    let enqueued = 0;
    for (const channelType of senders.keys()) {
      const sent = await boss.send(
        DELIVER_CHANNEL_QUEUE,
        { channelType } satisfies DeliverChannelData,
        { singletonKey: channelType },
      );
      if (sent !== null) enqueued += 1;
    }
    console.log(`deliver.sweep: channels=${senders.size} enqueued=${enqueued}`);
  });

  await boss.work<DeliverChannelData>(
    DELIVER_CHANNEL_QUEUE,
    // One job at a time in this process; the queue's `exclusive` policy is what keeps two drains of
    // the same channel apart across processes. `localConcurrency` above 1 would let a Telegram and
    // an email drain overlap, which is the point of three separate singleton keys.
    { batchSize: 1, localConcurrency: senders.size || 1, pollingIntervalSeconds: 5 },
    async ([job]) => {
      if (!job) return;
      const { channelType } = job.data;
      try {
        console.log(formatDrain(await drainChannel({ store, senders, env }, channelType)));
      } catch (error) {
        // Never rethrow the original: pg-boss stores a failed job's error in `pgboss.job.output`,
        // and a driver error's message quotes its parameters — here, addresses and chat ids.
        const label = safeErrorLabel(error);
        if (!job.signal.aborted) console.error(`deliver.channel ${channelType} failed: ${label}`);
        throw new Error(label);
      }
    },
  );

  return [...senders.keys()];
}
