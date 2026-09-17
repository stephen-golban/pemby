import { getDb, schema } from "@pemby/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { createTranslator } from "next-intl";
import { defaultLocale } from "@/i18n/config";
import { appEnv } from "@/lib/env";
import messages from "@/messages/en.json";
import { sendResetPasswordEmail, sendVerificationEmail } from "@/lib/email/verification";
import { claimAnonymousUser } from "./claim";
import {
  ANONYMOUS_LINK_MAX_AGE_MINUTES,
  RESET_PASSWORD_EXPIRES_IN_SECONDS,
  RESET_PASSWORD_PAGE,
  SIGN_UP_CLOSED,
  VERIFICATION_EXPIRES_IN_SECONDS,
  VERIFY_EMAIL_PAGE,
  emailVerificationRequired,
  signUpOpen,
} from "./codes";
import { recordPendingClaim, settlePendingClaim } from "./pending-claim";
import {
  anonymousDataIsRecent,
  replaceUnverifiedUser,
  revokeSessionsBeforeVerification,
} from "./users";

/**
 * BETTER_AUTH_URL is required on staging and production and must be https: it sets cookie
 * security, trusted origins and callback URLs. Development may use http or leave it unset.
 */
function authBaseUrl(): string | undefined {
  const url = process.env.BETTER_AUTH_URL;
  if (appEnv() === "development") return url || undefined;
  if (!url) throw new Error("BETTER_AUTH_URL must be set on staging and production");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("BETTER_AUTH_URL is not a valid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("BETTER_AUTH_URL must use https on staging and production");
  }
  return url;
}

