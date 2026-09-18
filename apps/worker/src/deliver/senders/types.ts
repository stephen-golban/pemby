// What a channel has to be able to do, and what it is allowed to say back.
//
// Three providers with nothing in common are reduced to two methods, so `dispatch.ts` never learns
// what a chat id or a VAPID key is. Rendering is not in here either: a sender takes the kernel's
// `MatchCard` and turns it into that provider's payload, and writes no sentences of its own.
import type { MatchCard } from "@pemby/core";
import type { ChannelDeadReason, ChannelType, DeliveryChannel } from "@pemby/db";
import type { MessageLinks } from "../links";

export interface SendRequest {
  /** Carries the address and, for push, the subscription keys. **Personal data: never logged.** */
  channel: DeliveryChannel;
  card: MatchCard;
  links: MessageLinks;
  /** Explicit clock, matching the kernel's renderers. */
  now: Date;
}

/**
 * What happened, in the only three shapes the dispatcher acts on.
 *
 * `label` is always a **sanitized** string — a status code, a provider-independent word, or
 * `safeErrorLabel`'s output. Never a provider message: Telegram's `description` quotes the request
 * and Resend's body quotes the recipient.
 */
export type SendOutcome =
  /** Accepted. `providerMessageId` is Telegram's `message_id` or Resend's id, null where there is none. */
  | { ok: true; providerMessageId: string | null }
  /**
   * Might work later: a 429, a 5xx, a timeout, a missing credential. Recorded as `failed`, which
   * releases the claim; `DELIVER_MAX_ATTEMPTS` is what stops it eventually.
   */
  | { ok: false; retryable: true; label: string }
  /**
   * Will never work for this message. `dead` names the reason the *channel* is gone, or null when
   * only this message is doomed (a payload the provider refuses) and the channel is fine.
   *
   * The distinction is the one that matters most here, and it errs towards null: killing a channel
   * over what turns out to be our own bad request silences a user permanently, and only a provider
   * verdict about the *recipient* — blocked, chat gone, subscription expired — is allowed to do it.
   */
  | { ok: false; retryable: false; dead: ChannelDeadReason | null; label: string };

export interface Sender {
  readonly type: ChannelType;
  /**
   * Resolves when this provider's rate limits allow one more message to `address`.
   *
   * Separate from `send` so the dispatcher can wait **before** it claims: a claim held through a
   * per-chat pacing wait is a claim the stale sweep might see, and a claim held for nothing is a
   * match another dispatcher cannot pick up.
   */
  acquire(address: string): Promise<void>;
  send(request: SendRequest): Promise<SendOutcome>;
}
