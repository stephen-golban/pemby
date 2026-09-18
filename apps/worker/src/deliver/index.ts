// The dispatcher (phase 08): two queues, the sweep, the per-channel drain and the three senders.
// `apps/worker/src/index.ts` wires four names from here, shaped like their `enrich`, `embed` and
// `match` equivalents: `readDeliverEnv()`, `createDeliverQueues(boss)`,
// `startDeliverWorkers({ boss, db, env })` and `scheduleDeliverSweep(boss, env)`.
//
// Nothing here renders a message, encodes a callback, decides quiet hours or writes a delivery
// query: all of that is the kernel's, in `@pemby/core`'s `delivery/` and `@pemby/db`'s
// `queries/delivery.ts`. This module is the part that has to talk to three providers and to pg-boss,
// which is exactly what the kernel is not allowed to do.
//
// Matching never calls a model and neither does delivery, so `@pemby/ai` is not a dependency.
export { readDeliverEnv, describeDeliverEnv, type DeliverEnv } from "./env";
export {
  DELIVER_CHANNEL_QUEUE,
  DELIVER_SWEEP_CRON,
  DELIVER_SWEEP_QUEUE,
  createDeliverQueues,
  type DeliverChannelData,
} from "./queues";
export {
  DRAIN_BUDGET_MS,
  describeDeliverError,
  drainChannel,
  formatDrain,
  reclaim,
  type DrainDeps,
  type DrainResult,
} from "./dispatch";
export { formatSalary, toMatchCard, type CardParams } from "./card";
export { buildMessageLinks, type LinkParams, type MessageLinks } from "./links";
export {
  LONGEST_PROVIDER_WALL_MS,
  PerKeyPacer,
  STALE_CLAIM_FLOOR_SECONDS,
  TokenBucket,
} from "./limits";
export { dbDeliveryStore, type DeliveryStore, type EntitlementInput } from "./store";
export { createEmailSender } from "./senders/email";
export { createPushSender } from "./senders/push";
export { createTelegramSender } from "./senders/telegram";
export type { Sender, SendOutcome, SendRequest } from "./senders/types";
export {
  createSenders,
  scheduleDeliverSweep,
  startDeliverWorkers,
  type DeliverWorkerDeps,
} from "./workers";
