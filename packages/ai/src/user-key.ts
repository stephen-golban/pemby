// A user's own OpenRouter key, encrypted at rest (phase 09). Server-only, Node built-ins only, no
// new dependency.
//
// This is the first encryption in the repo — everything before it was hashing or HMAC — so the
// whole of it is written to be read, and every rule below is a rule because breaking it fails
// quietly rather than loudly.
//
// **Layout**: `version(1) || iv(12) || authTag(16) || ciphertext`, base64 into one text column.
// The version byte is here from the first row. Adding it later is a migration over every stored
// blob, and the migration you have not written yet is the one you need when a secret leaks.
//
// **The IV is 12 fresh bytes from `randomBytes`, on every single encryption.** Node does not
// enforce the length: an 8-byte or 16-byte IV is accepted silently, so nothing will tell you. And
// an IV must never be derived from a user id, a row id or a counter — under GCM, reusing a
// (key, IV) pair leaks the XOR of the two plaintexts *and* compromises the authentication key, at
// which point an attacker can forge tags for blobs we will happily decrypt and use.
//
// **The secret is base64-decoded and asserted to be 32 bytes.** This is the footgun that fails
// silently. A correct 32-byte key base64-encodes to 44 characters, and `Buffer.from(secret)` — no
// encoding — gives 44 bytes, so Node throws `Invalid key length` and you find out immediately. But
// a 24-byte secret base64-encodes to exactly 32 characters, so `Buffer.from(secret)` is a *valid*
// 32-byte AES key: everything works, forever, with a third of the intended entropy and no error
// anywhere. So: always `Buffer.from(secret, "base64")`, always assert 32.
//
// **A decrypt that fails throws.** It never returns the ciphertext, an empty string, or a "best
// effort" anything. `final()` throwing on a bad tag is the guarantee working, not an inconvenience.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { UserKeyError } from "./errors";
import type { EnvLike } from "./keys";

/**
 * 32 random bytes, base64. Generate with `openssl rand -base64 32`, store it in Railway, and never
 * in a file. It is **not** in `.env.example` yet — that file belongs to one order, which adds the
 * name with an empty value; until then this variable exists only here and in Railway.
 *
 * Rotating it makes every stored blob undecryptable, which is why the version byte exists: a
 * future secret is version 2, old rows stay readable under version 1 until they are re-encrypted.
 */
export const USER_KEY_SECRET_VAR = "AI_USER_KEY_SECRET";

/** Current blob version. Bumped only together with a way to read every older version. */
export const USER_KEY_VERSION = 1;

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const ALGORITHM = "aes-256-gcm";

/** Decoded secrets, keyed by the raw env value, so a hot path does not base64-decode per call. */
const keyCache = new Map<string, Buffer>();

/**
 * The 32-byte AES key, or a `UserKeyError` naming the problem and nothing else.
 *
 * Fails on first use rather than at module load: `@pemby/ai` is imported by surfaces that never
 * touch a user key, and a module-load throw would take out a page that has no business needing
 * this secret. `assertUserKeySecret` is the boot-time check for the services that do.
 */
function secretKeyOf(env: EnvLike): Buffer {
  const raw = env[USER_KEY_SECRET_VAR];
  if (raw === undefined || raw.trim() === "") {
    throw new UserKeyError(
      "secret-missing",
      `${USER_KEY_SECRET_VAR} is not set; a user's OpenRouter key cannot be stored or read.`,
    );
  }
  const cached = keyCache.get(raw);
  if (cached !== undefined) return cached;

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    // The length, not the value: 24 bytes here is the silent-downgrade case above, and a reader
    // of this error needs to know which number they got.
    throw new UserKeyError(
      "secret-invalid",
      `${USER_KEY_SECRET_VAR} must be ${KEY_BYTES} bytes of base64; it decodes to ${key.length}.`,
    );
  }
  keyCache.set(raw, key);
  return key;
}

/**
 * Boot-time check for a service that will need the secret: call it at startup so a misconfigured
 * deploy fails on boot rather than on the first person who tries to connect their key.
 */
export function assertUserKeySecret(env: EnvLike = process.env): void {
  secretKeyOf(env);
}

/** The stored blob for one plaintext key. A fresh IV every call, so two calls never agree. */
export function encryptUserKey(plaintext: string, env: EnvLike = process.env): string {
  if (plaintext.length === 0) {
    throw new UserKeyError("blob-invalid", "Refusing to encrypt an empty user key.");
  }
  const key = secretKeyOf(env);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  // After `final()`. Before it, `getAuthTag()` throws — the tag does not exist yet.
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([USER_KEY_VERSION]), iv, tag, ciphertext]).toString("base64");
}

/** The plaintext key for one stored blob, or a throw. There is no third outcome. */
export function decryptUserKey(blob: string, env: EnvLike = process.env): string {
  const key = secretKeyOf(env);
  const raw = Buffer.from(blob, "base64");
  // One byte of ciphertext is the shortest thing worth storing; base64 decoding is lenient, so
  // this length check is also what catches a truncated or non-base64 column value.
  if (raw.length < 1 + IV_BYTES + TAG_BYTES + 1) {
    throw new UserKeyError("blob-invalid", "Stored user key is too short to be a valid blob.");
  }
  const version = raw[0];
  if (version !== USER_KEY_VERSION) {
    throw new UserKeyError("blob-invalid", `Stored user key has unknown version ${version}.`);
  }

  const iv = raw.subarray(1, 1 + IV_BYTES);
  const tag = raw.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(1 + IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  // Before `final()`. Set afterwards, or not at all, and `final()` throws.
  decipher.setAuthTag(tag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // The original error is swallowed on purpose: it can carry the failing buffer in its context,
    // and this one is thrown where a log might see it.
    throw new UserKeyError(
      "auth-failed",
      "Stored user key failed authentication; it was altered or was encrypted under another secret.",
    );
  }
  const text = plaintext.toString("utf8");
  if (text.length === 0) {
    throw new UserKeyError("blob-invalid", "Stored user key decrypted to an empty string.");
  }
  return text;
}

/**
 * Lowercase-hex SHA-256 of the key itself.
 *
 * This is what OpenRouter's own deep links are keyed on — `https://openrouter.ai/keys/<hash>` and
 * `https://openrouter.ai/logs?api_key_hash=<hash>`, which resolve only for the signed-in owner —
 * and it is stored beside the blob so "where do I manage this?" needs no decryption. It is a hash
 * of the key, not of the blob: the blob changes on every re-encryption and would link to nothing.
 *
 * Pemby cannot revoke a user's key with it. Deleting our copy is what "disconnect" means.
 */
export function userKeyHash(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}
