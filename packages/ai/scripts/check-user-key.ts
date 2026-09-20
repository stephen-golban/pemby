// Runs the user-key codec and the 402 taxonomy for real. No network, no real keys, no model.
// Usage: pnpm --filter @pemby/ai check:user-key
//
// Same shape as `check-zdr.ts`, and — after a blind review found the first version of this file was
// not — the same **method**: the 402 section scripts `globalThis.fetch` and drives the real AI SDK
// and the real OpenRouter provider, so every error object asserted against here was built by
// `ai@7.0.101`, not by hand.
//
// That distinction was the defect. The first version asserted the mid-stream 402 case against a
// hand-built `{ code, message, metadata }` object, which classified correctly and proved nothing:
// in production `ai` wraps a post-200 provider error in a `StreamProviderError`, which **is** an
// `Error` and is **not** an `APICallError`, so the real object fell through to `describeFailure`
// and came out as `{status: null, errorType: "network"}`. Every mid-stream 402 was invisible while
// this script printed `ok`. A fixture cannot fail that way; a real object can, and did.
//
// What this still does not cover: no real OpenRouter response has been seen here, so if OpenRouter
// changes where it puts `limit_source`, these assertions keep passing and production stops
// classifying. And nothing here writes a blob to a database column.
//
// The secrets below are literal test values generated for this script. They encrypt nothing that
// exists, decrypt nothing that is stored, and are not the shape of any real key.
import { generateText, streamText } from "ai";
import { z } from "zod";

import {
  AiCallError,
  DEFAULT_ROUTING,
  UserKeyError,
  USER_KEY_SECRET_VAR,
  createDailyCapGuard,
  decryptUserKey,
  encryptUserKey,
  getOpenRouter,
  paymentRequiredKindOf,
  runStreamingStructuredTask,
  userKeyHash,
  type AiUsageEntry,
  type CostLedger,
} from "../src";
import { describeFailure } from "../src/structured";

let failed = false;
function check(label: string, ok: boolean): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failed = true;
}

/** Throws, and the throw is a `UserKeyError` with this reason. */
function throwsWith(reason: string, run: () => unknown): { ok: boolean; got: string } {
  try {
    run();
    return { ok: false, got: "returned a value" };
  } catch (error) {
    if (error instanceof UserKeyError) return { ok: error.reason === reason, got: error.reason };
    return { ok: false, got: error instanceof Error ? error.name : "unknown" };
  }
}

// ================================================================== the user-key codec

const env32 = { [USER_KEY_SECRET_VAR]: Buffer.alloc(32, 7).toString("base64") };
const other32 = { [USER_KEY_SECRET_VAR]: Buffer.alloc(32, 9).toString("base64") };
// 24 bytes of base64 is exactly 32 characters — the silent-downgrade footgun. It must be refused.
const env24 = { [USER_KEY_SECRET_VAR]: Buffer.alloc(24, 7).toString("base64") };
// Deliberately **not** shaped like an OpenRouter key. The codec is bytes in, bytes out and does not
// care what the plaintext looks like, so no assertion here needs the real prefix — and a literal
// carrying it would match the key-shaped pre-commit grep in `docs/conventions.md` on every run. A
// guard that always fires is a guard people stop reading, and the next line to match might be a
// real key. Same length as a real one, so the layout assertion below covers a realistic ciphertext.
const PLAINTEXT = "PLACEHOLDER-not-a-key-000000000000";

console.log("\n-- the secret --");
check(
  `a 32-byte secret is ${env32[USER_KEY_SECRET_VAR]?.length} base64 chars and is accepted`,
  typeof encryptUserKey(PLAINTEXT, env32) === "string",
);
const short = throwsWith("secret-invalid", () => encryptUserKey(PLAINTEXT, env24));
check(
  `a 24-byte secret (${env24[USER_KEY_SECRET_VAR]?.length} base64 chars, a valid 32-byte key if read as utf8) is REFUSED: ${short.got}`,
  short.ok,
);
const missing = throwsWith("secret-missing", () => encryptUserKey(PLAINTEXT, {}));
check(`a missing secret is refused, not defaulted: ${missing.got}`, missing.ok);

