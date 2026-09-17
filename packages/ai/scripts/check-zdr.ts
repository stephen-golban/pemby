// Offline check of key routing: stubs fetch, runs one call per route through the real AI SDK
// and prints the outgoing `provider` routing, fallback list and which key class was used.
// It also asserts the embedding body asks for EMBEDDING_DIMENSIONS with ZDR, that the default
// routing's prompts match core's ROUTED_PROMPTS, that a private `routing.json` can change models
// but never key classes, and that runStructuredTask meters, repairs, falls back and caps.
// No network, no real keys. Usage: pnpm --filter @pemby/ai check:zdr
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ROUTED_PROMPTS, routingConfigSchema } from "@pemby/core/private-config";
import { embed, generateText } from "ai";
import { z } from "zod";

import {
  AI_TASKS,
  AiCallError,
  AiOutputInvalidError,
  AiPromptMissingError,
  DEFAULT_ROUTING,
  DailyCapReachedError,
  EMBEDDING_DIMENSIONS,
  alertOwnerCapReached,
  applyRoutingConfig,
  createDailyCapGuard,
  embeddingModelForTask,
  languageModelForTask,
  readDailyCapUsd,
  resolveRoute,
  runStructuredTask,
  validateRoutingTable,
  type AiUsageEntry,
  type CostLedger,
  type RoutingTable,
} from "../src";

const fakeKeys = {
  "Bearer fake-public": "public",
  "Bearer fake-private": "private",
  "Bearer fake-user": "user",
} as Record<string, string>;

const chatReply = {
  id: "stub",
  model: "stub",
  choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};
const embeddingReply = {
  object: "list",
  model: "stub",
  data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
  usage: { prompt_tokens: 1, total_tokens: 1 },
};

let failed = false;
function check(label: string, ok: boolean): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failed = true;
}

const embeddingBodies: Record<string, unknown>[] = [];

/** Scripted replies for the structured section; empty means the plain "ok" chat reply. */
type Scripted = { status: number; body: unknown } | "hang";
const scripted: Scripted[] = [];
const chatBodies: Record<string, unknown>[] = [];

function completion(model: string, content: string, cost: number) {
  return {
    id: "gen-stub",
    model,
    provider: "Stub",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost },
  };
}

