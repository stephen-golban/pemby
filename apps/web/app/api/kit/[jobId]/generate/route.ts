// `POST /api/kit/:jobId/generate` — one application kit, streamed as it is written (PLAN D9).
//
// ## The transport, and why it is hand-rolled
//
// This route builds its own `ReadableStream` of NDJSON and does not touch the AI SDK's response
// helpers. Four facts decided that, in this order:
//
//  1. **`runStreamingStructuredTask` never hands the caller a `StreamTextResult`.** It owns the
//     `streamText` call, awaits `onPartial` inside its own read loop so two partials can never
//     overlap, prices the attempt, writes the `ai_usage` row and falls back to the non-streaming
//     chain when the stream fails. There is no `result` object here to pass to
//     `createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) })`,
//     so the non-deprecated SDK path is not reachable from a route handler at all. Reaching it
//     would mean calling `streamText` here, which would mean building an OpenRouter provider here,
//     which the phase-09 contract forbids outright: every kit request goes through
//     `getOpenRouter(...)` in `@pemby/ai`, because `withEnforcedZdr` — not the SDK's types — is
//     what guarantees `provider: { zdr: true }` on a request carrying a CV.
//  2. At the pinned `ai@7.0.101`, `toDataStreamResponse` does not exist (that is v4), and
//     `toUIMessageStreamResponse`, `toTextStreamResponse` and both `pipe*` methods are `@deprecated`
//     on disk. Building on a deprecated surface to avoid writing fifteen lines is a poor trade.
//  3. `useChat` lives in `@ai-sdk/react`, which is **not installed**. A kit is one-shot structured
//     generation of three named sections, not a message thread; adding a chat runtime and its
//     message-part protocol to render three sections would be a dependency bought for nothing.
//  4. What this stream actually carries is not text. It is a **partial object** — bullets, a
//     letter and answers arriving in parallel — so a text-delta protocol would have the client
//     re-parsing JSON it had just been handed as JSON.
//
// So: `application/x-ndjson`, one JSON object per line, typed by `KitStreamEvent`. The client reads
// it with `fetch` and a byte reader. No dependency, no deprecation, no protocol to translate.
//
// ## Where errors go
//
// A failure **before** the stream starts is an ordinary HTTP status with `{ "error": "<code>" }` —
// the reader is out of quota, has no CV, has not answered their defaults. A failure **after** the
// response has already returned 200 has no status left to send, so it travels as an `error` event
// and the stream then closes normally. Both carry the same `KIT_ERRORS` codes, so the client has
// one mapping rather than two.

import { planKitRun, runKit } from "../../_lib/generate";
import { authorize, fail, isUuid, statusFor } from "../../_lib/http";
import type { KitStreamEvent } from "../../_lib/view";

export const dynamic = "force-dynamic";
/** Node, not edge: `@pemby/db` speaks to Postgres over `pg` and `@pemby/ai` reads the private config. */
export const runtime = "nodejs";

/**
 * Shortest gap between two partial frames.
 *
 * `onPartial` fires on every parse of the growing document, which for a cover letter is hundreds of
 * times. The stream awaits each callback, so an unthrottled writer would spend the generation
 * serializing near-identical objects and the browser would spend it re-rendering them. 100ms is
 * under the threshold at which text stops looking live and well above the cost of a frame.
 */
const PARTIAL_INTERVAL_MS = 100;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const { jobId } = await params;
  if (!isUuid(jobId)) return fail("invalid_request");

  const now = new Date();
  const preflight = await planKitRun(auth.session.user.id, jobId, now);
  if (!preflight.ok) return fail(preflight.error, statusFor(preflight.error));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: KitStreamEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      // Before a single token: the machine-readable marking Art. 50(2) asks for, so a consumer of
      // this stream knows what it is receiving before it receives any of it rather than after.
      send({ type: "disclosure", aiGenerated: true });

      let lastSentAt = 0;
      try {
        const result = await runKit(preflight.plan, {
          now,
          signal: request.signal,
          onPartial: (content) => {
            const at = Date.now();
            if (at - lastSentAt < PARTIAL_INTERVAL_MS) return;
            lastSentAt = at;
            send({ type: "partial", content });
          },
        });

        if (result.ok) send({ type: "done", kit: result.kit, quota: result.quota });
        else send({ type: "error", error: result.error });
      } catch {
        // `runKit` turns every failure it understands into a code. Anything reaching here is a bug
        // or a dropped connection, and it is answered with a code rather than a stack: this stream
        // is read by a browser, and the errors of a route that handles CVs never carry detail.
        send({ type: "error", error: "unavailable" });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Railway fronts this app with a proxy; without it a buffering hop holds the whole stream
      // and delivers it as one lump, which looks exactly like a generation that took 20 seconds.
      "X-Accel-Buffering": "no",
    },
  });
}