console.log("\n-- encrypt / decrypt --");
const blob = encryptUserKey(PLAINTEXT, env32);
const raw = Buffer.from(blob, "base64");
check(
  `layout: version=${raw[0]} iv=12 tag=16 ciphertext=${raw.length - 29} (total ${raw.length} bytes, ${blob.length} base64 chars)`,
  raw[0] === 1 && raw.length === 1 + 12 + 16 + Buffer.byteLength(PLAINTEXT, "utf8"),
);
check(`round trip returns the same key`, decryptUserKey(blob, env32) === PLAINTEXT);

const second = encryptUserKey(PLAINTEXT, env32);
const ivOf = (value: string) => Buffer.from(value, "base64").subarray(1, 13).toString("hex");
check(
  `two encryptions of the same key differ (IV freshness): ${ivOf(blob).slice(0, 12)}… vs ${ivOf(second).slice(0, 12)}…`,
  blob !== second && ivOf(blob) !== ivOf(second) && decryptUserKey(second, env32) === PLAINTEXT,
);

const tampered = Buffer.from(raw);
// One flipped bit in the ciphertext, which is the whole point of an authenticated cipher.
tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0x01;
const flipped = throwsWith("auth-failed", () => decryptUserKey(tampered.toString("base64"), env32));
check(`one flipped ciphertext byte throws, never returns: ${flipped.got}`, flipped.ok);

const zeroedTag = Buffer.from(raw);
zeroedTag.fill(0, 13, 29);
const badTag = throwsWith("auth-failed", () => decryptUserKey(zeroedTag.toString("base64"), env32));
check(`a wrong auth tag throws: ${badTag.got}`, badTag.ok);

// A blob written without a tag at all: version + iv + ciphertext. The first 16 ciphertext bytes are
// then read as the tag and cannot authenticate, so this fails too — there is no tag-less decrypt.
const noTag = Buffer.concat([raw.subarray(0, 13), raw.subarray(29)]);
const missingTag = throwsWith("auth-failed", () => decryptUserKey(noTag.toString("base64"), env32));
check(`a blob with no auth tag throws: ${missingTag.got}`, missingTag.ok);

const wrongSecret = throwsWith("auth-failed", () => decryptUserKey(blob, other32));
check(`a blob decrypted under another secret throws: ${wrongSecret.got}`, wrongSecret.ok);

const wrongVersion = Buffer.from(raw);
wrongVersion[0] = 2;
const versioned = throwsWith("blob-invalid", () =>
  decryptUserKey(wrongVersion.toString("base64"), env32),
);
check(`an unknown version byte is refused before any decryption: ${versioned.got}`, versioned.ok);

const tooShort = throwsWith("blob-invalid", () => decryptUserKey("aGk=", env32));
check(`a too-short blob is refused: ${tooShort.got}`, tooShort.ok);

const hash = userKeyHash(PLAINTEXT);
check(
  `userKeyHash is 64 lowercase hex chars and is stable: ${hash.slice(0, 12)}…`,
  /^[0-9a-f]{64}$/.test(hash) && hash === userKeyHash(PLAINTEXT),
);

// ================================================================== the 402 taxonomy, for real

/** One scripted reply: a JSON body with a status, or an SSE stream that begins with HTTP 200. */
type Scripted =
  | { kind: "json"; status: number; body: unknown; headers?: Record<string, string> }
  | { kind: "sse"; chunks: string[] };

const scripted: Scripted[] = [];
const requested: string[] = [];

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.includes("/api/v1/generation?")) {
    return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 });
  }
  const body = JSON.parse(String(init?.body)) as { model?: unknown; stream?: unknown };
  requested.push(String(body.model));
  const next = scripted.shift();
  if (next?.kind === "sse") {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of next.chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
  }
  return new Response(JSON.stringify(next?.body ?? { error: { code: 500 } }), {
    status: next?.status ?? 500,
    headers: { "content-type": "application/json", ...(next?.headers ?? {}) },
  });
}) as typeof fetch;

