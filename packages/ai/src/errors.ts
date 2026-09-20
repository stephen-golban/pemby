// Errors for the user-key codec.
//
// In its own file because it is imported by both `./user-key.ts` and the route handlers that catch
// it, and because the one rule it has to keep is easiest to hold in a file this small:
//
//   **no message, property or stack here ever carries a key, a blob, a ciphertext or a secret.**
//
// A user's OpenRouter key is their credential on someone else's account. It is never logged, never
// returned to a browser and never put in an error — including the "helpful" kind that prints the
// first few characters, which is still enough to correlate a key across two logs.

/** What went wrong, as a token a caller can branch on without reading English. */
export type UserKeyErrorReason =
  /** The encryption secret is absent from the environment. */
  | "secret-missing"
  /** The secret is present but is not 32 bytes of base64. */
  | "secret-invalid"
  /** The stored blob is not the expected layout, version or length. */
  | "blob-invalid"
  /** AES-GCM rejected the tag: the blob was tampered with, truncated, or encrypted under another secret. */
  | "auth-failed";

export class UserKeyError extends Error {
  readonly reason: UserKeyErrorReason;

  constructor(reason: UserKeyErrorReason, message: string) {
    super(`[ai] ${message}`);
    this.name = "UserKeyError";
    this.reason = reason;
  }
}
