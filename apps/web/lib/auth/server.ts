import { getDb, schema } from "@pemby/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { createTranslator } from "next-intl";
import { defaultLocale } from "@/i18n/config";
import { appEnv } from "@/lib/env";
import messages from "@/messages/en.json";
import { claimAnonymousUser } from "./claim";
import { SIGN_UP_CLOSED, signUpOpen } from "./codes";

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
      // No email verification for now (owner decision, phase 01).
      requireEmailVerification: false,
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
        // Runs after sign-up or sign-in from an anonymous session (better-auth 1.7.5
        // dist/plugins/anonymous/index.mjs). The claim deletes the anonymous user inside its own
        // transaction, so the plugin's later, separate delete is disabled.
        disableDeleteAnonymousUser: true,
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await claimAnonymousUser(anonymousUser.user.id, newUser.user.id);
        },
      }),
      // Must stay last: lets server actions set auth cookies.
      nextCookies(),
    ],
  });
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
