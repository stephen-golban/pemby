// OpenRouter key routing (PLAN D17). Server-only.
//
// public  : OPENROUTER_KEY_PUBLIC, public job posts only, may use free models that train.
// private : OPENROUTER_KEY_PRIVATE, personal data, zero data retention on every request.
// user    : the user's own OpenRouter key (OAuth PKCE), same per-request ZDR as private.
import { createOpenRouter, type OpenRouterProvider } from "@openrouter/ai-sdk-provider";
import type { KeyClass } from "@pemby/core";

// Shared with the `key_class` enum in `@pemby/db`, so both come from `@pemby/core`.
export { KEY_CLASSES, type KeyClass } from "@pemby/core";

export type EnvLike = Readonly<Record<string, string | undefined>>;

/** Provider routing forced onto every private and user request body. */
export const ZDR_PROVIDER_ROUTING = { zdr: true, data_collection: "deny" } as const;

const APP_NAME = "Pemby";
const APP_URL = "https://pemby.app";

export class AiConfigError extends Error {
  constructor(message: string) {
    super(`[ai] ${message}`);
    this.name = "AiConfigError";
  }
}

export function requiresZdr(keyClass: KeyClass): boolean {
  return keyClass !== "public";
}

type FetchFn = typeof globalThis.fetch;

/**
 * Wraps fetch so every request body carries `provider.zdr = true` and
 * `provider.data_collection = "deny"`, merged over whatever the call site set.
 * The SDK merges `providerOptions.openrouter.provider` shallowly and would otherwise let a
 * caller's `provider: { order: [...] }` drop the ZDR flag. Non-JSON bodies fail closed.
 */
export function withEnforcedZdr(base: FetchFn = globalThis.fetch): FetchFn {
  return async (input, init) => {
    if (init?.body == null) return base(input, init);
    if (typeof init.body !== "string") {
      throw new AiConfigError(
        "Refusing a non-JSON request body on a ZDR key; ZDR cannot be enforced.",
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(init.body);
    } catch {
      throw new AiConfigError("Refusing a request body that is not JSON on a ZDR key.");
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new AiConfigError("Refusing a request body that is not a JSON object on a ZDR key.");
    }
    const record = body as Record<string, unknown>;
    const existing = record.provider;
    const provider =
      typeof existing === "object" && existing !== null && !Array.isArray(existing) ? existing : {};
    record.provider = { ...provider, ...ZDR_PROVIDER_ROUTING };
    return base(input, { ...init, body: JSON.stringify(record) });
  };
}

function readKey(env: EnvLike, name: "OPENROUTER_KEY_PUBLIC" | "OPENROUTER_KEY_PRIVATE"): string {
  const value = env[name]?.trim();
  if (!value) throw new AiConfigError(`${name} is not set.`);
  return value;
}

function build(keyClass: KeyClass, apiKey: string): OpenRouterProvider {
  const zdr = requiresZdr(keyClass);
  return createOpenRouter({
    apiKey,
    appName: APP_NAME,
    appUrl: APP_URL,
    compatibility: "strict",
    // extraBody documents intent in the SDK; withEnforcedZdr is the guarantee.
    ...(zdr
      ? { extraBody: { provider: { ...ZDR_PROVIDER_ROUTING } }, fetch: withEnforcedZdr() }
      : {}),
  });
}

export interface OpenRouterOptions {
  /** Required for keyClass "user"; rejected for the other classes. */
  userApiKey?: string;
  /** Defaults to process.env. Providers built from process.env are cached per key class. */
  env?: EnvLike;
}

const cache = new Map<"public" | "private", OpenRouterProvider>();

/** Returns an OpenRouter provider bound to the key for `keyClass`. Never logs keys. */
export function getOpenRouter(
  keyClass: KeyClass,
  options: OpenRouterOptions = {},
): OpenRouterProvider {
  if (keyClass === "user") {
    const apiKey = options.userApiKey?.trim();
    if (!apiKey) throw new AiConfigError('keyClass "user" needs the user\'s OpenRouter key.');
    return build("user", apiKey);
  }
  if (options.userApiKey !== undefined) {
    throw new AiConfigError(`A user key was passed with keyClass "${keyClass}".`);
  }

  const useDefaultEnv = options.env === undefined;
  if (useDefaultEnv) {
    const hit = cache.get(keyClass);
    if (hit) return hit;
  }
  const env = options.env ?? process.env;
  const provider = build(
    keyClass,
    readKey(env, keyClass === "public" ? "OPENROUTER_KEY_PUBLIC" : "OPENROUTER_KEY_PRIVATE"),
  );
  if (useDefaultEnv) cache.set(keyClass, provider);
  return provider;
}
