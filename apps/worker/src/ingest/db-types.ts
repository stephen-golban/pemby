import type { Db } from "@pemby/db";

/** A Drizzle transaction on the Pemby schema. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Either the client or a transaction; helpers that only query take this. */
export type DbOrTx = Db | Tx;