const generationLookups: string[] = [];
let generationReply: unknown = null;

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.includes("/api/v1/generation?")) {
    generationLookups.push(url.slice(url.indexOf("?")));
    return new Response(JSON.stringify(generationReply ?? { error: { code: 404 } }), {
      status: generationReply ? 200 : 404,
      headers: { "content-type": "application/json" },
    });
  }
  const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
  const key = fakeKeys[new Headers(init?.headers).get("authorization") ?? ""] ?? "unknown";
  console.log(
    `${url.slice(url.lastIndexOf("/"))} key=${key} model=${String(body.model)} ` +
      `provider=${JSON.stringify(body.provider)} models=${JSON.stringify(body.models)}` +
      (body.dimensions === undefined ? "" : ` dimensions=${JSON.stringify(body.dimensions)}`),
  );
  if (url.endsWith("/embeddings")) embeddingBodies.push(body);
  else chatBodies.push(body);
  const next = url.endsWith("/embeddings") ? undefined : scripted.shift();
  if (next === "hang") {
    // Never answers: resolves only by the request's abort signal (timeout or caller abort).
    return new Promise<Response>((_, reject) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  }
  const reply = url.endsWith("/embeddings") ? embeddingReply : (next?.body ?? chatReply);
  return new Response(JSON.stringify(reply), {
    status: next?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

const env = { OPENROUTER_KEY_PUBLIC: "fake-public", OPENROUTER_KEY_PRIVATE: "fake-private" };

console.log("cv-parse, call site tries to override provider routing with zdr:false:");
await generateText({
  model: languageModelForTask("cv-parse", { env }).model,
  prompt: "stub",
  providerOptions: { openrouter: { provider: { order: ["google-vertex"], zdr: false } } },
});
console.log("job-enrichment (public key, fallback list):");
await generateText({
  model: languageModelForTask("job-enrichment", { env }).model,
  prompt: "stub",
});
for (const task of ["profile-embedding", "job-embedding"] as const) {
  console.log(`${task}:`);
  embeddingBodies.length = 0;
  await embed({ model: embeddingModelForTask(task, { env }).model, value: "stub" });
  const body = embeddingBodies[0];
  const provider = body?.provider as Record<string, unknown> | undefined;
  check(`${task} body has dimensions: ${EMBEDDING_DIMENSIONS}`, body?.dimensions === 2048);
  check(`${task} body has provider.zdr: true`, provider?.zdr === true);
}
console.log("application-kit on a user key:");
await generateText({
  model: languageModelForTask("application-kit", { keyClass: "user", userApiKey: "fake-user" })
    .model,
  prompt: "stub",
});

const routedPrompts = new Set(
  AI_TASKS.map((task) => DEFAULT_ROUTING[task].promptName).filter((name) => name !== null),
);
check(
  "default routing prompts equal ROUTED_PROMPTS",
  routedPrompts.size === ROUTED_PROMPTS.length &&
    ROUTED_PROMPTS.every((name) => routedPrompts.has(name)),
);
try {
  validateRoutingTable(DEFAULT_ROUTING);
  check("validateRoutingTable(DEFAULT_ROUTING)", true);
} catch (error) {
  check(`validateRoutingTable(DEFAULT_ROUTING): ${(error as Error).message}`, false);
}

try {
  resolveRoute("cv-parse", { keyClass: "public" });
  check("guard: public key on cv-parse throws", false);
} catch (error) {
  console.log(`guard: ${(error as Error).message}`);
}
try {
  languageModelForTask("cv-parse", { env: {} });
  check("missing key throws", false);
} catch (error) {
  console.log(`missing key: ${(error as Error).message}`);
}

// ---------------------------------------------------------------- routing.json
console.log("\nrouting.json:");
function throws(label: string, fn: () => unknown): void {
  try {
    fn();
    check(`${label} is refused`, false);
  } catch (error) {
    check(`${label} is refused: ${(error as Error).message.slice(0, 110)}`, true);
  }
}
const parsedConfig = routingConfigSchema.parse({
  version: "check-1",
  tasks: {
    "job-enrichment": {
      model: "openai/gpt-oss-120b",
      fallbackModels: ["deepseek/deepseek-v4-flash-0731"],
      params: { temperature: 0, maxOutputTokens: 1200, reasoning: { effort: "low" } },
    },
    "cv-parse": { model: "mistralai/mistral-small-2603" },
  },
});
const configured = applyRoutingConfig(parsedConfig);
check(
  "config changes job-enrichment model, fallbacks and params",
  configured["job-enrichment"].model === "openai/gpt-oss-120b" &&
    configured["job-enrichment"].fallbackModels[0] === "deepseek/deepseek-v4-flash-0731" &&
    configured["job-enrichment"].params?.reasoning?.effort === "low",
);
check(
  "config keeps cv-parse on the private key with personalData",
  configured["cv-parse"].keyClass === "private" && configured["cv-parse"].personalData,
);
check("missing routing.json means DEFAULT_ROUTING", applyRoutingConfig(null) === DEFAULT_ROUTING);
throws("routing.json with a keyClass field", () =>
  routingConfigSchema.parse({
    version: "x",
    tasks: { "cv-parse": { model: "google/gemini-2.5-flash-lite", keyClass: "public" } },
  }),
);
throws("routing.json with an unknown task", () =>
  routingConfigSchema.parse({ version: "x", tasks: { "cv-upload": { model: "a/b" } } }),
);
throws("routing.json with reasoning effort and maxTokens together", () =>
  routingConfigSchema.parse({
    version: "x",
    tasks: {
      "job-enrichment": { model: "a/b", params: { reasoning: { effort: "low", maxTokens: 10 } } },
    },
  }),
);
throws("routing.json changing the embedding model", () =>
  applyRoutingConfig(
    routingConfigSchema.parse({
      version: "x",
      tasks: { "job-embedding": { model: "openai/text-embedding-3-small" } },
    }),
  ),
);
throws("a table moving cv-parse to the public key (personal data)", () =>
  validateRoutingTable({
    ...DEFAULT_ROUTING,
    "cv-parse": { ...DEFAULT_ROUTING["cv-parse"], keyClass: "public" },
  } as RoutingTable),
);
throws("a table moving job-embedding to the public key", () =>
  validateRoutingTable({
    ...DEFAULT_ROUTING,
    "job-embedding": { ...DEFAULT_ROUTING["job-embedding"], keyClass: "public" },
  } as RoutingTable),
);

// ---------------------------------------------------------------- runStructuredTask
console.log("\nrunStructuredTask:");
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
const toySchema = z.object({ country: z.string(), eligible: z.boolean() });
const prompt = {
  name: "job-enrichment",
  version: "check",
  text: "stub instructions",
  versionId: "job-enrichment@check+stub",
};
const base = { schema: toySchema, prompt, input: "stub input", ledger, capGuard, env };

entries.length = 0;
chatBodies.length = 0;
scripted.push({
  status: 200,
  body: completion("stub/model", '{"country":"MD","eligible":true}', 0.0001),
});
const okRun = await runStructuredTask({
  ...base,
  task: "job-enrichment",
  table: DEFAULT_ROUTING,
  context: { jobId: "00000000-0000-0000-0000-000000000001", runLabel: "check" },
});
const okBody = chatBodies[0] ?? {};
check(
  `ok: outcome ${okRun.outcome}, one row, cost ${entries[0]?.costUsd}, gen ${entries[0]?.generationId}`,
  okRun.outcome === "ok" &&
    entries.length === 1 &&
    entries[0]?.costUsd === 0.0001 &&
    entries[0]?.generationId === "gen-stub" &&
    entries[0]?.jobId === "00000000-0000-0000-0000-000000000001" &&
    entries[0]?.runLabel === "check",
);
const responseFormat = okBody.response_format as {
  type?: string;
  json_schema?: { strict?: boolean };
};
check(
  `body: response_format json_schema strict, require_parameters, no models array (${JSON.stringify(okBody.provider)})`,
  responseFormat?.type === "json_schema" &&
    responseFormat.json_schema?.strict === true &&
    (okBody.provider as { require_parameters?: boolean })?.require_parameters === true &&
    okBody.models === undefined &&
    okBody.model === DEFAULT_ROUTING["job-enrichment"].model,
);

entries.length = 0;
chatBodies.length = 0;
scripted.push(
  { status: 200, body: completion("stub/model", '{"country":"MD"}', 0.0001) },
  { status: 200, body: completion("stub/model", '{"country":"MD","eligible":false}', 0.0002) },
);
const repaired = await runStructuredTask({
  ...base,
  task: "job-enrichment",
  table: DEFAULT_ROUTING,
});
const repairMessages = (chatBodies[1]?.messages ?? []) as { role: string }[];
check(
  `repair: outcomes ${entries.map((e) => e.outcome).join(",")}, total cost ${repaired.costUsd.toFixed(4)}`,
  repaired.outcome === "repaired" &&
    entries.map((e) => e.outcome).join(",") === "invalid,repaired" &&
    Math.abs(repaired.costUsd - 0.0003) < 1e-9 &&
    repairMessages.map((m) => m.role).join(",") === "system,user,assistant,user",
);

entries.length = 0;
chatBodies.length = 0;
const jobEnrichmentFallback = DEFAULT_ROUTING["job-enrichment"].fallbackModels[0];
scripted.push(
  {
    status: 429,
    body: {
      error: { code: 429, message: "stub", metadata: { error_type: "rate_limit_exceeded" } },
    },
  },
  {
    status: 200,
    body: completion(jobEnrichmentFallback, '{"country":"MD","eligible":true}', 0.00005),
  },
);
const fellBack = await runStructuredTask({
  ...base,
  task: "job-enrichment",
  table: DEFAULT_ROUTING,
});
check(
  `429 falls back: ${entries.map((e) => `${e.model}:${e.outcome}`).join(" -> ")}`,
  fellBack.model === jobEnrichmentFallback &&
    entries.length === 2 &&
    entries[0]?.outcome === "error" &&
    entries[1]?.attemptedModels?.length === 2 &&
    chatBodies[1]?.model === jobEnrichmentFallback,
);

entries.length = 0;
chatBodies.length = 0;
scripted.push({
  status: 402,
  body: { error: { code: 402, message: "stub", metadata: { error_type: "payment_required" } } },
});
try {
  await runStructuredTask({
    ...base,
    task: "job-enrichment",
    table: DEFAULT_ROUTING,
    routeOverride: { model: "openai/gpt-oss-120b" },
  });
  check("routeOverride: 402 with no fallback throws", false);
} catch (error) {
  check(
    `routeOverride: one model, 402 -> ${(error as Error).message}`,
    error instanceof AiCallError &&
      error.status === 402 &&
      chatBodies.length === 1 &&
      !String(error.message).includes("stub input"),
  );
}

entries.length = 0;
chatBodies.length = 0;
scripted.push(
  { status: 200, body: completion("stub/model", "not json", 0.0001) },
  { status: 200, body: completion("stub/model", "still not json", 0.0001) },
);
try {
  await runStructuredTask({
    ...base,
    task: "job-enrichment",
    table: DEFAULT_ROUTING,
    routeOverride: { model: "openai/gpt-oss-120b" },
  });
  check("invalid after repair throws", false);
} catch (error) {
  check(
    `invalid after repair: ${(error as Error).message}`,
    error instanceof AiOutputInvalidError && entries.length === 2 && chatBodies.length === 2,
  );
}

chatBodies.length = 0;
scripted.push({
  status: 200,
  body: completion("google/gemini-2.5-flash-lite", '{"country":"MD","eligible":true}', 0.0001),
});
await runStructuredTask({ ...base, task: "cv-parse", table: DEFAULT_ROUTING });
const cvProvider = chatBodies[0]?.provider as Record<string, unknown> | undefined;
check(
  `cv-parse structured body keeps ZDR: ${JSON.stringify(cvProvider)}`,
  cvProvider?.zdr === true &&
    cvProvider.data_collection === "deny" &&
    cvProvider.require_parameters === true,
);

chatBodies.length = 0;
spent = 5;
try {
  await runStructuredTask({ ...base, task: "job-enrichment", table: DEFAULT_ROUTING });
  check("cap reached throws", false);
} catch (error) {
  check(
    `cap: ${(error as Error).message} (requests sent: ${chatBodies.length})`,
    error instanceof DailyCapReachedError && chatBodies.length === 0,
  );
}
spent = 0;

// A config with only the required prompts: company-evidence's optional prompt is absent.
const configDir = mkdtempSync(join(tmpdir(), "pemby-check-zdr-"));
const exampleDir = fileURLToPath(new URL("../../../private-config.example/", import.meta.url));
mkdirSync(join(configDir, "prompts"));
mkdirSync(join(configDir, "scoring"));
for (const file of [
  "manifest.json",
  "scoring/weights.json",
  "prompts/job-enrichment.md",
  "prompts/cv-parse.md",
  "prompts/application-kit.md",
]) {
  copyFileSync(join(exampleDir, file), join(configDir, file));
}
process.env.PRIVATE_CONFIG_DIR = configDir;
try {
  await runStructuredTask({
    schema: toySchema,
    input: "stub",
    ledger,
    capGuard,
    env,
    task: "company-evidence",
    table: DEFAULT_ROUTING,
  });
  check("missing optional prompt throws", false);
} catch (error) {
  check(
    `optional prompt missing: ${(error as Error).message}`,
    error instanceof AiPromptMissingError,
  );
} finally {
  rmSync(configDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------- A2: cap, cost fallback, abort
console.log("\nrunStructuredTask, per-attempt cap, cost lookup and estimates, abort:");
// AbortSignal.timeout timers do not keep Node alive; this does while a stubbed request hangs.
const keepAlive = setInterval(() => undefined, 1_000);
{
  let checks = 0;
  const flipGuard = {
    capUsd: 3,
    // Open for the first request, capped from the second check on.
    async check() {
      checks += 1;
      return checks === 1
        ? { state: "open" as const, spentUsd: 2.9, remainingUsd: 0.1, capUsd: 3 }
        : { state: "capped" as const, spentUsd: 3.05, capUsd: 3 };
    },
  };
  entries.length = 0;
  chatBodies.length = 0;
  scripted.push({
    status: 429,
    body: {
      error: { code: 429, message: "stub", metadata: { error_type: "rate_limit_exceeded" } },
    },
  });
  try {
    await runStructuredTask({
      ...base,
      capGuard: flipGuard,
      task: "job-enrichment",
      table: DEFAULT_ROUTING,
    });
    check("cap checked before the fallback", false);
  } catch (error) {
    check(
      `cap before fallback: ${(error as Error).name}, requests ${chatBodies.length}, rows ${entries.length}, checks ${checks}`,
      error instanceof DailyCapReachedError &&
        chatBodies.length === 1 &&
        entries.length === 1 &&
        checks === 2,
    );
  }
}

entries.length = 0;
chatBodies.length = 0;
generationLookups.length = 0;
{
  const noCost = completion("openai/gpt-oss-120b", '{"country":"MD","eligible":true}', 0) as {
    usage: Record<string, unknown>;
  };
  delete noCost.usage.cost;
  scripted.push({ status: 200, body: noCost });
  generationReply = {
    data: { id: "gen-stub", total_cost: 0.0042, tokens_prompt: 11, tokens_completion: 6 },
  };
  await runStructuredTask({
    ...base,
    task: "job-enrichment",
    table: DEFAULT_ROUTING,
    routeOverride: { model: "openai/gpt-oss-120b" },
  });
  generationReply = null;
  check(
    `no usage.cost -> GET /generation${generationLookups[0]}: cost ${entries[0]?.costUsd}, estimated ${entries[0]?.costEstimated}`,
    generationLookups.length === 1 &&
      entries[0]?.costUsd === 0.0042 &&
      entries[0]?.costEstimated === false &&
      entries[0]?.inputTokens === 11,
  );
}

entries.length = 0;
chatBodies.length = 0;
scripted.push("hang");
try {
  await runStructuredTask({
    ...base,
    task: "job-enrichment",
    table: DEFAULT_ROUTING,
    routeOverride: { model: "openai/gpt-oss-120b", params: { maxOutputTokens: 1000 } },
    timeoutMs: 50,
  });
  check("timeout throws", false);
} catch (error) {
  const row = entries[0];
  check(
    `timeout: ${(error as Error).message}; row cost $${row?.costUsd.toFixed(6)} estimated ${row?.costEstimated} tokens ${row?.inputTokens}/${row?.outputTokens}`,
    error instanceof AiCallError &&
      error.errorType === "timeout" &&
      entries.length === 1 &&
      row?.outcome === "error" &&
      row.costEstimated === true &&
      row.costUsd > 0 &&
      row.outputTokens === 1000,
  );
}

entries.length = 0;
chatBodies.length = 0;
scripted.push("hang");
{
  const controller = new AbortController();
  setTimeout(() => controller.abort(new Error("stub shutdown")), 50);
  try {
    // Default table: job-enrichment has a fallback model, which an abort must not reach.
    await runStructuredTask({
      ...base,
      task: "job-enrichment",
      table: DEFAULT_ROUTING,
      abortSignal: controller.signal,
    });
    check("abort throws", false);
  } catch (error) {
    check(
      `abort: threw "${(error as Error).message}", requests ${chatBodies.length}, row ${entries[0]?.outcome} estimated ${entries[0]?.costEstimated}`,
      (error as Error).message === "stub shutdown" &&
        chatBodies.length === 1 &&
        entries.length === 1 &&
        entries[0]?.outcome === "error" &&
        entries[0]?.costEstimated === true,
    );
  }
}
scripted.length = 0;
clearInterval(keepAlive);

check("AI_DAILY_CAP_USD unset -> 3", readDailyCapUsd({}) === 3);
check("AI_DAILY_CAP_USD=0.5 -> 0.5", readDailyCapUsd({ AI_DAILY_CAP_USD: "0.5" }) === 0.5);
throws("AI_DAILY_CAP_USD=10", () => readDailyCapUsd({ AI_DAILY_CAP_USD: "10" }));

// ---------------------------------------------------------------- owner alert
console.log("\nalertOwnerCapReached:");
const alertCalls: string[] = [];
const alertFetch = (async (input: string | URL | Request) => {
  const url = String(input);
  alertCalls.push(url.includes("telegram") ? "telegram" : "resend");
  return url.includes("telegram")
    ? new Response(JSON.stringify({ ok: false, error_code: 400 }), { status: 400 })
    : new Response(JSON.stringify({ id: "stub" }), { status: 200 });
}) as typeof fetch;
let claims = 0;
const claim = async () => ++claims === 1;
const alertEnv = {
  TELEGRAM_BOT_TOKEN: "stub-token",
  OWNER_TELEGRAM_CHAT_ID: "1",
  RESEND_API_KEY: "stub-resend",
  OWNER_ALLOWLIST_EMAILS: "owner@example.com, other@example.com",
};
const first = await alertOwnerCapReached({
  day: new Date("2026-09-17T15:00:00Z"),
  spentUsd: 3.01,
  capUsd: 3,
  claim,
  env: alertEnv,
  fetch: alertFetch,
});
const second = await alertOwnerCapReached({
  day: "2026-09-17",
  spentUsd: 3.2,
  capUsd: 3,
  claim,
  env: alertEnv,
  fetch: alertFetch,
});
check(
  `telegram fails -> email: ${JSON.stringify(first)}; second claim: ${second.claimed}`,
  first.deliveredVia === "email" &&
    !first.failures.join(" ").includes("stub-token") &&
    alertCalls.join(",") === "telegram,resend" &&
    !second.claimed,
);

{
  // A claim store that behaves like claimCapAlert/markCapAlertDelivered: re-claimable 15 minutes
  // after an undelivered claim.
  let clock = Date.parse("2026-09-17T15:00:00Z");
  const store = new Map<string, { claimedAt: number; delivered: boolean }>();
  const dbClaim = async ({ day }: { day: string }) => {
    const row = store.get(day);
    if (row && (row.delivered || clock - row.claimedAt < 15 * 60_000)) return false;
    store.set(day, { claimedAt: clock, delivered: false });
    return true;
  };
  const marked: string[] = [];
  const markDelivered = async ({ day, deliveredVia }: { day: string; deliveredVia: string }) => {
    marked.push(deliveredVia);
    const row = store.get(day);
    if (row) row.delivered = true;
  };
  let telegramUp = false;
  const flakyFetch = (async (input: string | URL | Request) =>
    String(input).includes("telegram") && telegramUp
      ? new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })
      : new Response("{}", { status: 500 })) as typeof fetch;
  const run = () =>
    alertOwnerCapReached({
      day: "2026-09-17",
      spentUsd: 3.01,
      capUsd: 3,
      claim: dbClaim,
      markDelivered,
      env: alertEnv,
      fetch: flakyFetch,
    });
  const failedAttempt = await run();
  clock += 5 * 60_000;
  const tooSoon = await run();
  clock += 11 * 60_000;
  telegramUp = true;
  const retried = await run();
  clock += 60 * 60_000;
  const afterDelivery = await run();
  check(
    `release on failure: first ${failedAttempt.deliveredVia} (marked ${marked.length === 0}), +5 min claimed ${tooSoon.claimed}, +16 min ${retried.deliveredVia}, after delivery claimed ${afterDelivery.claimed}`,
    failedAttempt.claimed &&
      failedAttempt.deliveredVia === "none" &&
      !tooSoon.claimed &&
      retried.claimed &&
      retried.deliveredVia === "telegram" &&
      marked.join(",") === "telegram" &&
      !afterDelivery.claimed,
  );
}

process.exitCode = failed ? 1 : 0;
