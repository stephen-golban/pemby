// Tracker sync (phase 09): `apps/web` enqueues `tracker.sync` when a card moves column; this
// module creates the queue and edits the already-sent Telegram card's buttons.
//
// `apps/worker/src/index.ts` wires the same four names every other module publishes:
// `readTrackerEnv()`, `createTrackerQueues(boss)`, `startTrackerWorkers({ boss, db, env })` — and no
// sweep, because nothing schedules this work; a person moving a card is what creates it.
export { describeTrackerEnv, readTrackerEnv, type TrackerEnv } from "./env";
export { TRACKER_SYNC_QUEUE, createTrackerQueues, type TrackerSyncData } from "./queues";
export {
  loadTrackerCard,
  trackerCardButtons,
  type TrackerButton,
  type TrackerCardRow,
} from "./sync";
export {
  createTelegramMarkupEditor,
  startTrackerWorkers,
  type TrackerMarkupEditor,
  type TrackerWorkerDeps,
} from "./workers";
