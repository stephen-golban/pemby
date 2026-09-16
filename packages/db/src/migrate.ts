// Apply committed SQL migrations from ../drizzle with Drizzle's migrator.
// Usage: RAILWAY_SERVICE=web ./scripts/dev-staging.sh pnpm --filter @pemby/db migrate
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
const db = createDb(url, { max: 1 });

try {
  await migrate(db, { migrationsFolder });
  console.log("migrations applied");
} finally {
  await db.$client.end();
}
