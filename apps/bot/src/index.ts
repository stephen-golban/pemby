import { createServer } from "node:http";

const env = process.env.APP_ENV ?? "development";
const port = Number(process.env.PORT ?? 3001);

const server = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;

  if (req.method === "GET" && path === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && path === "/telegram/webhook") {
    // Stub: drain the body without logging it (updates contain user data).
    // grammY and secret-token verification arrive in a later phase.
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false }));
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
