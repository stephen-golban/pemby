/** Error code for a public sign-up refused in production. Clients map it to `Auth.signUpClosed`. */
export const SIGN_UP_CLOSED = "SIGN_UP_CLOSED";

/** Public sign-up (email and anonymous) is open everywhere except production. */
export function signUpOpen(env: "production" | "staging" | "development"): boolean {
  return env !== "production";
}
