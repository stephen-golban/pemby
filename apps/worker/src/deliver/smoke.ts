// `pnpm --filter @pemby/worker deliver:smoke` — does this module actually load?
//
// It exists because the phase shipped a dispatcher that could not be imported. `senders/push.ts`
// had `import { sendNotification } from "web-push"`; `web-push` is CommonJS and builds that export
// at runtime, so Node's `cjs-module-lexer` cannot see it and the import throws `SyntaxError` the
// moment the module is loaded. `@types/web-push` declares it as a named export, so **typecheck,
// lint and build all passed**, and the drain had been proved with stubbed senders, so the real
// package was never imported. The staging worker died at boot — before `DELIVER_ENABLED` was read,
// taking ingest, enrich, embed, match and the owner alerts down with it, because the import chain
// from `src/index.ts` is static and unconditional.
//
// No gate in the repo could have caught that, and no type system can: whether a CommonJS package
// yields a given named export is decided by a static analysis of its source at load time. Only
// loading it answers the question.
//
// So this is the missing gate, and it is deliberately the cheapest possible one: import the same
// barrel `src/index.ts` imports, build the senders, exit non-zero if anything throws. No database,
// no queue, no network, no credentials — the fake values below never leave this process. It runs in
// about a second and belongs in CI beside typecheck and build.
//
// Not a test suite (PLAN D24): no runner, no assertions about behaviour, no fixtures. It answers
// one question that build cannot — "does this load?" — in the same family as `deliver:once` and
// `match:once`.
import { createSenders } from "./workers";
import { readDeliverEnv } from "./env";

// Shaped like the real thing and worthless: nothing here is a credential and nothing is called.
const FAKE = {
  DELIVER_ENABLED: "true",
  DELIVER_APP_URL: "https://smoke.invalid",
  TELEGRAM_BOT_TOKEN: "0:smoke",
  RESEND_API_KEY: "smoke",
  VAPID_PUBLIC_KEY: "smoke",
  VAPID_PRIVATE_KEY: "smoke",
  VAPID_SUBJECT: "mailto:smoke@pemby.app",
} as const;

try {
  // Constructing the senders is the part that matters: it is what reaches into `grammy`,
  // `@grammyjs/auto-retry` and `web-push` and calls into each of them.
  const senders = createSenders(readDeliverEnv({ ...FAKE }));
  const built = [...senders.keys()].sort().join(",");
  if (senders.size !== 3) {
    console.error(`deliver:smoke: expected three senders, built ${senders.size} (${built})`);
    process.exit(1);
  }
  console.log(`deliver:smoke: ok, module loads and builds ${built}`);
} catch (error) {
  // The message is the point here — a `SyntaxError` naming the export that does not exist is
  // exactly what this is for — and nothing in scope is personal data or a secret.
  console.error(
    `deliver:smoke: FAILED to load: ${error instanceof Error ? `${error.constructor.name}: ${error.message}` : "error"}`,
  );
  process.exit(1);
}
