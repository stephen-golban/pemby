// The web push sender: `web-push` 3.6.7, VAPID, and the kernel's plain text.
//
// The payload is JSON for the service worker (order C2's `apps/web/public/sw.js`) to read in its
// `push` handler. Its shape is the whole contract between the two: a title, a body, the URL the
// notification opens, and the match id so the worker can tag and coalesce.
//
// The endpoint URL and the subscription keys are personal data — the endpoint identifies a browser
// on a device — so nothing here logs a subscription, and `safeErrorLabel` keeps `WebPushError`'s
// message (which quotes the endpoint) out of the label.
import { renderDeliveryString, renderPlainText } from "@pemby/core";
import webPush from "web-push";
import { safeErrorLabel } from "../../cv/workers";
import { PUSH_REQUEST_TIMEOUT_MS, PUSH_TTL_SECONDS, TokenBucket } from "../limits";
import type { Sender, SendOutcome, SendRequest } from "./types";

/**
 * **Both symbols come off the default export, and that is not a style choice.**
 *
 * `web-push@3.6.7` is CommonJS and builds its exports at runtime —
 * `sendNotification: webPush.sendNotification.bind(webPush)` — which Node's `cjs-module-lexer`
 * cannot see statically. So `import { sendNotification } from "web-push"` throws
 * `SyntaxError: The requested module 'web-push' does not provide an export named
 * 'sendNotification'` the moment the module is loaded. That import shape took the whole worker
 * down on staging: the chain from `src/index.ts` is static and unconditional, so the process died
 * at boot, before `DELIVER_ENABLED` was ever read, taking ingest, enrich, embed, match and the
 * owner alerts with it.
 *
 * The trap inside the trap is that **`WebPushError` resolves perfectly well as a named export**,
 * because it is assigned in a shape the lexer does recognise. Fixing only the symbol named in the
 * stack trace leaves a file that looks repaired, typechecks, and is one `web-push` release away
 * from the same outage. Both come off the default, together, so neither can drift back.
 *
 * `import * as webPush` would **not** work: for a CJS module that gives a namespace built from the
 * same failed lexer analysis, so `sendNotification` would be `undefined` at call time instead of
 * throwing at load — a worse failure, because it survives boot.
 *
 * TypeScript is no help here and was not: `@types/web-push` declares both as named exports, so the
 * broken import compiled cleanly. Nothing but loading the real module in a real Node process
 * catches this, which is why there is one in the proof run.
 */
const { sendNotification, WebPushError } = webPush;

export interface PushSenderOptions {
  vapid: { subject: string; publicKey: string; privateKey: string };
  ratePerSecond: number;
}

/**
 * The push service's verdict.
 *
 * **404 and 410 are the only permanent ones**, and the spec (RFC 8030) is explicit about them: the
 * subscription is gone and re-sending to it will never work again. `push-expired` is what
 * `channels.dead_reason` calls that.
 *
 * 413 is a payload the service refuses — our problem, not the subscription's — so the channel
 * stands and the message is retried a bounded number of times. 401 and 403 mean the VAPID keys do
 * not match the ones the subscription was created with, which is a deployment mistake that would
 * otherwise kill every push channel in one sweep; retryable, deliberately.
 */
function classify(error: unknown): SendOutcome {
  if (error instanceof WebPushError) {
    const status = error.statusCode;
    if (status === 404 || status === 410) {
      return { ok: false, retryable: false, dead: "push-expired", label: `push_${status}` };
    }
    return { ok: false, retryable: true, label: `push_${status}` };
  }
  return { ok: false, retryable: true, label: `push_${safeErrorLabel(error)}` };
}

export function createPushSender(options: PushSenderOptions): Sender {
  const bucket = new TokenBucket(options.ratePerSecond);

  return {
    type: "push",

    async acquire() {
      // Each subscription lives on its own push service and there is no published per-endpoint
      // limit, so the bucket is the whole of it.
      await bucket.take();
    },

    async send(request: SendRequest): Promise<SendOutcome> {
      const { card, channel, links, now } = request;
      if (channel.pushKeys === null) {
        // A push channel with no keys cannot be encrypted to. It is not coming back on its own —
        // the user has to subscribe again — so the channel is retired rather than retried.
        return { ok: false, retryable: false, dead: "push-expired", label: "push_no_keys" };
      }

      // The contract with `apps/web/public/sw.js` is exactly `{ title, body, url, tag }`, and both
      // of the other two fields it reads were being got wrong.
      //
      // `url` has to be **same-origin**. The service worker's `safePath` discards anything off its
      // own origin and falls back to `/brief`, which is the right rule — a payload must not be able
      // to point a notification at an arbitrary host — so sending `card.url`, the external job
      // board, meant every click landed on the generic Brief and none of them ever opened the match
      // it was about. The Brief is where a match is acted on anyway; the match id rides along in the
      // query so the page can focus the card once it learns to (it does not read it today), and
      // `safePath` preserves `pathname + search`.
      //
      // `tag` is what makes a redelivery replace its own notification instead of stacking a second
      // one. The `topic` on the web-push call below is a different thing entirely: it coalesces
      // messages still queued *at the push service*, and does nothing about a notification already
      // on someone's screen. With `requireInteraction: true` that distinction is the difference
      // between one card and a pile of them.
      const payload = JSON.stringify({
        title: renderDeliveryString("push-title-match", {
          title: card.title,
          company: card.company,
        }),
        body: renderPlainText(card, now, { passUrl: links.passUrl }),
        url: `${links.briefUrl}?match=${encodeURIComponent(card.matchId)}`,
        tag: card.matchId,
      });

      try {
        await sendNotification({ endpoint: channel.address, keys: channel.pushKeys }, payload, {
          vapidDetails: options.vapid,
          TTL: PUSH_TTL_SECONDS,
          timeout: PUSH_REQUEST_TIMEOUT_MS,
          urgency: "normal",
          // One live notification per match: a second delivery of the same match replaces the
          // first on the lock screen instead of stacking. Topic is URL-safe base64, at most 32
          // characters; a uuid with its dashes removed is 32 hex characters.
          topic: card.matchId.replace(/-/g, "").slice(0, 32),
        });
        // Push services return no message id, only a 201 and a Location header web-push discards.
        return { ok: true, providerMessageId: null };
      } catch (error) {
        return classify(error);
      }
    },
  };
}
