import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { PrivateConfigError, loadPrivateConfig } from "@pemby/core/private-config";

const env = process.env.APP_ENV ?? "development";
const port = Number(process.env.PORT ?? 3001);

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

const SECRET_HEADER = "x-telegram-bot-api-secret-token";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Telegram sends the `secret_token` given to setWebhook in `X-Telegram-Bot-Api-Secret-Token`.
 * Both sides are hashed first so the comparison is constant-time and does not leak the length.
 */
function checkWebhookSecret(
  header: string | string[] | undefined,
): "ok" | "denied" | "misconfigured" {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return "misconfigured";
  if (typeof header !== "string" || header === "") return "denied";
  return timingSafeEqual(digest(header), digest(expected)) ? "ok" : "denied";
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;

  if (req.method === "GET" && path === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && path === "/telegram/webhook") {
    const check = checkWebhookSecret(req.headers[SECRET_HEADER]);
    if (check !== "ok") {
      // Discard the body unread; no details in the response.
      req.resume();
      sendJson(res, check === "misconfigured" ? 503 : 401, { ok: false });
      return;
    }
    // Stub: drain the body without logging it (updates contain user data).
    // grammY arrives in a later phase.
    req.resume();
    req.on("end", () => sendJson(res, 200, { ok: true }));
    return;
  }

  sendJson(res, 404, { ok: false });
});

server.listen(port, () => {
  console.log(`bot listening on port ${port} (env: ${env})`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`bot received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
