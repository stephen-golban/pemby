// Dispatcher knobs from the environment. Names are listed in .env.example.
//
// DELIVER_ENABLED                 "true" registers the sweep schedule; anything else removes it
//                                 (default off, like ENRICH_ENABLED, EMBED_ENABLED, MATCH_ENABLED).
// DELIVER_CHANNELS                comma-separated subset of telegram,email,push (default all three).
//                                 A channel whose credentials are missing stays off whatever this
//                                 says; this is the switch for turning a *configured* channel off.
// DELIVER_BATCH_LIMIT             messages one channel may send in one drain (1-500, default 50).
//                                 A drain runs once a minute per channel, so 50 is 72,000 a day.
// DELIVER_MAX_ATTEMPTS            `failed` rows for one (match, channel) before it is left alone
//                                 (1-10, default 3 = the kernel's DEFAULT_MAX_DELIVERY_ATTEMPTS).
// DELIVER_STALE_CLAIM_SECONDS     a claim older than this is released so a later tick may re-send
//                                 (floor STALE_CLAIM_FLOOR_SECONDS, max 3600, default 900). The
//                                 floor is not advisory: see `limits.ts` and the check below. The
//                                 kernel has a floor of its own (`MIN_STALE_CLAIM_MS`, 60 s), which
//                                 is the weaker of the two — it cannot know which providers this
//                                 process calls. This one is computed from them.
// DELIVER_TELEGRAM_RATE_PER_SECOND  global token bucket for Telegram (1-30, default 25; Bot API
//                                 allows about 30/s in bulk and there is nothing to gain from
//                                 sitting on the line).
// DELIVER_EMAIL_RATE_PER_SECOND   global token bucket for Resend (1-10, default 8; Resend's team
//                                 limit is 10 requests a second).
// DELIVER_PUSH_RATE_PER_SECOND    global token bucket for web push (1-100, default 25). Push
//                                 services publish no shared limit; this is politeness and a cap on
//                                 how fast one drain can burn its batch.
// DELIVER_APP_URL                 absolute https origin of the web app, no trailing slash. Every
//                                 link in a message is built from it. Falls back to
//                                 BETTER_AUTH_URL; required (via one of the two) when enabled.
// DELIVER_TEST_PASS_HOLDERS       comma-separated user ids treated as pass holders until phase 10
//                                 brings real passes. The only way a delivery is instant today, and
//                                 what makes the instant/delayed split provable on staging from two
//                                 accounts (`entitlementsFor`'s `testPassHolders`).
//
//                                 **The matcher reads it too.** `matches.deliver_after` is written
//                                 by `match/map.ts` from the same `entitlementsFor` call, and it is
//                                 the only thing `selectDueMatches` gates on. An allowlist that
//                                 reached the dispatcher but not the matcher would leave every row
//                                 at first_seen + 24h and no one would ever be delivered instantly,
//                                 whatever this variable said. `readTestPassHolders` below is the
//                                 one parser both modules call, so the two cannot disagree.
//
// Credentials, read here so a missing one disables its channel at boot instead of failing the first
// send. None of them is ever logged, and `describeDeliverEnv` prints names and counts only.
//
// TELEGRAM_BOT_TOKEN              already in .env.example (the bot service uses it too).
// RESEND_API_KEY, EMAIL_FROM      already in .env.example.
// VAPID_PUBLIC_KEY                web push application server key, base64url.
// VAPID_PRIVATE_KEY               its private half.
// VAPID_SUBJECT                   `mailto:` or `https:` contact for the push service, per RFC 8292.
// DELIVERY_LINK_SECRET            at least EMAIL_LINK_SECRET_MIN_LENGTH characters (32). Signs the
//                                 unsubscribe and flag links an
//                                 email carries; `apps/web`'s routes verify with the same value, so
//                                 the worker and the web service must be given the identical one.
//                                 Missing or shorter, and no link can be signed — which switches
//                                 email off rather than sending mail whose links do not work.
import { EMAIL_LINK_SECRET_MIN_LENGTH } from "@pemby/core";
import type { ChannelType } from "@pemby/db";
import { STALE_CLAIM_FLOOR_SECONDS } from "./limits";

export interface DeliverEnv {
  enabled: boolean;
  channels: ReadonlySet<ChannelType>;
  batchLimit: number;
  maxAttempts: number;
  staleClaimSeconds: number;
  telegramRatePerSecond: number;
  emailRatePerSecond: number;
  pushRatePerSecond: number;
  /** Absolute origin, no trailing slash. Empty only when delivery is off. */
  appUrl: string;
  testPassHolders: readonly string[];
  /** Secrets. Never logged, never put in a job payload, never sent to pg-boss. */
  telegramBotToken: string | null;
  resendApiKey: string | null;
  emailFrom: string;
  vapid: { subject: string; publicKey: string; privateKey: string } | null;
  /** `DELIVERY_LINK_SECRET`, or null when it is missing or too short. */
  linkSecret: string | null;
}

type EnvLike = Record<string, string | undefined>;

const CHANNEL_TYPES: readonly ChannelType[] = ["telegram", "email", "push"];

function int(env: EnvLike, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function bool(env: EnvLike, name: string): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (raw && !["true", "false", "1", "0"].includes(raw)) {
    throw new Error(`${name} must be true or false`);
  }
  return raw === "true" || raw === "1";
}

