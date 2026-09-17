// Signals from structured fields: ATS location strings, workplace type, employment type and
// schema.org JobPosting JSON-LD. Isomorphic.

import { ALPHA3_TO_ALPHA2, COUNTRIES, type CountryCode } from "../regions/countries";
import type { RegionCode } from "../regions/groups";
import {
  findPlaceMentions,
  isCanadianProvinceAbbreviation,
  isUsStateAbbreviation,
  lookupPlace,
  type PlaceMention,
  type PlaceRef,
} from "../regions/match";
import type { AnchorWorkplace, EligibilitySignal, SignalScopes } from "../signals";

export interface LocationReading {
  signals: EligibilitySignal[];
  /** Location items with an ambiguous name ("Georgia" alone). */
  ambiguous: string[];
}

const REMOTE_RE =
  /\b(?:remote|home[- ]based|work from home|wfh|telecommute|distributed|fully remote|remoto|remota|télétravail)\b/i;
const HYBRID_RE = /\bhybrid\b/i;
const ONSITE_RE = /\b(?:on[- ]?site|in[- ]office|office[- ]based|in office)\b/i;
const WORLDWIDE_RE =
  /^\s*(?:(?:remote|home[- ]based|fully remote)\s*[-–—,:(/|]?\s*)?(?:worldwide|global(?:ly)?|anywhere(?: in the world)?|world ?wide|international|any location|all locations)\s*\)?\s*(?:[-–—,:(/|]?\s*(?:remote|home[- ]based))?\s*\)?\s*$/i;

type MutableScopes = { countries: CountryCode[]; regions: RegionCode[]; named?: Set<CountryCode> };

/** B3 M2: two-letter or three-letter codes that are also US state codes ("GE", "GEO") are guesses. */
const GUESSED_CODES: ReadonlySet<CountryCode> = new Set(["GE"]);

function pushRef(scopes: MutableScopes, ref: PlaceRef, guessed = false) {
  if (ref.type === "country" && !scopes.countries.includes(ref.country)) {
    scopes.countries.push(ref.country);
  }
  if (ref.type === "country" && !guessed && !ref.guessed) {
    (scopes.named ??= new Set()).add(ref.country);
  }
  if (ref.type === "region" && !scopes.regions.includes(ref.region)) {
    scopes.regions.push(ref.region);
  }
}

/**
 * Places named in one ATS location item ("Remote - US", "USA-CA-San Mateo", "Toronto, ON").
 * `mentions` come from the whole joined list, so "Georgia" is resolved against its neighbours.
 */
function placesInItem(
  item: string,
  mentions: readonly PlaceMention[],
): { scopes: SignalScopes; guessed: CountryCode[]; ambiguous: string[] } {
  const scopes: MutableScopes = { countries: [], regions: [], named: new Set() };
  const ambiguous: string[] = [];
  for (const mention of mentions) {
    if (mention.ref.type === "ambiguous") ambiguous.push(mention.text);
    else pushRef(scopes, mention.ref);
  }
  // "USA-CA-San Mateo", "GBR-London", "IRL-Dublin", "CAN-ON-Waterloo".
  const alpha3 = /^([A-Z]{3})[-_]/.exec(item.trim())?.[1];
  const fromAlpha3 = alpha3 ? ALPHA3_TO_ALPHA2.get(alpha3) : undefined;
  if (fromAlpha3) {
    pushRef(
      scopes,
      { type: "country", country: fromAlpha3, via: "country" },
      GUESSED_CODES.has(fromAlpha3),
    );
  }
  // "IN_Bangalore".
  const alpha2 = /^([A-Z]{2})_/.exec(item.trim())?.[1];
  if (alpha2 && COUNTRIES.has(alpha2)) {
    pushRef(
      scopes,
      { type: "country", country: alpha2, via: "country" },
      GUESSED_CODES.has(alpha2),
    );
  }
  // "Denver, CO", "Toronto, ON", "Remote (US)", "United States (US)".
  if (scopes.countries.length === 0 && scopes.regions.length === 0) {
    const tail = /,\s*([A-Z]{2})\s*$/.exec(item)?.[1];
    if (tail && isUsStateAbbreviation(tail)) {
      pushRef(scopes, { type: "country", country: "US", via: "subdivision" });
    } else if (tail && isCanadianProvinceAbbreviation(tail)) {
      pushRef(scopes, { type: "country", country: "CA", via: "subdivision" });
    }
    const paren = /\(([A-Z]{2})\)/.exec(item)?.[1];
    if (paren === "US" || paren === "UK") {
      pushRef(scopes, { type: "country", country: paren === "UK" ? "GB" : "US", via: "country" });
    }
  }
  const guessed = scopes.countries.filter((c) => !scopes.named?.has(c));
  return { scopes: { countries: scopes.countries, regions: scopes.regions }, guessed, ambiguous };
}