// Better Auth reads BETTER_AUTH_SECRET from the environment. Trusted origins default to the base
// URL's origin; extra ones come from BETTER_AUTH_TRUSTED_ORIGINS.
function createAuth() {
  const env = appEnv();
  return betterAuth({
    baseURL: authBaseUrl(),
    // `getDb()`, not the lazy `db` proxy: the adapter inspects and stores the client.
    // Adapter transactions stay off (the default), so the new user row is committed before the
    // anonymous plugin's after-hook runs `onLinkAccount` in its own transaction.
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      // Required wherever sign-up is open (staging, development; phase 06). Production keeps
      // phase 01 behaviour: sign-up closed, no verification step for the existing owner account.
      // With it on, sign-up sets no session and a duplicate email gets a generic response.
      requireEmailVerification: emailVerificationRequired(env),
      resetPasswordTokenExpiresIn: RESET_PASSWORD_EXPIRES_IN_SECONDS,
      // Sessions opened with the old password end with the reset (better-auth 1.7.5
      // dist/api/routes/password.mjs: `deleteUserSessions` after the password is stored).
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        // Better Auth builds `${baseURL}/reset-password/<token>?callbackURL=<redirectTo>`; the
        // callback redirects to our page with `?token=` or `?error=INVALID_TOKEN`. The page is
        // fixed here so the request body cannot choose where the link lands.
        const link = new URL(url);
        link.searchParams.set("callbackURL", RESET_PASSWORD_PAGE);
        await sendResetPasswordEmail(
          user.email,
          link.toString(),
          RESET_PASSWORD_EXPIRES_IN_SECONDS,
        );
      },
    },
    hooks: {
      /**
       * Sign-up for an address held by an account that was never verified deletes that account
       * first, so the address's real owner can take it with their own password
       * (`replaceUnverifiedUser` in users.ts explains the attack this closes). Only where sign-up
       * is open and verification is required; production never reaches this.
       */
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email" || !emailVerificationRequired(env)) return;
        const email = (ctx.body as { email?: unknown } | undefined)?.email;
        if (typeof email !== "string" || !email) return;
        try {
          await replaceUnverifiedUser(email);
        } catch (error) {
          // Leave the sign-up to Better Auth's normal duplicate handling.
          console.error("[auth] unverified user not replaced", {
            error: error instanceof Error ? error.name : "error",
          });
        }
      }),
    },
    emailVerification: {
      // Sent at sign-up (follows requireEmailVerification) and from /send-verification-email.
      // Not on sign-in: the unverified sign-in state offers an explicit, rate-limited resend.
      sendOnSignIn: false,
      autoSignInAfterVerification: true,
      expiresIn: VERIFICATION_EXPIRES_IN_SECONDS,
      sendVerificationEmail: async ({ user, url }) => {
        // Always return to our page, whatever callbackURL the client sent: it shows expired and
        // invalid links and forwards a verified, signed-in user to onboarding.
        const link = new URL(url);
        link.searchParams.set("callbackURL", VERIFY_EMAIL_PAGE);
        await sendVerificationEmail(user.email, link.toString(), VERIFICATION_EXPIRES_IN_SECONDS);
      },
      // Runs inside GET /verify-email after `emailVerified` is set and before the session is
      // created, on whatever device opened the link (better-auth 1.7.5
      // dist/api/routes/email-verification.mjs). A failure is logged, not thrown, so verification
      // still succeeds; the pending row stays and the session hook below retries.
      afterEmailVerification: async (user, request) => {
        // Every session that existed before the address was proven ends here, before the verified
        // user's own session is created: whoever created the account (possibly not the owner of
        // the address) keeps nothing.
        //
        // The claim is deliberately NOT run here. It deletes the anonymous user, and the same
        // request goes on to read the request's session cookie (better-auth 1.7.5
        // dist/api/routes/email-verification.mjs, the `autoSignInAfterVerification` branch, and
        // again in the anonymous plugin's after-hook). A cookie whose session row has just
        // disappeared makes Better Auth append cookie-clearing headers after the new session
        // cookie, which signed the verifying browser out. The claim runs from the session hook
        // below instead, once that lookup has already happened.
        try {
          await revokeSessionsBeforeVerification(user.id, request);
        } catch (error) {
          console.error("[auth] sessions not revoked at verification", {
            error: error instanceof Error ? error.name : "error",
          });
        }
      },
    },
    databaseHooks: {
      user: {
        create: {
          /**
           * Sign-up from an anonymous session records a pending claim (settled on verification).
           * `ctx` is the endpoint context; the anonymous session comes from the request cookie.
           * Only /sign-up/email: other creations (anonymous sign-in, server scripts) never claim.
           */
          after: async (user, ctx) => {
            if (!ctx || ctx.path !== "/sign-up/email") return;
            try {
              const current = await getSessionFromCtx(ctx, { disableRefresh: true });
              if (!current?.user.isAnonymous || current.user.id === user.id) return;
              await recordPendingClaim(current.user.id, user.id);
            } catch (error) {
              // Sign-up still succeeds; the anonymous data stays unclaimed and expires.
              console.error("[auth] pending claim not recorded", {
                error: error instanceof Error ? error.name : "error",
              });
            }
          },
        },
      },
      session: {
        create: {
          // Where the claim on verification happens: `/verify-email` creates the verified user's
          // session here, after Better Auth has read the request's own (anonymous) session, so
          // deleting the anonymous user cannot clear the browser's cookies. Any later session of a
          // verified user settles a claim that did not go through. A no-op lookup when there is
          // nothing pending.
          after: async (session, ctx) => {
            if (ctx?.path === "/sign-in/anonymous") return;
            await settlePendingClaimSafely(session.userId);
          },
        },
      },
    },
    user: {
      /**
       * Production is closed to public sign-ups (owner decision after the phase 01 security
       * review): every user creation that arrives over HTTP is refused, which covers
       * /sign-up/email, /sign-in/anonymous and any provider added later. Better Auth runs this
       * inside `createUser` for every method (better-auth 1.7.5 db/internal-adapter.mjs).
       * `context.request` is only set when the call came through the HTTP router; server-side
       * `auth.api.*` calls without a request (scripts/create-owner.ts) are allowed.
       */
      validateUserInfo: (_data, context) => {
        if (signUpOpen(env) || !context.request) return;
        const t = createTranslator({ locale: defaultLocale, messages, namespace: "Auth" });
        return { error: SIGN_UP_CLOSED, errorDescription: t("signUpClosed") };
      },
    },
    rateLimit: {
      // Memory storage: correct for a single instance only. Multiple instances need
      // `storage: "database"` or secondary storage (docs/conventions.md).
      enabled: env !== "development",
      storage: "memory",
      customRules: {
        // Each call can send an email: 3 per 10 minutes per IP (built-in default is 3 per minute).
        "/send-verification-email": { window: 600, max: 3 },
        // Token checks: the built-in default (100 per 10 s) is far more than a person needs.
        "/verify-email": { window: 60, max: 10 },
        // Also sends an email: 3 per 10 minutes per IP.
        "/request-password-reset": { window: 600, max: 3 },
      },
    },
    advanced: {
      ipAddress: {
        // Railway's edge sets X-Real-IP to the connecting client and ignores a client-supplied
        // value; X-Forwarded-For is appended to, so its left side is spoofable. Better Auth only
        // trusts single-value headers without `trustedProxies`.
        // https://docs.railway.com/networking/public-networking/specs-and-limits
        ipAddressHeaders: ["x-real-ip"],
      },
    },
    plugins: [
      anonymous({
        // Runs after a response that sets a session cookie for a request carrying an anonymous
        // session (better-auth 1.7.5 dist/plugins/anonymous/index.mjs): in practice, signing in
        // to an existing verified account. The claim deletes the anonymous user inside its own
        // transaction, so the plugin's later, separate delete is disabled.
        disableDeleteAnonymousUser: true,
        onLinkAccount: async ({ anonymousUser, newUser, ctx }) => {
          // Not on /verify-email: a link can be opened in someone else's browser (or sent to
          // them), and their anonymous data must not move into the link's account. The claim on
          // verification is the pending claim recorded at sign-up, settled above.
          if (ctx.path.startsWith("/verify-email")) return;
          // Only recent anonymous data: on a shared computer the anonymous cookie may belong to
          // whoever used the browser earlier (users.ts). Older data is left to expire.
          if (
            !(await anonymousDataIsRecent(anonymousUser.user.id, ANONYMOUS_LINK_MAX_AGE_MINUTES))
          ) {
            return;
          }
          await claimAnonymousUser(anonymousUser.user.id, newUser.user.id);
        },
      }),
      // Must stay last: lets server actions set auth cookies.
      nextCookies(),
    ],
  });
}

async function settlePendingClaimSafely(userId: string): Promise<void> {
  try {
    await settlePendingClaim(userId);
  } catch (error) {
    console.error("[auth] pending claim not settled", {
      error: error instanceof Error ? error.name : "error",
    });
  }
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as typeof globalThis & { __pembyAuth?: Auth };

/**
 * The Better Auth instance, created on first use so `next build` does not need `DATABASE_URL` or
 * `APP_ENV`. A configuration error throws on every call rather than caching a broken instance.
 */
export function getAuth(): Auth {
  globalForAuth.__pembyAuth ??= createAuth();
  return globalForAuth.__pembyAuth;
}
