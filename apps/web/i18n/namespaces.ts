import type { createTranslator } from "next-intl";
import { getTranslations } from "next-intl/server";
import type legal from "@/messages/en/legal.json";
import type pricing from "@/messages/en/pricing.json";

/**
 * Typed translators for the namespaces that live in `messages/en/*.json`.
 *
 * `global.d.ts` types next-intl's keys from `messages/en.json` only, so `getTranslations("Pricing")`
 * would not typecheck. This wrapper keeps the same runtime call and types the keys from the
 * namespace files, so a missing key still fails `pnpm typecheck`. Once `global.d.ts` includes these
 * files in `Messages`, callers can switch back to `getTranslations` directly.
 */
export type NamespaceMessages = typeof pricing & typeof legal;

export type NamespaceTranslator<N extends keyof NamespaceMessages> = ReturnType<
  typeof createTranslator<NamespaceMessages, N>
>;

export async function getNamespaceTranslations<N extends keyof NamespaceMessages>(
  namespace: N,
): Promise<NamespaceTranslator<N>> {
  const t = await getTranslations(namespace as never);
  return t as unknown as NamespaceTranslator<N>;
}
