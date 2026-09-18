// Rate limits and provider time budgets, in one place because two very different things read them.
//
// The senders read the timeouts. `env.ts` reads `STALE_CLAIM_FLOOR_SECONDS`, which is derived from
// them: the claim a dispatcher holds while a provider call is in flight must outlive the longest
// that call can possibly take, or `reclaimStaleDeliveries` pulls the claim out from under a send
// that is still running and the next tick sends the same card again. The kernel documents that
// requirement (`packages/db/src/queries/delivery.ts`) but cannot enforce it — it does not know
// which providers the caller uses. This file is where the two numbers meet, so the floor cannot
// drift away from the timeouts by someone editing one of them.

/** Telegram: one HTTP call's own deadline, before `autoRetry` gets involved. */
export const TELEGRAM_REQUEST_TIMEOUT_SECONDS = 15;

/**
 * `@grammyjs/auto-retry` defaults to unlimited attempts and unlimited `retry_after`, which would
 * make the worst case unbounded and therefore make the floor below unbounded too. Both are capped.
 *
 * The cap is on how long we are willing to *wait*, never a reason to ignore a 429: a `retry_after`
 * inside the cap is honoured exactly, and one beyond it fails the send, which the dispatcher then
 * records as a retryable failure and picks up on a later tick. No delay is ever added on top.
 */
export const TELEGRAM_MAX_RETRY_ATTEMPTS = 3;
export const TELEGRAM_MAX_RETRY_DELAY_SECONDS = 30;

/** Bot API: about one message a second to the same chat. */
export const TELEGRAM_PER_CHAT_INTERVAL_MS = 1_000;

/** Resend's 10 s, the same deadline `apps/web/lib/email/resend.ts` uses. */
export const EMAIL_REQUEST_TIMEOUT_MS = 10_000;

/** `web-push` socket timeout. Push services are usually fast; a stuck socket is the failure mode. */
export const PUSH_REQUEST_TIMEOUT_MS = 15_000;

/** How long a push service should hold an undelivered notification. One delivery window. */
export const PUSH_TTL_SECONDS = 4 * 3600;

/**
 * The longest one `send()` can take, over every provider.
 *
 * Telegram is the worst of the three because `autoRetry` may run the request again: the first
 * attempt plus `TELEGRAM_MAX_RETRY_ATTEMPTS` more, each with its own timeout, separated by waits of
 * at most `TELEGRAM_MAX_RETRY_DELAY_SECONDS`.
 */
const TELEGRAM_WORST_CASE_MS =
  TELEGRAM_REQUEST_TIMEOUT_SECONDS * 1_000 * (1 + TELEGRAM_MAX_RETRY_ATTEMPTS) +
  TELEGRAM_MAX_RETRY_DELAY_SECONDS * 1_000 * TELEGRAM_MAX_RETRY_ATTEMPTS;

export const LONGEST_PROVIDER_WALL_MS = Math.max(
  TELEGRAM_WORST_CASE_MS,
  EMAIL_REQUEST_TIMEOUT_MS,
  PUSH_REQUEST_TIMEOUT_MS,
);

/**
 * The smallest stale-claim cutoff `readDeliverEnv` will accept, in seconds.
 *
 * `LONGEST_PROVIDER_WALL_MS` plus a margin for the round trip to Postgres on either side of the
 * call. Below this, a slow-but-alive send is indistinguishable from a crashed one and the sweep
 * manufactures the duplicate it exists to prevent.
 */
export const STALE_CLAIM_FLOOR_SECONDS = Math.ceil(LONGEST_PROVIDER_WALL_MS / 1_000) + 30;

const sleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A token bucket: at most `perSecond` messages a second across the whole process, with a burst of
 * `perSecond`.
 *
 * Continuous refill rather than a fixed window, because a fixed window lets 2x the limit through
 * across a window boundary — exactly the burst a provider's own limiter counts. `take()` resolves
 * when a token is available; callers await it before they claim, so no claim is held while waiting.
 *
 * Only ever an approximation of the provider's limiter, which is why `autoRetry` sits behind it on
 * Telegram and a 429 is a first-class outcome on the other two. This is politeness; the 429
 * handling is correctness.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;
  private readonly capacity: number;

  constructor(
    private readonly perSecond: number,
    private readonly clock: () => number = Date.now,
  ) {
    this.capacity = Math.max(1, perSecond);
    this.tokens = this.capacity;
    this.last = clock();
  }

  private refill(): void {
    const now = this.clock();
    const elapsed = Math.max(0, now - this.last);
    this.last = now;
    this.tokens = Math.min(this.capacity, this.tokens + (elapsed * this.perSecond) / 1_000);
  }

  async take(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = Math.ceil(((1 - this.tokens) / this.perSecond) * 1_000);
    await sleep(waitMs);
    this.refill();
    // One token is now owed to this caller whatever the arithmetic rounded to; going slightly
    // negative is how a queue of waiters stays in order instead of all resuming at once.
    this.tokens -= 1;
  }
}

/**
 * A minimum gap between two messages to the same key — the Telegram chat id, which is personal
 * data and is therefore used as a map key and never logged.
 *
 * The map is pruned of entries whose gap has long passed, so a process that runs for weeks does not
 * accumulate one entry per chat it has ever written to.
 */
export class PerKeyPacer {
  private readonly nextAllowed = new Map<string, number>();

  constructor(
    private readonly intervalMs: number,
    private readonly clock: () => number = Date.now,
  ) {}

  async wait(key: string): Promise<void> {
    const now = this.clock();
    if (this.nextAllowed.size > 1_000) this.prune(now);
    const earliest = this.nextAllowed.get(key) ?? 0;
    const at = Math.max(now, earliest);
    this.nextAllowed.set(key, at + this.intervalMs);
    await sleep(at - now);
  }

  private prune(now: number): void {
    for (const [key, at] of this.nextAllowed) {
      if (at <= now) this.nextAllowed.delete(key);
    }
  }
}