function list(env: EnvLike, name: string): string[] {
  const raw = env[name]?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function channelSet(env: EnvLike, name: string): ReadonlySet<ChannelType> {
  const raw = list(env, name);
  if (raw.length === 0) return new Set(CHANNEL_TYPES);
  const out = new Set<ChannelType>();
  for (const value of raw) {
    const channel = value.toLowerCase();
    if (!(CHANNEL_TYPES as readonly string[]).includes(channel)) {
      throw new Error(`${name} has an unknown channel "${channel}"`);
    }
    out.add(channel as ChannelType);
  }
  return out;
}

/** An absolute http(s) origin with any trailing slash removed, so `${appUrl}/brief` is safe. */
function appUrl(env: EnvLike): string {
  const raw = (env.DELIVER_APP_URL ?? env.BETTER_AUTH_URL)?.trim();
  if (!raw) return "";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("DELIVER_APP_URL must be an absolute URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("DELIVER_APP_URL must be http or https");
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

function vapid(env: EnvLike): DeliverEnv["vapid"] {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey) return null;
  if (!subject) throw new Error("VAPID_SUBJECT is required when VAPID keys are set");
  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) {
    throw new Error("VAPID_SUBJECT must be a mailto: or https:// URL (RFC 8292)");
  }
  return { subject, publicKey, privateKey };
}

/**
 * The email-link signing key, or null.
 *
 * The length rule is the kernel's own constant rather than a number repeated here, so the worker
 * that mints and the routes in `apps/web` that verify agree about whether a deployment can sign
 * links at all — instead of one of them minting tokens the other refuses.
 */
function linkSecret(env: EnvLike): string | null {
  const secret = env.DELIVERY_LINK_SECRET?.trim();
  return secret && secret.length >= EMAIL_LINK_SECRET_MIN_LENGTH ? secret : null;
}

/**
 * The pass-holder allowlist, parsed once.
 *
 * Exported because `match/env.ts` needs the identical reading of the identical variable: the
 * matcher decides *when* a match becomes due and the dispatcher decides whether the message carries
 * the PLAN D13 note, and both answers come from `entitlementsFor`. Two parsers, or two variable
 * names, would let those answers disagree — which is exactly the shape of the defect that made this
 * function exist.
 */
export function readTestPassHolders(env: EnvLike = process.env): string[] {
  return list(env, "DELIVER_TEST_PASS_HOLDERS");
}

export function readDeliverEnv(env: EnvLike = process.env): DeliverEnv {
  const enabled = bool(env, "DELIVER_ENABLED");
  const url = appUrl(env);
  if (enabled && url === "") {
    throw new Error("DELIVER_APP_URL (or BETTER_AUTH_URL) is required when DELIVER_ENABLED");
  }

  // The range check is deliberately wide and the floor is checked separately below. `int`'s own
  // message ("must be an integer from 180 to 3600") does not say why 180 is the bottom, and this is
  // the one setting where being wrong sends people the same message twice.
  const staleClaimSeconds = int(env, "DELIVER_STALE_CLAIM_SECONDS", 900, 1, 3600);
  if (staleClaimSeconds < STALE_CLAIM_FLOOR_SECONDS) {
    throw new Error(
      `DELIVER_STALE_CLAIM_SECONDS must be at least ${STALE_CLAIM_FLOOR_SECONDS}: a claim released ` +
        `while its provider call is still in flight makes the next tick send the same card again`,
    );
  }

  return {
    enabled,
    channels: channelSet(env, "DELIVER_CHANNELS"),
    batchLimit: int(env, "DELIVER_BATCH_LIMIT", 50, 1, 500),
    maxAttempts: int(env, "DELIVER_MAX_ATTEMPTS", 3, 1, 10),
    staleClaimSeconds,
    telegramRatePerSecond: int(env, "DELIVER_TELEGRAM_RATE_PER_SECOND", 25, 1, 30),
    emailRatePerSecond: int(env, "DELIVER_EMAIL_RATE_PER_SECOND", 8, 1, 10),
    pushRatePerSecond: int(env, "DELIVER_PUSH_RATE_PER_SECOND", 25, 1, 100),
    appUrl: url,
    testPassHolders: readTestPassHolders(env),
    telegramBotToken: env.TELEGRAM_BOT_TOKEN?.trim() || null,
    resendApiKey: env.RESEND_API_KEY?.trim() || null,
    emailFrom: env.EMAIL_FROM?.trim() || "Pemby <hello@pemby.app>",
    vapid: vapid(env),
    linkSecret: linkSecret(env),
  };
}

/**
 * One line for the boot log: which channels are on, and the knobs. Names and counts only — no
 * token, no key, no address, and `testPassHolders` is a count rather than a list of user ids.
 */
export function describeDeliverEnv(env: DeliverEnv, live: readonly ChannelType[]): string {
  return [
    `deliver: ${env.enabled ? "enabled" : "disabled"}`,
    `channels=${live.length > 0 ? live.join(",") : "-"}`,
    `batchLimit=${env.batchLimit}`,
    `maxAttempts=${env.maxAttempts}`,
    `staleClaim=${env.staleClaimSeconds}s`,
    `testPassHolders=${env.testPassHolders.length}`,
  ].join(" ");
}
