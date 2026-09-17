/** Error code for a public sign-up refused in production. Clients map it to `Auth.signUpClosed`. */
export const SIGN_UP_CLOSED = "SIGN_UP_CLOSED";

/** Public sign-up (email and anonymous) is open everywhere except production. */
export function signUpOpen(env: "production" | "staging" | "development"): boolean {
  return env !== "production";
}

/** Better Auth's error code for a password sign-in to an account whose email is not verified. */
export const EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED";

/** Where a user lands once their email is verified and they are signed in. */
export const AFTER_VERIFY_PATH = "/onboarding";

/**
 * The page every verification link returns to. Better Auth appends `?error=TOKEN_EXPIRED`,
 * `INVALID_TOKEN` or `USER_NOT_FOUND` on failure; on success the page sends the signed-in user to
 * `AFTER_VERIFY_PATH`.
 */
export const VERIFY_EMAIL_PAGE = "/verify-email";

/** Lifetime of a verification link, in seconds (Better Auth default, stated in the email). */
export const VERIFICATION_EXPIRES_IN_SECONDS = 60 * 60;

/** Email verification is required wherever public sign-up is open. Production keeps today's behaviour. */
export function emailVerificationRequired(env: "production" | "staging" | "development"): boolean {
  return signUpOpen(env);
}

/** The page that requests a reset link and sets the new password. */
export const RESET_PASSWORD_PAGE = "/reset-password";

/** Lifetime of a password reset link, in seconds. */
export const RESET_PASSWORD_EXPIRES_IN_SECONDS = 60 * 60;

/**
 * How long a pending claim recorded at sign-up stays settleable. Long enough for the verification
 * email to be read on another device, short enough that an old anonymous session is not pulled
 * into an account verified much later.
 */
export const PENDING_CLAIM_MAX_AGE_HOURS = 24;

/**
 * How recent an anonymous session's data must be for signing in to claim it. Sign-in claims happen
 * in the browser that holds the anonymous cookie, which on a shared computer may be someone else's
 * session from earlier in the day.
 */
export const ANONYMOUS_LINK_MAX_AGE_MINUTES = 60;
