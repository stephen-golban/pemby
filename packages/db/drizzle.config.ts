import { defineConfig } from "drizzle-kit";

// `db:generate` only diffs the schema against drizzle/meta and needs no database.
// Migrations are applied by `pnpm migrate` (src/migrate.ts), never by `drizzle-kit push`.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  ...(process.env.DATABASE_URL ? { dbCredentials: { url: process.env.DATABASE_URL } } : {}),
});
