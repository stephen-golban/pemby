// Tracker-sync knobs. It needs exactly two things, and both are already in `.env.example` for the
// delivery dispatcher — nothing new is introduced here.
//
// TELEGRAM_BOT_TOKEN   the same bot that sent the card. Missing: the queue is still created and
//                      drained, and every job records "no telegram" and completes. A job that
//                      throws on a missing credential would retry three times and then sit in
//                      `pgboss.job` as a failure that is really a configuration fact.
// DELIVER_APP_URL      absolute origin of the web app, falling back to BETTER_AUTH_URL. The edited
//                      card gets a button through to the tracker; without an origin there is
//                      nowhere to send them, so that button is simply left off.
//
// Read here rather than through `readDeliverEnv` so this module stands on its own: the dispatcher's
// env reader throws when `DELIVER_ENABLED` is set without an app URL, and a card edit must not be
// coupled to whether sending is switched on.
export interface TrackerEnv {
  /** Never logged, never put in a job payload. */
  telegramBotToken: string | null;
  /** Absolute origin, no trailing slash, or "" when neither variable is set. */
  appUrl: string;
}

type EnvLike = Record<string, string | undefined>;

export function readTrackerEnv(env: EnvLike = process.env): TrackerEnv {
  const raw = (env.DELIVER_APP_URL ?? env.BETTER_AUTH_URL)?.trim();
  let appUrl = "";
  if (raw) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error("DELIVER_APP_URL must be an absolute URL");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("DELIVER_APP_URL must be http or https");
    }
    appUrl = `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  }
  return {
    telegramBotToken: env.TELEGRAM_BOT_TOKEN?.trim() || null,
    appUrl,
  };
}

/** One line for the boot log: what this deploy can and cannot do. No token, ever. */
export function describeTrackerEnv(env: TrackerEnv): string {
  return `tracker: telegram=${env.telegramBotToken ? "configured" : "off"} appUrl=${env.appUrl ? "set" : "unset"}`;
}
