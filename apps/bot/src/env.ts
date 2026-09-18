// The bot service's environment. Names only; values live in Railway (see `.env.example`).
//
// Everything required is read once, at boot, and a missing value throws before the server listens.
// That is deliberate for `TELEGRAM_WEBHOOK_SECRET` in particular: grammY's `webhookCallback`
// treats an *undefined* `secretToken` as "no token configured, accept all requests"
// (`compareSecretToken` in grammy/out/convenience/webhook.js returns true for `undefined`), so a
// deploy that lost the variable would serve an unauthenticated webhook rather than refuse one.
// Crashing at boot means Railway's health check fails and the previous deployment keeps serving.

export interface BotEnv {
  /** production | staging | development. Logged; never used to relax a check. */
  appEnv: string;
  port: number;
  databaseUrl: string;
  botToken: string;
  /** Compared against `X-Telegram-Bot-Api-Secret-Token` on every webhook request. */
  webhookSecret: string;
  /** Public origin of the web app, no trailing slash. Every link the bot sends hangs off it. */
  appUrl: string;
}

/** Telegram's own rule for `secret_token`: 1-256 characters of `A-Z a-z 0-9 _ -`. */
const SECRET_RE = /^[A-Za-z0-9_-]{1,256}$/;

/** Ours, on top of Telegram's: a 16-character secret is not a secret. */
const MIN_SECRET_CHARS = 32;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function readBotEnv(): BotEnv {
  const webhookSecret = required("TELEGRAM_WEBHOOK_SECRET");
  if (!SECRET_RE.test(webhookSecret)) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET must be 1-256 characters of A-Z a-z 0-9 _ -");
  }
  if (webhookSecret.length < MIN_SECRET_CHARS) {
    throw new Error(`TELEGRAM_WEBHOOK_SECRET must be at least ${MIN_SECRET_CHARS} characters`);
  }

  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be a port number");
  }

  return {
    appEnv: process.env.APP_ENV?.trim() || "development",
    port,
    databaseUrl: required("DATABASE_URL"),
    botToken: required("TELEGRAM_BOT_TOKEN"),
    webhookSecret,
    // `BETTER_AUTH_URL` is documented in `.env.example` as the public origin of the web app, which
    // is exactly what a link in a chat message needs. A second variable for the same fact is a
    // second thing to get wrong, so the bot reuses it rather than inventing `APP_URL`.
    appUrl: (process.env.BETTER_AUTH_URL?.trim() || "https://pemby.app").replace(/\/+$/, ""),
  };
}
