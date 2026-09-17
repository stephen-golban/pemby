// Target countries the check can run for. The owner picks the set; Moldova is always in it.
// `terms` are words that mean the country appears in a post (country name, demonym, big cities).

export const DEFAULT_COUNTRIES = ["MD", "UA", "GE"] as const;

interface CountryInfo {
  name: string;
  terms: RegExp;
}

export const COUNTRY_INFO: Record<string, CountryInfo> = {
  MD: { name: "Moldova", terms: /\b(moldova|moldovan|chi[sș]in[aă]u|kishinev)\b/i },
  UA: {
    name: "Ukraine",
    terms: /\b(ukraine|ukrainian|kyiv|kiev|lviv|kharkiv|odesa|odessa|dnipro)\b/i,
  },
  // "Georgia" is also a US state; `stripUsGeorgia` removes the US uses before matching.
  GE: { name: "Georgia", terms: /\b(georgia|tbilisi|batumi)\b/i },
  AM: { name: "Armenia", terms: /\b(armenia|armenian|yerevan)\b/i },
  RS: { name: "Serbia", terms: /\b(serbia|serbian|belgrade|novi sad)\b/i },
  AZ: { name: "Azerbaijan", terms: /\b(azerbaijan|baku)\b/i },
  KZ: { name: "Kazakhstan", terms: /\b(kazakhstan|almaty|astana)\b/i },
  AL: { name: "Albania", terms: /\b(albania|tirana)\b/i },
  BA: { name: "Bosnia and Herzegovina", terms: /\b(bosnia|sarajevo)\b/i },
  MK: { name: "North Macedonia", terms: /\b(north macedonia|macedonia|skopje)\b/i },
  ME: { name: "Montenegro", terms: /\b(montenegro|podgorica)\b/i },
};

const US_GEORGIA =
  /\b(atlanta|savannah|augusta|alpharetta|columbus|macon|athens|marietta|duluth|norcross)\s*,?\s*(georgia|ga)\b|\bgeorgia\s*,?\s*(usa|us|united states)\b|\b(state of georgia|university of georgia|georgia tech|georgia institute)\b/gi;

export function stripUsGeorgia(text: string): string {
  return text.replace(US_GEORGIA, " ");
}

const US_CONTEXT =
  /\b(United States|USA|U\.S\.|Alabama|Arizona|California|Colorado|Florida|Illinois|Massachusetts|New York|North Carolina|Ohio|Pennsylvania|Tennessee|Texas|Virginia|Washington|, GA)\b/;

/** True when "Georgia" in a location string is probably the US state (listed with US places). */
export function georgiaLooksLikeUsState(location: string): boolean {
  return US_CONTEXT.test(location) && !/\b(tbilisi|batumi)\b/i.test(location);
}

/** Parse `--countries MD,UA,GE`; unknown codes are an error so typos don't silently shrink the set. */
export function parseCountries(value: string | undefined): string[] {
  const codes = (value ?? DEFAULT_COUNTRIES.join(","))
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  for (const code of codes) {
    if (!COUNTRY_INFO[code]) {
      throw new Error(
        `Unknown country ${code}. Known: ${Object.keys(COUNTRY_INFO).join(", ")} (add it in eval/src/countries.ts)`,
      );
    }
  }
  return [...new Set(codes)];
}