const keyEnv = { OPENROUTER_KEY_PUBLIC: "fake-public", OPENROUTER_KEY_PRIVATE: "fake-private" };
const provider = getOpenRouter("private", { env: keyEnv });

function errorBody(status: number, limitSource: string | null, errorType: string) {
  return {
    error: {
      code: status,
      message: "stub",
      metadata:
        limitSource === null
          ? { error_type: errorType }
          : { error_type: errorType, limit_source: limitSource },
    },
  };
}

/** The error the SDK raises for a failed HTTP response. A real `APICallError`, never a fixture. */
async function httpError(
  status: number,
  limitSource: string | null,
  errorType = "insufficient_credits",
  headers?: Record<string, string>,
): Promise<unknown> {
  scripted.push({ kind: "json", status, body: errorBody(status, limitSource, errorType), headers });
  try {
    await generateText({
      model: provider.chat("stub/model"),
      prompt: "stub",
      // No SDK retries: a 429 is retryable and would otherwise back off for seconds in this script.
      maxRetries: 0,
    });
    return null;
  } catch (error) {
    return error;
  }
}

/**
 * The error the SDK raises for a provider failure **after** the response stream has started: the
 * response is a 200 and the failure arrives as an SSE data event. This is the production path for
 * a kit, which streams.
 */
async function streamedError(limitSource: string | null, errorType: string): Promise<unknown> {
  scripted.push({
    kind: "sse",
    chunks: [
      `data: {"id":"gen-1","model":"stub/model","choices":[{"index":0,"delta":{"role":"assistant","content":"{"}}]}\n\n`,
      `data: ${JSON.stringify(errorBody(402, limitSource, errorType))}\n\n`,
    ],
  });
  const result = streamText({
    model: provider.chat("stub/model"),
    prompt: "stub",
    onError: () => undefined,
  });
  for await (const part of result.stream) {
    if (part.type === "error") return part.error;
  }
  return null;
}

console.log("\n-- 402 taxonomy: real SDK errors --");

const kinds = [
  ["openrouter_credits", "credits"],
  ["openrouter_key_limit", "key-limit"],
  ["openrouter_in_flight_budget", "in-flight"],
] as const;

for (const [source, expected] of kinds) {
  const error = await httpError(402, source);
  check(
    `HTTP 402 ${source} -> ${paymentRequiredKindOf(error)}`,
    paymentRequiredKindOf(error) === expected,
  );
}

for (const [source, expected] of kinds) {
  const error = await streamedError(source, "insufficient_credits");
  const name = (error as Error | null)?.name;
  check(
    `mid-stream (HTTP 200, SSE) 402 ${source} -> ${paymentRequiredKindOf(error)}   [real ${name}]`,
    paymentRequiredKindOf(error) === expected && name === "AI_StreamProviderError",
  );
}

const noSource = await httpError(402, null);
check(
  `HTTP 402 with no limit_source -> ${paymentRequiredKindOf(noSource)}`,
  paymentRequiredKindOf(noSource) === null,
);

const unknownSource = await httpError(402, "openrouter_something_new");
check(
  `HTTP 402 with an unknown limit_source -> ${paymentRequiredKindOf(unknownSource)}`,
  paymentRequiredKindOf(unknownSource) === null,
);

const freeText = await httpError(402, "Your balance is $0.13 and the request needs $0.20");
check(
  `a free-text limit_source is dropped, not passed through: ${JSON.stringify(describeFailure(freeText).limitSource)}`,
  describeFailure(freeText).limitSource === null,
);

const rateLimited = await httpError(429, null, "rate_limit");
check(
  `HTTP 429 rate_limit -> ${paymentRequiredKindOf(rateLimited)}`,
  paymentRequiredKindOf(rateLimited) === null,
);
check(
  `a plain Error -> ${paymentRequiredKindOf(new Error("boom"))}`,
  paymentRequiredKindOf(new Error("boom")) === null,
);

const described = describeFailure(await httpError(402, "openrouter_credits"));
check(
  `describeFailure carries only whitelisted tokens: ${JSON.stringify(described)}`,
  Object.keys(described).sort().join(",") === "errorType,limitSource,retryAfter,status" &&
    described.limitSource === "openrouter_credits",
);

