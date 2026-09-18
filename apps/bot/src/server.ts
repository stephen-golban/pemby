// The HTTP surface: `GET /health` and `POST /telegram/webhook`, on `node:http`.
//
// **Secret-token verification is grammY's, not ours.** The hand-rolled constant-time check this
// service shipped with is gone, and that is a deliberate narrowing rather than a loosening:
//
//   - grammY's `compareSecretToken` is itself constant-time and length-checked first
//     (grammy/out/convenience/webhook.js), so keeping a second comparison in front bought no
//     safety — only two copies of one security rule that have to agree for ever;
//   - the "http" adapter rejects with a bare 401 *before* the body is read or an update is parsed,
//     which is what the old check achieved by draining the stream by hand;
//   - the one thing grammY does that we must not is treat an **undefined** secret as "accept
//     everything". That hole is closed one level up instead, in `env.ts`: `TELEGRAM_WEBHOOK_SECRET`
//     is required at boot, must match Telegram's alphabet and must be at least 32 characters, so
//     the process cannot reach `listen()` without one. A deploy that lost the variable fails its
//     health check and the previous one keeps serving, which is strictly better than a running
//     service answering 503 to Telegram.
//
// Verification stays mandatory, and a wrong or missing header is still a 401.

import { createServer } from "node:http";
import type { Server, ServerResponse } from "node:http";
import { webhookCallback } from "grammy";
import type { Bot } from "grammy";
import { safeErrorLabel } from "./log";
import type { BotContext } from "./types";

export const WEBHOOK_PATH = "/telegram/webhook";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export interface ServerDeps {
  bot: Bot<BotContext>;
  secretToken: string;
}

export function createBotServer(deps: ServerDeps): Server {
  const handle = webhookCallback(deps.bot, "http", {
    secretToken: deps.secretToken,
    /**
     * grammY gives a handler ten seconds and then decides what to tell Telegram. The default is
     * to throw, which leaves the response unwritten: Telegram sees a timed-out request, treats it
     * as a failure and sends the same update again. A function instead means "log it and answer
     * 2xx" — the work carries on in the background, and one slow tap does not become a queue of
     * duplicates of itself.
     */
    onTimeout: () => console.error("bot webhook: handler exceeded the 10s budget"),
  });

  return createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;

    if (req.method === "GET" && path === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && path === WEBHOOK_PATH) {
      void handle(req, res).catch((error: unknown) => {
        // Reachable only past the secret check, and only for a body that is not an Update: a
        // handler's own error is swallowed by the error boundary in `bot.ts`. Nothing of the
        // body is logged — only the shape of the failure.
        console.error(`bot webhook: ${safeErrorLabel(error)}`);
        if (res.headersSent) res.end();
        else sendJson(res, 400, { ok: false });
      });
      return;
    }

    sendJson(res, 404, { ok: false });
  });
}
