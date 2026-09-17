// Reason keys and English fallback text for engine verdicts. Keys are stable: phase 07 renders them
// through i18n with `reasonParams`. Wording follows PLAN D16. Isomorphic.

/** Every reason key the engine emits, with the params it fills and its English text. */
export const ENGINE_REASONS = {
  // Each text says only what the post (or the named source) says, never that a company hires.
  // green
  "country-named": "The post lists {country} among the places for this role.",
  "worldwide-engagement": "The post says it's open worldwide to {engagement}.",
  "company-names-country":
    "The company's careers page names {country}; not confirmed for this role.",
  // yellow
  "location-in-country":
    "The listed location is in {country}; the post doesn't say how the role works.",
  "region-includes": "The post names {region}, which may include {country}.",
  worldwide: "The post says it's open worldwide, but not how people are engaged.",
  "worldwide-location": "The location is listed as worldwide.",
  "worldwide-narrow-location":
    "The post says worldwide, but the listed locations leave out {country}.",
  "country-mentioned": "The post mentions {country}, but not as a firm rule.",
  "locations-leave-out": "The listed locations leave out {country}.",
  "worldwide-limited": "The post says worldwide, but other lines narrow where the role is open.",
  "place-guessed": "A place in the post may be {country}, but that's a guess.",
  "unexplained-location-text":
    "The post has location wording we couldn't fully check for {country}.",
  "second-reading-missing": "A second reading of the post didn't confirm {country}.",
  "timezone-includes": "The post asks for time zones that include {country}.",
  "company-evidence": "Company pages mention {country}; not confirmed for this role.",
  "timezone-preferred": "The post prefers time zones that leave out {country}.",
  "timezone-edge": "{country} is at the edge of the time zones the post asks for.",
  "citizenship-mentioned": "The post mentions citizenship or clearance; check it applies to you.",
  // white
  "no-signal": "The post doesn't say which countries the role is open to.",
  "conflicting-signals": "The post's location rules conflict.",
  "region-unclear": "The post names {region}; unclear whether that includes {country}.",
  "exclusion-unclear": "The post excludes {region}; unclear whether that includes {country}.",
  "exclusion-hedged": "The post's hedged wording may exclude {country}.",
  "restriction-unreadable": "The post may limit locations in a language we don't read yet.",
  "relocation-required": "The post requires relocation, so it isn't a remote role from {country}.",
  "ambiguous-place": "A place name in the post couldn't be pinned down; it may concern {country}.",
  "eor-unsupported": "No confirmed employer of record route in {country}.",
  "user-reports": "People in {country} report the role isn't open to them.",
  // red
  "places-only": "The post limits this role to {places}.",
  excluded: "The post excludes {country}.",
  "work-authorization": "The post asks for the right to work in {places}.",
  citizenship: "The post asks for {requirement}.",
  "onsite-elsewhere": "The post lists on-site or hybrid work in {places}.",
  "posted-elsewhere": "The post lists only {places}.",
  "timezone-required": "The post requires time zones that leave out {country}.",
  "employee-only": "The post says employees only, no contractors.",
  "contractor-only": "The post says contractors only, no employment.",
  "relocation-elsewhere": "The post requires relocation to {places}.",
  "company-excludes": "The company says the role isn't open in {country}.",
} as const;

export type EngineReasonKey = keyof typeof ENGINE_REASONS;
export const ENGINE_REASON_KEYS = Object.keys(ENGINE_REASONS) as EngineReasonKey[];

const MAX_REASON = 120;

export function renderReason(key: EngineReasonKey, params: Record<string, string>): string {
  const text = ENGINE_REASONS[key].replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? "");
  return text.length <= MAX_REASON ? text : `${text.slice(0, MAX_REASON - 3).trimEnd()}...`;
}
