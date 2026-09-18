// The Telegram bot service: boot, wire, listen.
//
// Everything that can be wrong with a deployment is found here, before the server accepts a single
// request. A missing environment variable, a private config that will not load and a bot token
// Telegram rejects all exit 1, so a bad deploy fails its health check and Railway keeps serving
// the previous one. The alternative — boot, then fail on the first real user's first message — is
// how a broken deploy goes unnoticed for a day.
//
// No line in this service logs a chat id, a name, a message, an address or a token.

import { PrivateConfigError, loadPrivateConfig } from "@pemby/core/private-config";
import { createDb } from "@pemby/db";
import { createBot, publishCommandMenu } from "./bot";
import { readBotEnv } from "./env";
import { botLinks } from "./links";
import { safeErrorLabel } from "./log";
import { createBotServer } from "./server";
import { createBotStore } from "./store-db";

function die(detail: string): never {
  console.error(`bot failed to start: ${detail}`);
  process.exit(1);
}

const env = (() => {
  try {
    return readBotEnv();
  } catch (error) {
    // Every message `readBotEnv` throws names a variable and never quotes its value.
    return die(error instanceof Error ? error.message : "invalid environment");
  }
})();

// Load private config at boot so a bad token, ref or layout crashes the deploy instead of the
// first update (docs/private-config.md). Log the version and counts only, never contents.
try {
  const { version, prompts, sourceLists } = await loadPrivateConfig();
  console.log(
    `private config loaded: source=${version.source} ref=${version.ref ?? "-"} id=${version.shortId} prompts=${prompts.size} sourceLists=${sourceLists.size}`,
  );
} catch (error) {
  // PrivateConfigError messages are safe to log; anything else is reduced to its name.
  const detail =
    error instanceof PrivateConfigError
      ? `${error.code}: ${error.message}`
      : `unexpected ${error instanceof Error ? error.name : "error"}`;
  console.error(`private config failed to load: ${detail}`);
  process.exit(1);
}

const db = createDb(env.databaseUrl);
const bot = createBot({
  token: env.botToken,
  store: createBotStore(db),
  links: botLinks(env.appUrl),
});

// `getMe`, once, at boot. grammY would otherwise do it lazily on the first webhook request, which
// puts a network call to Telegram in front of the first person to press a button and hides a bad
// token until then. `bot.init()` is idempotent, so the webhook middleware's own call is free.
try {
  await bot.init();
  console.log("bot initialised against the Telegram API");
} catch (error) {
  die(`telegram api unreachable or token rejected (${safeErrorLabel(error)})`);
}

await publishCommandMenu(bot);

// The webhook itself is **not** registered here, and must not be: see src/scripts/set-webhook.ts.
const server = createBotServer({ bot, secretToken: env.webhookSecret });

server.listen(env.port, () => {
  console.log(`bot listening on port ${env.port} (env: ${env.appEnv})`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`bot received ${signal}, shutting down`);
  server.close(() => {
    void db.$client.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
