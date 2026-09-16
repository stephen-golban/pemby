import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { PoolConfig } from "pg";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema> & { $client: Pool };

/** Create a Drizzle client over its own `pg` pool. Call `db.$client.end()` when done. */
export function createDb(url: string, options: Omit<PoolConfig, "connectionString"> = {}): Db {
  const pool = new Pool({ connectionString: url, max: 10, ...options });
  return drizzle({ client: pool, schema });
}

// One pool per process. Kept on globalThis so Next.js dev hot reloads reuse it.
const globalForDb = globalThis as typeof globalThis & { __pembyDb?: Db };

/** The process-wide client, created on first use from `DATABASE_URL`. */
export function getDb(): Db {
  if (!globalForDb.__pembyDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__pembyDb = createDb(url);
  }
  return globalForDb.__pembyDb;
}

/**
 * Lazy process-wide client: importing this module never connects or reads the environment, so
 * `next build` works without `DATABASE_URL`. The first property access calls `getDb()`.
 *
 * `then` is always `undefined`, so `await db` or a thenable check never opens a pool, and
 * `getPrototypeOf` reports the real client's prototype so `is(db, PgDatabase)` holds (that trap
 * does connect, since it needs the real client). Adapters that inspect or store the client
 * (Better Auth's Drizzle adapter, for example) should receive `getDb()`, not this proxy.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    if (prop === "then") return undefined;
    const real = getDb();
    const value: unknown = Reflect.get(real, prop, real);
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
  has(_target, prop) {
    if (prop === "then") return false;
    return Reflect.has(getDb(), prop);
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(getDb());
  },
});