function workplaceOfItem(item: string, jobWorkplace: string | null): AnchorWorkplace {
  if (HYBRID_RE.test(item)) return "hybrid";
  if (REMOTE_RE.test(item)) return "remote";
  if (ONSITE_RE.test(item)) return "onsite";
  switch (jobWorkplace) {
    case "remote":
      return "remote";
    case "hybrid":
      return "hybrid";
    case "onsite":
      return "onsite";
    default:
      return "unspecified";
  }
}

/**
 * Anchor signals from the ATS location list, one per workplace mode, plus an `ats-structured`
 * worldwide signal for items such as "Home based - Worldwide". Anchors never claim eligibility.
 */
export function readLocations(
  locations: readonly string[],
  workplaceType: string | null,
): LocationReading {
  const byMode = new Map<
    AnchorWorkplace,
    {
      countries: CountryCode[];
      regions: RegionCode[];
      items: string[];
      guessed: Set<CountryCode>;
      named: Set<CountryCode>;
    }
  >();
  const signals: EligibilitySignal[] = [];
  const ambiguous: string[] = [];
  const worldwideItems: string[] = [];
  const items = locations.map((raw) => raw.trim()).filter(Boolean);
  const joined = items.join("\n");
  const allMentions = findPlaceMentions(joined);
  // B4: "Kyiv, Ukraine; Remote - United States" on a remote job: when another item with places says
  // remote itself, an item without a workplace word may be an office, so it does not inherit the
  // job's workplace.
  const explicitRemoteWithPlace = items.some(
    (item) => REMOTE_RE.test(item) && findPlaceMentions(item).length > 0,
  );
  let offset = 0;
  for (const item of items) {
    const itemStart = offset;
    offset += item.length + 1;
    if (WORLDWIDE_RE.test(item)) {
      worldwideItems.push(item);
      continue;
    }
    const mentions = allMentions
      .filter((m) => m.start >= itemStart && m.end <= itemStart + item.length)
      .map((m) => ({ ...m, start: m.start - itemStart, end: m.end - itemStart }));
    const { scopes, guessed, ambiguous: unclear } = placesInItem(item, mentions);
    ambiguous.push(...unclear);
    const mode = workplaceOfItem(
      item,
      explicitRemoteWithPlace && workplaceType === "remote" ? null : workplaceType,
    );
    const bucket = byMode.get(mode) ?? {
      countries: [],
      regions: [],
      items: [],
      guessed: new Set<CountryCode>(),
      named: new Set<CountryCode>(),
    };
    for (const c of scopes.countries) {
      if (!bucket.countries.includes(c)) bucket.countries.push(c);
      if (guessed.includes(c)) bucket.guessed.add(c);
      else bucket.named.add(c);
    }
    for (const r of scopes.regions) if (!bucket.regions.includes(r)) bucket.regions.push(r);
    bucket.items.push(item);
    byMode.set(mode, bucket);
  }
  for (const [mode, bucket] of byMode) {
    if (bucket.countries.length === 0 && bucket.regions.length === 0) continue;
    const guessedCountries = [...bucket.guessed].filter((c) => !bucket.named.has(c));
    signals.push({
      source: "ats-structured",
      kind: "anchor",
      scopes: { countries: bucket.countries, regions: bucket.regions },
      ...(guessedCountries.length > 0 ? { guessedCountries } : {}),
      waysOfWorking: [],
      strength: "implied",
      evidence: { field: "locations", text: bucket.items.join("; ") },
      anchor: { workplace: mode },
    });
  }
  if (worldwideItems.length > 0) {
    signals.push({
      source: "ats-structured",
      kind: "worldwide",
      scopes: { countries: [], regions: [] },
      waysOfWorking: [],
      // A location label, not a sentence: the employer typed it, but "Worldwide" boards often
      // still restrict in the text. Weak: never decisive on its own.
      strength: "weak",
      evidence: { field: "locations", text: worldwideItems.join("; ") },
    });
  }
  return { signals, ambiguous };
}

