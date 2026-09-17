"use client";

import type { ParsedProfilePartial } from "@pemby/core";
import { useLocale } from "next-intl";
import { useMemo } from "react";

/** Country names in the page's locale from ISO 3166-1 alpha-2 codes; falls back to the code. */
export function useCountryName(): (code: string | null | undefined) => string | null {
  const locale = useLocale();
  return useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      names = null;
    }
    return (code) => {
      if (!code) return null;
      try {
        return names?.of(code.toUpperCase()) ?? code;
      } catch {
        return code;
      }
    };
  }, [locale]);
}

/** Non-empty trimmed strings only: streamed arrays can hold half-written items. */
export function cleanStrings(values: readonly (string | undefined)[] | undefined): string[] {
  return (values ?? []).filter((v): v is string => typeof v === "string" && v.trim() !== "");
}

type PartialLanguage = NonNullable<ParsedProfilePartial["languages"]>[number];
type PartialLink = NonNullable<ParsedProfilePartial["links"]>[number];

export function completeLanguages(profile: ParsedProfilePartial | null) {
  return (profile?.languages ?? []).filter(
    (l): l is PartialLanguage & { name: string } => typeof l?.name === "string" && l.name !== "",
  );
}

export function completeLinks(profile: ParsedProfilePartial | null) {
  return (profile?.links ?? []).filter(
    (l): l is PartialLink & { url: string } =>
      typeof l?.url === "string" && /^https?:\/\/[^/\s]+\.[^/\s]+/i.test(l.url),
  );
}

/** "github.com/name" rather than the full URL with scheme and trailing slash. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}
