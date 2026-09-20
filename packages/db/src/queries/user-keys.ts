// The user's own OpenRouter key, at rest (PLAN D17, phase 09).
//
// **This file is the only thing in the codebase that reads or writes the ciphertext.** It never
// decrypts — the codec is `encryptUserKey` / `decryptUserKey` in `@pemby/ai`, which `@pemby/db` must
// not depend on — and it never logs. A stored key is never returned to a browser and never leaves
// the server: the settings page is served by `selectUserAiKeyStatus`, which cannot return the blob
// because it does not select it.
//
// `user_ai_keys.user_id` is unique and `on delete cascade`, so there is one row per person and
// deleting an account takes the secret with it. `key_hash` is the lower-case hex SHA-256 of the key
// and is not a credential: it exists only to build the two OpenRouter deep links that let the user
// manage their own key, and which resolve only for the signed-in owner. Pemby cannot revoke a user's
// key — `DELETE /api/v1/keys/{hash}` needs a management key on the user's own account — so
// "disconnect" means `deleteUserAiKey` plus a link.
//
// **No demo exclusion anywhere in this file**, and the reason is not an oversight: every statement
// here is scoped to one named `user_id` and none of them spends money or changes a job. A demo user
// has no OpenRouter key to connect; if one is ever seeded, the guard belongs at the call that spends
// against the key, not at the row that stores it.
import { eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { userAiKeys } from "../schema";

export type UserAiKey = typeof userAiKeys.$inferSelect;
export type NewUserAiKey = typeof userAiKeys.$inferInsert;

export interface UpsertUserAiKeyParams {
  userId: string;
  /** base64 of `version(1) || iv(12) || authTag(16) || ciphertext`, from `encryptUserKey`. */
  blob: string;
  /** Lower-case hex SHA-256 of the plaintext key. */
  keyHash: string;
  /** The label OpenRouter returned, when it returned one. Display only. */
  label?: string | null;
}

/**
 * Store, or replace, the user's connected key.
 *
 * Connecting again replaces the row rather than adding one — `user_id` is unique, so it has to —
 * and **resets `last_used_at` to null**, because the new key has not been used. Leaving the old
 * timestamp would tell the settings page a brand-new key had already made a call.
 */
export async function upsertUserAiKey(
  db: Db,
  { userId, blob, keyHash, label }: UpsertUserAiKeyParams,
): Promise<void> {
  await db
    .insert(userAiKeys)
    .values({ userId, encryptedKey: blob, keyHash, label: label ?? null })
    .onConflictDoUpdate({
      target: userAiKeys.userId,
      set: {
        encryptedKey: sql`excluded.encrypted_key`,
        keyHash: sql`excluded.key_hash`,
        label: sql`excluded.label`,
        lastUsedAt: sql`null`,
        updatedAt: sql`now()`,
      },
    });
}

export interface LoadedUserAiKey {
  /** The ciphertext. Pass it to `decryptUserKey`; never log it, never serialize it to a client. */
  blob: string;
  keyHash: string;
  label: string | null;
  connectedAt: Date;
  lastUsedAt: Date | null;
}

/**
 * The user's stored key, or null when they have not connected one.
 *
 * Call this only on the path that is about to make a model call. Anything that merely wants to know
 * *whether* a key is connected — the settings page, the kit quota's `ownKeyConnected` — calls
 * `selectUserAiKeyStatus`, which cannot leak the blob because it does not read it.
 */
export async function loadUserAiKey(db: Db, userId: string): Promise<LoadedUserAiKey | null> {
  const rows = await db
    .select({
      blob: userAiKeys.encryptedKey,
      keyHash: userAiKeys.keyHash,
      label: userAiKeys.label,
      connectedAt: userAiKeys.createdAt,
      lastUsedAt: userAiKeys.lastUsedAt,
    })
    .from(userAiKeys)
    .where(eq(userAiKeys.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export interface UserAiKeyStatus {
  keyHash: string;
  label: string | null;
  connectedAt: Date;
  lastUsedAt: Date | null;
}

/**
 * Everything the settings page may know about a connected key: that there is one, when it was
 * connected, when it was last used, its label, and the hash that builds the user's own OpenRouter
 * links. **Not the ciphertext** — this query does not select it, so no surface built on this can
 * accidentally serialize a secret into a page payload.
 */
export async function selectUserAiKeyStatus(
  db: Db,
  userId: string,
): Promise<UserAiKeyStatus | null> {
  const rows = await db
    .select({
      keyHash: userAiKeys.keyHash,
      label: userAiKeys.label,
      connectedAt: userAiKeys.createdAt,
      lastUsedAt: userAiKeys.lastUsedAt,
    })
    .from(userAiKeys)
    .where(eq(userAiKeys.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Disconnect: delete our copy. Returns whether there was one.
 *
 * This is the whole of what Pemby can do. The key itself stays alive on the user's OpenRouter
 * account until they revoke it there, which is why the disconnect UI has to link them to
 * `openrouter.ai/keys/<hash>` and say so rather than claiming the key has been revoked.
 */
export async function deleteUserAiKey(db: Db, userId: string): Promise<boolean> {
  const deleted = await db
    .delete(userAiKeys)
    .where(eq(userAiKeys.userId, userId))
    .returning({ id: userAiKeys.id });
  return deleted.length > 0;
}

/**
 * Stamp `last_used_at` after a model call that used this key.
 *
 * Its own statement, not part of the load: the load happens before the call and this happens after
 * one that may have failed, and folding them together would date a key as used by an attempt that
 * never reached OpenRouter. Fire-and-forget at the call site — a failed stamp must never fail the
 * kit the user is waiting for.
 */
export async function markUserAiKeyUsed(db: Db, userId: string): Promise<void> {
  await db
    .update(userAiKeys)
    .set({ lastUsedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(userAiKeys.userId, userId));
}