/** Engagement from the raw ATS employment type ("Contract", "Contractor", "Freelance"). */
export function readEmploymentType(employmentType: string | null): EligibilitySignal[] {
  if (!employmentType) return [];
  const value = employmentType.trim();
  if (/\bfreelanc/i.test(value)) {
    return [engagementSignal(value, "freelance", ["freelance"])];
  }
  if (/\bcontract(?:or)?\b|\bcontract[_ ]?to[_ ]?hire\b|\bCONTRACT/i.test(value)) {
    // "Contract" is also a fixed-term employee contract in the UK and EU: weak.
    return [engagementSignal(value, "contractor", ["b2b-contractor"])];
  }
  return [];
}

function engagementSignal(
  text: string,
  mode: "freelance" | "contractor",
  ways: EligibilitySignal["waysOfWorking"],
): EligibilitySignal {
  return {
    source: "ats-structured",
    kind: "engagement",
    scopes: { countries: [], regions: [] },
    waysOfWorking: ways,
    strength: "weak",
    evidence: { field: "employment-type", text },
    engagement: { mode },
  };
}

// ---- schema.org JobPosting ----------------------------------------------------------------

export interface JsonLdReading {
  signals: EligibilitySignal[];
  /** Free text from `eligibilityToWorkRequirement`, for the text rules. */
  eligibilityText: string | null;
  notes: string[];
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findJobPostings(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 6) return [];
  const out: Record<string, unknown>[] = [];
  for (const node of asArray(value)) {
    if (!isRecord(node)) continue;
    const types = asArray(node["@type"]).map(String);
    if (types.includes("JobPosting")) out.push(node);
    if (node["@graph"]) out.push(...findJobPostings(node["@graph"], depth + 1));
  }
  return out;
}

function placeNames(value: unknown): string[] {
  const names: string[] = [];
  for (const item of asArray(value)) {
    if (typeof item === "string") names.push(item);
    else if (isRecord(item)) {
      if (typeof item.name === "string") names.push(item.name);
      else if (isRecord(item.address)) names.push(...placeNames(item.address));
      if (typeof item.addressCountry === "string") names.push(item.addressCountry);
      else if (isRecord(item.addressCountry) && typeof item.addressCountry.name === "string") {
        names.push(item.addressCountry.name);
      }
    }
  }
  return names;
}

function guessedOf(scopes: MutableScopes): { guessedCountries?: CountryCode[] } {
  const guessed = scopes.countries.filter((c) => !scopes.named?.has(c));
  return guessed.length > 0 ? { guessedCountries: guessed } : {};
}

