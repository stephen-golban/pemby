// Database side of `/api/openrouter/*`.
//
// Every statement here goes through a `@pemby/db` kernel helper. Nothing in this feature is an
// ordinary per-surface read: the ciphertext, its hash and the row's lifecycle are one design, and
// a second implementation of any part of it in raw SQL would be a second place for the one rule —
// *the blob never leaves the server* — to drift. That is also why `selectUserAiKeyStatus` exists
// and is used for everything the page reads: it does not select the ciphertext column, so a view
// built from it cannot leak one however carelessly it is serialized. `loadUserAiKey` does return
// the blob, and it is called from exactly one function below, which decrypts and returns a
// plaintext key to exactly one caller.

import { encryptUserKey, decryptUserKey, userKeyHash, UserKeyError } from "@pemby/ai";
import {
  getDb,
  deleteUserAiKey,
  loadUserAiKey,
  selectUserAiKeyStatus,
  upsertUserAiKey,
} from "@pemby/db";
import type { OpenRouterError, OpenRouterKeyView } from "./view";

const DISCONNECTED: OpenRouterKeyView = {
  connected: false,
  label: null,
  keyHash: null,
  connectedAt: null,
  lastUsedAt: null,
};

export async function loadKeyView(userId: string): Promise<OpenRouterKeyView> {
  const status = await selectUserAiKeyStatus(getDb(), userId);
  if (!status) return DISCONNECTED;
  return {
    connected: true,
    label: status.label,
    keyHash: status.keyHash,
    connectedAt: status.connectedAt.toISOString(),
    lastUsedAt: status.lastUsedAt === null ? null : status.lastUsedAt.toISOString(),
  };
}

/**
 * Encrypt and store one key, replacing whatever was there.
 *
 * The plaintext is a parameter and a local and never anything else: it is hashed, encrypted and
 * dropped inside this function, and the caller gets back a view with no secret in it.
 *
 * A `UserKeyError` here means the environment is wrong rather than the key is — the secret is
 * missing, or it does not decode to 32 bytes — so it comes back as `secret_unavailable`, which is
 * a deployment fact and reads as one.
 */
export async function storeKey(input: {
  userId: string;
  key: string;
  label: string | null;
}): Promise<OpenRouterKeyView | { error: OpenRouterError }> {
  let blob: string;
  let keyHash: string;
  try {
    blob = encryptUserKey(input.key);
    keyHash = userKeyHash(input.key);
  } catch (error) {
    if (error instanceof UserKeyError) return { error: "secret_unavailable" };
    throw error;
  }
  await upsertUserAiKey(getDb(), { userId: input.userId, blob, keyHash, label: input.label });
  return loadKeyView(input.userId);
}

/**
 * The stored key, decrypted, for the one caller that is about to ask OpenRouter about it.
 *
 * The three outcomes are kept apart because the person can act on each differently: there is no
 * key (connect one), the secret cannot read the blob (a rotation happened; connect again), or the
 * environment has no secret at all (nothing the person can do, and it is not their fault).
 */
export async function readKey(
  userId: string,
): Promise<{ key: string; keyHash: string } | { error: OpenRouterError }> {
  const row = await loadUserAiKey(getDb(), userId);
  if (!row) return { error: "not_connected" };
  try {
    return { key: decryptUserKey(row.blob), keyHash: row.keyHash };
  } catch (error) {
    if (error instanceof UserKeyError) {
      return {
        error:
          error.reason === "auth-failed" || error.reason === "blob-invalid"
            ? "key_undecryptable"
            : "secret_unavailable",
      };
    }
    throw error;
  }
}

/** Disconnect: delete Pemby's copy. Returns whether there was one to delete. */
export async function forgetKey(userId: string): Promise<boolean> {
  return deleteUserAiKey(getDb(), userId);
}
