"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useCountryName } from "@/components/profile";

// The ISO 3166-1 alpha-2 codes the pickers offer. They come from `COUNTRY_CODES` in `@pemby/core`,
// passed in by the server component rather than imported here, so the browser bundle never pulls
// in core's zod schemas and eligibility engine. Names are resolved in the page's locale through
// `Intl.DisplayNames`, so the list is sorted the way the reader reads it.

const CountryCodes = createContext<readonly string[]>([]);

export function CountryListProvider({
  codes,
  children,
}: {
  codes: readonly string[];
  children: ReactNode;
}) {
  return <CountryCodes value={codes}>{children}</CountryCodes>;
}

export interface CountryOption {
  code: string;
  name: string;
}

/** Every country as `{ code, name }`, sorted by localized name. */
export function useCountryOptions(): CountryOption[] {
  const codes = useContext(CountryCodes);
  const countryName = useCountryName();
  return useMemo(() => {
    const collator = new Intl.Collator(undefined, { sensitivity: "base" });
    return codes
      .map((code) => ({ code, name: countryName(code) ?? code }))
      .sort((a, b) => collator.compare(a.name, b.name));
  }, [codes, countryName]);
}
