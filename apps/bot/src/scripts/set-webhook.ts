// Point Telegram at this service. Run by hand, never on boot.
//
//   pnpm --filter @pemby/bot webhook:set https://bot-staging-xxxx.up.railway.app
//   pnpm --filter @pemby/bot webhook:set https://bot-staging-xxxx.up.railway.app --drop-pending
//
// **Why this is not part of starting the service.** A bot token has exactly one webhook, globally.
// If every boot called `setWebhook` with its own public URL, then staging booting would silently
// steal production's updates, a preview deploy would steal staging's, and a crash-looping deploy
// would re-register on every restart. One token, one webhook, one deliberate act.
//
// **`allowed_updates` is always sent in full.** The Bot API says: *"If not specified, the previous
// setting will be used."* Omitting it does not reset it, so a wrong list set once stays wrong for
// ever, and the symptom — a class of update that simply never arrives — looks exactly like a bug
// in the handler. The three below are all this bot has handlers for: `message` for commands,
// `callback_query` for the buttons on a card, and `my_chat_member` for a block or an unblock.

import { Bot } from "grammy";

/** Every update type this service has a handler for, and nothing else. */
const ALLOWED_UPDATES = ["message", "callback_query", "my_chat_member"] as const;

const WEBHOOK_PATH = "/telegram/webhook";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function webhookUrl(origin: string): URL {
  try {
    return new URL(origin.replace(/\/+$/, "") + WEBHOOK_PATH);
  } catch {
    fail("the first argument must be an absolute URL, e.g. https://bot.example.com");
  }
}

const [, , origin, ...flags] = process.argv;
if (!origin) fail("usage: webhook:set <https://bot-host> [--drop-pending]");

const url = webhookUrl(origin);
// Telegram refuses a plaintext webhook, and so should we: the secret token travels in a header.
if (url.protocol !== "https:") fail("the webhook URL must be https");

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
if (!token) fail("TELEGRAM_BOT_TOKEN is not set");
if (!secretToken) fail("TELEGRAM_WEBHOOK_SECRET is not set");

const bot = new Bot(token);

await bot.api.setWebhook(url.toString(), {
  secret_token: secretToken,
  allowed_updates: [...ALLOWED_UPDATES],
  drop_pending_updates: flags.includes("--drop-pending"),
});

// Read it back rather than trusting the call: this is the one command in the repo whose effect is
// invisible from inside the product until a message fails to arrive.
const info = await bot.api.getWebhookInfo();
console.log(
  [
    `webhook set: url=${info.url}`,
    `allowed=${(info.allowed_updates ?? ALLOWED_UPDATES).join(",")}`,
    `pending=${info.pending_update_count}`,
    `custom_certificate=${info.has_custom_certificate}`,
    info.last_error_date ? `last_error_date=${info.last_error_date}` : "last_error=none",
  ].join(" "),
);
