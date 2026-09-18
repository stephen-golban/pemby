// `pnpm --filter @pemby/worker deliver:once [telegram|email|push] [--dry]` — one drain, now,
// without waiting for the cron.
//
// The same shape as `match:once`: it runs the real code against the real database, so it is how the
// staging checkpoints get driven (the owner's own Telegram, the instant-versus-delayed split, a
// held-then-released message) without watching a once-a-minute schedule. It registers nothing on
// pg-boss and needs no queue.
//
// **`--dry` writes nothing and sends nothing.** It swaps in senders that report success without
// calling a provider *and* a store whose writes are all no-ops, so a preview cannot claim a match,
// stamp `matches.<channel>_delivered_at` or leave a `delivery_log` row saying a message went out
// that never did. An earlier version only stubbed the senders, which meant `--dry` permanently
// marked every due match as delivered on all three channels — the opposite of what the flag says.
//
// **Never on production.** Not as a matter of prose: `APP_ENV=production` refuses to run at all.
// This script bypasses the sweep, the queue and the once-per-channel exclusivity that keep two
// dispatchers apart, and a real run of it sends real messages to real people.
import { createDb } from "@pemby/db";
import type { ChannelType } from "@pemby/db";
import { drainChannel, formatDrain } from "./dispatch";
import { readDeliverEnv } from "./env";
import type { Sender } from "./senders/types";
import { dbDeliveryStore, type DeliveryStore } from "./store";
import { createSenders } from "./workers";

const CHANNELS: readonly ChannelType[] = ["telegram", "email", "push"];

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const asked = args.filter((a) => !a.startsWith("--"));

if ((process.env.APP_ENV ?? "development") === "production") {
  console.error("deliver:once does not run on production");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const env = readDeliverEnv();
// `readDeliverEnv` only insists on an app url when DELIVER_ENABLED is set, and this script runs
// whether the cron is on or not. Without one every link in a message would be a bare path.
if (env.appUrl === "") {
  console.error("DELIVER_APP_URL (or BETTER_AUTH_URL) must be set to run a drain");
  process.exit(1);
}

const db = createDb(databaseUrl, { max: 4, application_name: "pemby-deliver-once" });

/** Accepts everything, calls nothing. */
const dryRunSender = (type: ChannelType): Sender => ({
  type,
  async acquire() {},
  async send() {
    return { ok: true, providerMessageId: "dry-run" };
  },
});

/**
 * The real reads, and writes that do nothing.
 *
 * `claim` has to return *something* or the drain stops at the first row and the preview shows an
 * empty batch, so it returns an id no row was ever written for. Nothing downstream can misuse it:
 * every method that would take that id is a no-op here too.
 */
function previewStore(real: DeliveryStore): DeliveryStore {
  return {
    selectDue: real.selectDue,
    selectChannels: real.selectChannels,
    entitlementInputs: real.entitlementInputs,
    pausedAt: real.pausedAt,
    async claim() {
      return { deliveryId: "dry-run" };
    },
    async recordSent() {
      return { recorded: true };
    },
    async fail() {
      return true;
    },
    async skip() {
      return true;
    },
    async markDead() {},
    async reclaimStale() {
      return 0;
    },
  };
}

try {
  // `DELIVER_CHANNELS` is honoured in both modes; credentials are what a dry run does without.
  const senders = dry
    ? new Map<ChannelType, Sender>(
        CHANNELS.filter((c) => env.channels.has(c)).map((c) => [c, dryRunSender(c)]),
      )
    : createSenders(env);

  const channels = (asked.length > 0 ? asked : [...senders.keys()]).filter((c): c is ChannelType =>
    (CHANNELS as readonly string[]).includes(c),
  );
  if (channels.length === 0) {
    console.error(`no channel to drain (configured: ${[...senders.keys()].join(",") || "none"})`);
    process.exit(1);
  }

  console.log(
    `deliver:once${dry ? " (dry run: nothing sent, nothing written)" : ""} channels=${channels.join(",")}`,
  );
  const real = dbDeliveryStore(db);
  const store = dry ? previewStore(real) : real;
  for (const channelType of channels) {
    console.log(formatDrain(await drainChannel({ store, senders, env }, channelType)));
  }
} finally {
  await db.$client.end().catch(() => undefined);
}
