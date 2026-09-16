// Offline check of key routing: stubs fetch, runs one call per route through the real AI SDK
// and prints the outgoing `provider` routing, fallback list and which key class was used.
// It also asserts the embedding body asks for EMBEDDING_DIMENSIONS with ZDR, and that the
// default routing's prompts match core's REQUIRED_PROMPTS.
// No network, no real keys. Usage: pnpm --filter @pemby/ai check:zdr
import { REQUIRED_PROMPTS } from "@pemby/core";
import { embed, generateText } from "ai";

import {
  AI_TASKS,
  DEFAULT_ROUTING,
  EMBEDDING_DIMENSIONS,
  embeddingModelForTask,
  languageModelForTask,
  resolveRoute,
  validateRoutingTable,
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

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
  const key = fakeKeys[new Headers(init?.headers).get("authorization") ?? ""] ?? "unknown";
  console.log(
    `${url.slice(url.lastIndexOf("/"))} key=${key} model=${String(body.model)} ` +
      `provider=${JSON.stringify(body.provider)} models=${JSON.stringify(body.models)}` +
      (body.dimensions === undefined ? "" : ` dimensions=${JSON.stringify(body.dimensions)}`),
  );
  if (url.endsWith("/embeddings")) embeddingBodies.push(body);
  const reply = url.endsWith("/embeddings") ? embeddingReply : chatReply;
  return new Response(JSON.stringify(reply), {
    status: 200,
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
  "default routing prompts equal REQUIRED_PROMPTS",
  routedPrompts.size === REQUIRED_PROMPTS.length &&
    REQUIRED_PROMPTS.every((name) => routedPrompts.has(name)),
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
process.exitCode = failed ? 1 : 0;
