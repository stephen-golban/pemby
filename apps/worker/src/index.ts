const env = process.env.APP_ENV ?? "development";

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
