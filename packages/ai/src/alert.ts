// Owner alert when the daily AI cap is reached (PLAN D18): Telegram first, Resend email as the
// fallback, at most once per UTC day. The once-per-day claim is injected (`claimCapAlert` in
// `@pemby/db`) so this package never imports the database. Messages carry amounts only.
import { nextUtcMidnight, utcDay } from "./cost";
import type { EnvLike } from "./keys";

export type CapAlertChannel = "telegram" | "email" | "none";

export interface CapAlertClaimInput {
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  spentUsd: number;
  capUsd: number;
  /** The channel the alert will try first. */
  channel: CapAlertChannel;
}

/**
 * Returns true when this caller may send the day's alert: the first claim of the UTC day, or a
 * re-claim once an undelivered claim is 15 minutes old (`claimCapAlert` in `@pemby/db`).
 */
export type CapAlertClaim = (input: CapAlertClaimInput) => Promise<boolean>;

/** Closes the day's claim after a successful delivery (`markCapAlertDelivered` in `@pemby/db`). */
export type CapAlertMarkDelivered = (input: {
  day: string;
  deliveredVia: Exclude<CapAlertChannel, "none">;
}) => Promise<void>;

export interface CapAlertOptions {
  /** A Date is reduced to its UTC day. */
  day: Date | string;
  spentUsd: number;
  capUsd: number;
  claim: CapAlertClaim;
  /**
   * Called only after Telegram or email accepted the alert. Never called when every channel fails,
   * so the claim stays open and another process may retry after 15 minutes.
   */
  markDelivered?: CapAlertMarkDelivered;
  env?: EnvLike;
  fetch?: typeof globalThis.fetch;
}

export interface CapAlertResult {
  /** False when another process already alerted today; nothing was sent. */
  claimed: boolean;
  /** Where the alert was delivered, or "none" if no channel is configured or every channel failed. */
  deliveredVia: CapAlertChannel;
  /** Safe failure notes (channel and HTTP status only). */
  failures: string[];
}

// docs/SETUP.md step 6: the Resend domain is `pemby.app` (verified; DKIM, `send.` and DMARC resolve).
// "Resend sends from the `send.pemby.app` subdomain" there is the Return-Path: Resend uses the
// `send` subdomain for the Return-Path by default
// (https://resend.com/docs/dashboard/domains/custom-return-path), and `send.pemby.app` is not a
// verified sending domain itself. The visible From address is therefore on `pemby.app`.
const RESEND_FROM = "Pemby alerts <alerts@pemby.app>";
const REQUEST_TIMEOUT_MS = 10_000;

function capMessage(day: string, spentUsd: number, capUsd: number): string {
  const resume = nextUtcMidnight(new Date(`${day}T00:00:00Z`))
    .toISOString()
    .slice(0, 16);
  return [
    `Pemby: the daily AI cap was reached on ${day} (UTC).`,
    `Spend: $${spentUsd.toFixed(4)} of the $${capUsd.toFixed(2)} cap.`,
    `New AI work is queued until 00:00 UTC (${resume.replace("T", " ")} UTC).`,
  ].join("\n");
}

function ownerEmail(env: EnvLike): string | null {
  const explicit = env.OWNER_ALERT_EMAIL?.trim();
  if (explicit) return explicit;
  const first = env.OWNER_ALLOWLIST_EMAILS?.split(",")[0]?.trim();
  return first ? first : null;
}

async function sendTelegram(
  fetchFn: typeof globalThis.fetch,
  token: string,
  chatId: string,
  text: string,
): Promise<string | null> {
  try {
    const response = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as { ok?: unknown } | null;
    return response.ok && body?.ok === true ? null : `telegram HTTP ${response.status}`;
  } catch (error) {
    // The fetch error can quote the URL, which holds the bot token: keep only its name.
    return `telegram ${error instanceof Error ? error.name : "error"}`;
  }
}

async function sendEmail(
  fetchFn: typeof globalThis.fetch,
  apiKey: string,
  to: string,
  day: string,
  text: string,
): Promise<string | null> {
  try {
    const response = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": `ai-cap-alert-${day}`,
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to,
        subject: `Pemby: daily AI cap reached (${day})`,
        text,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    await response.body?.cancel().catch(() => undefined);
    return response.ok ? null : `email HTTP ${response.status}`;
  } catch (error) {
    return `email ${error instanceof Error ? error.name : "error"}`;
  }
}

/**
 * Claims the day's alert, then sends it: Telegram (`TELEGRAM_BOT_TOKEN` to `OWNER_TELEGRAM_CHAT_ID`),
 * else email through Resend (`RESEND_API_KEY` to `OWNER_ALERT_EMAIL`, or the first
 * `OWNER_ALLOWLIST_EMAILS` entry). On success it calls `markDelivered`; on failure it leaves the
 * claim open for a retry after 15 minutes. Never throws for a delivery failure; errors from `claim`
 * and `markDelivered` (database) propagate.
 */
export async function alertOwnerCapReached(options: CapAlertOptions): Promise<CapAlertResult> {
  const env = options.env ?? process.env;
  const fetchFn = options.fetch ?? globalThis.fetch;
  const day = typeof options.day === "string" ? options.day : utcDay(options.day);

  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.OWNER_TELEGRAM_CHAT_ID?.trim();
  const resendKey = env.RESEND_API_KEY?.trim();
  const email = ownerEmail(env);
  const telegramReady = Boolean(token && chatId);
  const emailReady = Boolean(resendKey && email);

  const planned: CapAlertChannel = telegramReady ? "telegram" : emailReady ? "email" : "none";
  const claimed = await options.claim({
    day,
    spentUsd: options.spentUsd,
    capUsd: options.capUsd,
    channel: planned,
  });
  if (!claimed) return { claimed: false, deliveredVia: "none", failures: [] };

  const text = capMessage(day, options.spentUsd, options.capUsd);
  const failures: string[] = [];
  if (token && chatId) {
    const failure = await sendTelegram(fetchFn, token, chatId, text);
    if (failure === null) {
      await options.markDelivered?.({ day, deliveredVia: "telegram" });
      return { claimed: true, deliveredVia: "telegram", failures };
    }
    failures.push(failure);
  } else {
    failures.push("telegram not configured");
  }
  if (resendKey && email) {
    const failure = await sendEmail(fetchFn, resendKey, email, day, text);
    if (failure === null) {
      await options.markDelivered?.({ day, deliveredVia: "email" });
      return { claimed: true, deliveredVia: "email", failures };
    }
    failures.push(failure);
  } else {
    failures.push("email not configured");
  }
  return { claimed: true, deliveredVia: "none", failures };
}
