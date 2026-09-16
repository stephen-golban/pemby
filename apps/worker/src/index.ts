import { PrivateConfigError, loadPrivateConfig } from "@pemby/core/private-config";

const env = process.env.APP_ENV ?? "development";

// Load private config at boot so a bad token, ref or layout crashes the deploy instead of the
// first job (docs/private-config.md). Log the version and counts only, never contents.
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

console.log(`worker started (env: ${env})`);

// Keep the process alive until queues are wired in a later phase.
const keepAlive = setInterval(() => {}, 60_000);

function shutdown(signal: NodeJS.Signals): void {
  console.log(`worker received ${signal}, shutting down`);
  clearInterval(keepAlive);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