function resolveName(name: string): PlaceRef | null {
  const trimmed = name.trim();
  const alpha3 = ALPHA3_TO_ALPHA2.get(trimmed.toUpperCase());
  if (alpha3) {
    return { type: "country", country: alpha3, via: "country", guessed: GUESSED_CODES.has(alpha3) };
  }
  if (/^[A-Za-z]{2}$/.test(trimmed) && COUNTRIES.has(trimmed.toUpperCase())) {
    const code = trimmed.toUpperCase();
    return { type: "country", country: code, via: "country", guessed: GUESSED_CODES.has(code) };
  }
  return lookupPlace(trimmed);
}

/**
 * schema.org signals. `applicantLocationRequirements` on a TELECOMMUTE posting becomes an
 * allow-list: `implied` when it differs from the job location countries, `weak` when it equals
 * them (Google falls back to the job location, research 02 §4.2).
 */
export function readJsonLd(jsonLd: unknown): JsonLdReading {
  const reading: JsonLdReading = { signals: [], eligibilityText: null, notes: [] };
  for (const posting of findJobPostings(jsonLd)) {
    const telecommute = asArray(posting.jobLocationType).some(
      (v) => typeof v === "string" && v.toUpperCase() === "TELECOMMUTE",
    );
    const jobScopes: MutableScopes = { countries: [], regions: [], named: new Set() };
    const jobNames: string[] = [];
    for (const loc of asArray(posting.jobLocation)) {
      if (!isRecord(loc)) continue;
      const address = isRecord(loc.address) ? loc.address : null;
      const country = address?.addressCountry;
      const names = placeNames(
        isRecord(country) ? [country] : typeof country === "string" ? [country] : [],
      );
      for (const name of names) {
        const ref = resolveName(name);
        if (ref) {
          pushRef(jobScopes, ref);
          jobNames.push(name);
        }
      }
    }
    if (jobScopes.countries.length > 0) {
      reading.signals.push({
        // B4: on a TELECOMMUTE posting the address is usually the employer's seat (Google requires
        // one), not where the job is: a weak anchor at structured-field rank.
        source: telecommute ? "ats-structured" : "schema-org",
        kind: "anchor",
        scopes: { countries: jobScopes.countries, regions: jobScopes.regions },
        ...guessedOf(jobScopes),
        waysOfWorking: [],
        strength: telecommute ? "weak" : "implied",
        evidence: { field: "json-ld", text: `jobLocation: ${jobNames.join(", ")}` },
        anchor: { workplace: telecommute ? "remote" : "unspecified" },
      });
    }
    const requirementNames = placeNames(posting.applicantLocationRequirements);
    if (requirementNames.length > 0) {
      const scopes: MutableScopes = { countries: [], regions: [], named: new Set() };
      const unresolved: string[] = [];
      for (const name of requirementNames) {
        const ref = resolveName(name);
        if (ref && ref.type !== "ambiguous") pushRef(scopes, ref);
        else unresolved.push(name);
      }
      if (unresolved.length > 0)
        reading.notes.push(`json-ld-unknown-place:${unresolved.join("|")}`);
      const sameAsJob =
        scopes.regions.length === 0 &&
        scopes.countries.length === jobScopes.countries.length &&
        scopes.countries.every((c) => jobScopes.countries.includes(c));
      if (scopes.countries.length > 0 || scopes.regions.length > 0) {
        reading.signals.push({
          source: "schema-org",
          kind: "allow-list",
          scopes: { countries: scopes.countries, regions: scopes.regions },
          ...guessedOf(scopes),
          waysOfWorking: [],
          strength: sameAsJob ? "weak" : "implied",
          evidence: {
            field: "json-ld",
            text: `applicantLocationRequirements: ${requirementNames.join(", ")}`,
          },
        });
      }
    } else if (telecommute) {
      reading.notes.push("json-ld-telecommute-without-requirements");
    }
    if (typeof posting.eligibilityToWorkRequirement === "string") {
      reading.eligibilityText = posting.eligibilityToWorkRequirement;
    }
  }
  return reading;
}