console.log("\n-- Retry-After --");

const seconds = describeFailure(
  await httpError(402, "openrouter_in_flight_budget", "insufficient_credits", {
    "retry-after": "17",
  }),
);
check(`Retry-After: 17 -> ${seconds.retryAfter}s`, seconds.retryAfter === 17);

const httpDate = new Date(Date.now() + 42_000).toUTCString();
const dated = describeFailure(
  await httpError(402, "openrouter_in_flight_budget", "insufficient_credits", {
    "retry-after": httpDate,
  }),
);
check(
  `Retry-After as an HTTP date (${httpDate}) -> ${dated.retryAfter}s`,
  dated.retryAfter !== null && dated.retryAfter >= 40 && dated.retryAfter <= 43,
);

const junk = describeFailure(
  await httpError(402, "openrouter_credits", "insufficient_credits", { "retry-after": "soon" }),
);
check(
  `an unparsable Retry-After is null, not a guess: ${junk.retryAfter}`,
  junk.retryAfter === null,
);

const streamedRetry = describeFailure(
  await streamedError("openrouter_in_flight_budget", "insufficient_credits"),
);
check(
  `a mid-stream failure has no headers, so retryAfter is null by construction: ${streamedRetry.retryAfter}`,
  streamedRetry.retryAfter === null,
);

console.log("\n-- the whole chain: what the caller actually catches --");

const entries: AiUsageEntry[] = [];
let spent = 0;
const ledger: CostLedger = {
  async record(entry) {
    entries.push(entry);
    spent += entry.costUsd;
  },
  async spentOnDayUsd() {
    return spent;
  },
};
const capGuard = createDailyCapGuard({ ledger, capUsd: 3 });
const task = "job-enrichment" as const;
const fallbackModel = DEFAULT_ROUTING[task].fallbackModels[0];

// A streamed attempt that dies mid-stream on a 402 out of credits, then a fallback chain where
// every model answers 429. The last failure is a 429; the informative one is the first 402.
scripted.length = 0;
requested.length = 0;
entries.length = 0;
scripted.push(
  {
    kind: "sse",
    chunks: [
      `data: {"id":"gen-1","model":"stub/model","choices":[{"index":0,"delta":{"role":"assistant","content":"{"}}]}\n\n`,
      `data: ${JSON.stringify(errorBody(402, "openrouter_credits", "insufficient_credits"))}\n\n`,
    ],
  },
  { kind: "json", status: 429, body: errorBody(429, null, "rate_limit") },
  { kind: "json", status: 429, body: errorBody(429, null, "rate_limit") },
);

let caught: unknown = null;
try {
  await runStreamingStructuredTask({
    task,
    schema: z.object({ country: z.string(), eligible: z.boolean() }),
    prompt: { name: task, version: "check", text: "stub", versionId: `${task}@check+stub` },
    input: "stub input",
    ledger,
    capGuard,
    env: keyEnv,
    table: DEFAULT_ROUTING,
    onPartial: () => undefined,
  });
} catch (error) {
  caught = error;
}

const call = caught instanceof AiCallError ? caught : null;
check(
  `streamed 402 credits then 429 fallbacks -> ${call === null ? "not an AiCallError" : `status ${call.status} ${call.errorType} limitSource=${call.limitSource}`}, kind=${paymentRequiredKindOf(caught)}, models tried ${call?.attemptedModels.length ?? 0} (${requested.join(", ")})`,
  call !== null &&
    call.status === 402 &&
    call.limitSource === "openrouter_credits" &&
    paymentRequiredKindOf(caught) === "credits" &&
    call.attemptedModels.length === 2 &&
    requested.length === 3 &&
    fallbackModel !== undefined,
);
check(
  `and every attempt wrote its own ai_usage row: ${entries.map((e) => e.outcome).join(",")}`,
  entries.length === 3 && entries.every((entry) => entry.outcome === "error"),
);

process.exitCode = failed ? 1 : 0;
