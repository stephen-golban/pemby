// Real, tiny OpenRouter requests that prove the key setup (phase 05 item 1). Spend well under $0.01.
//   (a) public key  -> nvidia/nemotron-3-super-120b-a12b:free: expected to succeed.
//   (b) private key -> the same :free model with ZDR enforced: expected to be refused, because no
//       free Nemotron endpoint is ZDR.
//   (c) runStructuredTask on the public key, forced to openai/gpt-oss-120b, toy schema, in-memory
//       ledger that prints its rows.
// Prompts are one harmless line; no personal data. Keys are never printed, and anything shaped like
// a key is stripped from error bodies.
// Usage: RAILWAY_SERVICE=worker scripts/dev-staging.sh pnpm --filter @pemby/ai dry:zdr
import { APICallError, generateText } from "ai";
import { z } from "zod";

import {
  DEFAULT_ROUTING,
  createDailyCapGuard,
  getOpenRouter,
  runStructuredTask,
  type AiUsageEntry,
  type CostLedger,
  type KeyClass,
} from "../src";

const FREE_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
const PAID_MODEL = "openai/gpt-oss-120b";
const PROMPT = "Reply with the single word: ok";

const secrets = [process.env.OPENROUTER_KEY_PUBLIC, process.env.OPENROUTER_KEY_PRIVATE];

function scrub(text: string): string {
  let out = text
    .replace(/sk-or-[A-Za-z0-9_-]+/g, "[key]")
    .replace(/Bearer\s+\S+/gi, "Bearer [key]");
  for (const secret of secrets) {
    if (secret && secret.length >= 8) out = out.split(secret).join("[key]");
  }
  return out;
}

function costOf(metadata: unknown): string {
  const cost = (metadata as { openrouter?: { usage?: { cost?: unknown } } } | undefined)?.openrouter
    ?.usage?.cost;
  return typeof cost === "number" ? `$${cost.toFixed(6)}` : "not reported";
}

async function plainCall(label: string, keyClass: KeyClass, expect: "success" | "refusal") {
  console.log(`\n(${label}) ${keyClass} key -> ${FREE_MODEL}, expect ${expect}`);
  const started = performance.now();
  try {
    const result = await generateText({
      model: getOpenRouter(keyClass).chat(FREE_MODEL),
      prompt: PROMPT,
      maxOutputTokens: 20,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(60_000),
    });
    console.log(`status:        200`);
    console.log(`model:         ${result.response.modelId}`);
    console.log(`generation id: ${result.response.id}`);
    console.log(`reply:         ${JSON.stringify(result.text.slice(0, 40))}`);
    console.log(`tokens:        in ${result.usage.inputTokens} / out ${result.usage.outputTokens}`);
    console.log(`cost:          ${costOf(result.providerMetadata)}`);
    console.log(`latency:       ${Math.round(performance.now() - started)} ms`);
    console.log(expect === "success" ? "RESULT: as expected" : "RESULT: UNEXPECTED success");
    return expect === "success";
  } catch (error) {
    if (APICallError.isInstance(error)) {
      console.log(`status:        ${error.statusCode ?? "none"}`);
      console.log(`model:         ${FREE_MODEL}`);
      console.log(`body:          ${scrub(error.responseBody ?? "(none)").slice(0, 800)}`);
      console.log(`cost:          none (request refused)`);
      // A routing refusal, not an auth, credit or rate-limit failure (which would prove nothing).
      const refused = [400, 403, 404, 503].includes(error.statusCode ?? 0);
      const asExpected = expect === "refusal" && refused;
      console.log(asExpected ? "RESULT: as expected" : "RESULT: UNEXPECTED failure");
      return asExpected;
    }
    // Local failures (missing key, timeout) prove nothing about OpenRouter either way.
    console.log(`error:         ${error instanceof Error ? scrub(error.message) : "unknown"}`);
    console.log("RESULT: UNEXPECTED local failure (no OpenRouter response)");
    return false;
  }
}

const missing = ["OPENROUTER_KEY_PUBLIC", "OPENROUTER_KEY_PRIVATE"].filter(
  (name) => !process.env[name]?.trim(),
);
if (missing.length > 0) {
  console.error(`Not set: ${missing.join(", ")}. Nothing was sent.`);
  process.exit(1);
}

let ok = true;
ok = (await plainCall("a", "public", "success")) && ok;
ok = (await plainCall("b", "private", "refusal")) && ok;

console.log(`\n(c) runStructuredTask, public key, routeOverride ${PAID_MODEL}`);
let spent = 0;
const ledger: CostLedger = {
  async record(entry: AiUsageEntry) {
    spent += entry.costUsd;
    console.log(
      `ledger row:    model=${entry.model} outcome=${entry.outcome} cost=$${entry.costUsd.toFixed(6)} ` +
        `generation=${entry.generationId} latency=${entry.latencyMs}ms ` +
        `tokens=${entry.inputTokens}/${entry.outputTokens} attempted=${JSON.stringify(entry.attemptedModels)} ` +
        `run=${entry.runLabel}`,
    );
  },
  async spentOnDayUsd() {
    return spent;
  },
};
try {
  const result = await runStructuredTask({
    task: "job-enrichment",
    table: DEFAULT_ROUTING,
    routeOverride: {
      model: PAID_MODEL,
      params: { temperature: 0, maxOutputTokens: 400, reasoning: { effort: "low" } },
    },
    schema: z.object({ country: z.string(), isoCode: z.string() }),
    schemaName: "toy_country",
    prompt: {
      name: "dry-zdr-toy",
      version: "1",
      text: "Answer in JSON matching the schema.",
      versionId: "dry-zdr-toy@1",
    },
    input: "Which country has the capital Chisinau? Give its ISO 3166-1 alpha-2 code.",
    ledger,
    capGuard: createDailyCapGuard({ ledger, capUsd: 0.01 }),
    context: { runLabel: "dry-zdr" },
  });
  console.log(
    `result:        ${JSON.stringify(result.data)} outcome=${result.outcome} model=${result.model} ` +
      `attempts=${result.attempts} cost=$${result.costUsd.toFixed(6)} latency=${result.latencyMs}ms`,
  );
} catch (error) {
  ok = false;
  console.log(`error:         ${error instanceof Error ? error.message : "unknown"}`);
}

console.log(`\ntotal structured spend: $${spent.toFixed(6)}`);
process.exitCode = ok ? 0 : 1;
