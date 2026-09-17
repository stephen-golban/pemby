// The eligibility engine: combines rule signals, verified LLM signals and company evidence into one
// tier per (country, way of working) (PLAN D2, D3; research 02 §6). Precision over recall: a
// false green costs more than a missed one. Isomorphic.
//
// Decision table, per (country C, way W). Signals apply to W when their `waysOfWorking` is empty or
// names W. Source rank: rules and schema.org text 3, LLM 2, ATS structured fields 1 (schema.org
// `jobLocation` anchors count as ATS fields). "Non-weak" means strength explicit or implied. A
// region "contains" C at any membership confidence (certain, likely, ambiguous); dated memberships
// (Moldova leaves the CIS on 2027-04-08) use `now`. A country is "guessed" when it is only in a
// signal's `guessedCountries` (resolved from an ambiguous name or context), "named" when a signal
// lists it without guessing. Time-zone fit uses UTC offsets, never place names: a band named after
// places ("European time zones") counts offsets within 2 hours of it as the edge.
//
// Before anything else, allow-lists one source split out of a single-line field (the title, or the
// Locations line) merge into one allow-list over the union of their places, at the weakest strength
// of the parts; exclusions never merge.
//
// Order: steps 1 to 4 (rules first, step 6 for the LLM), then step 7 (green gates), step 5
// (company evidence), step 8 (relocation).
//
// 1. Hard negatives (non-weak signals):
//    - allow-list or work-authorization whose places all leave C out (empty work-authorization
//      scope = the job's anchor places)
//    - exclude naming C (not guessed) or a region containing C (certain or likely), or, when the
//      exclusion is explicit, a region whose colloquial reading covers C (`regionMembershipDetail`:
//      member or ambiguous; "CIS" for Moldova after 2027-04-08). Colloquial membership never adds
//      positives.
//    - citizenship, US person, export control or clearance, explicit, not scoped to C
//    - required time-zone band (explicit or implied) with C outside
//    - B2B: employee-only, explicit. EOR: contractor-only ("B2B contract only"), explicit
//    Take the strongest negative n (explicit before implied, then rank). No non-weak positive
//    (step 3), or n explicit with rank >= every positive's rank: RED. Otherwise WHITE (conflict).
// 2. Soft negative: every location anchor with places (ATS location, "Location:" label) leaves C
//    out. With no non-weak positive: RED, except WHITE when a weak positive (title "(EMEA)", "work
//    from anywhere") meets anchors that are not all remote. With non-weak positives, they decide.
// 3. Positives (non-weak):
//    - allow-list / work-authorization naming C, or an anchor naming C with a known workplace
//      (remote, hybrid, on-site): GREEN candidate; YELLOW when C is only guessed there or the
//      anchor is a schema.org `jobLocation` (an address, often the company's)
//    - anchor naming C with unknown workplace: YELLOW
//    - a region containing C (allow-list or anchor): YELLOW, never green
//    - worldwide wording, explicit, plus an explicit rules-text engagement fitting W (B2B: b2b or
//      contractor; EOR: eor; implied engagements and LLM engagements do not count): GREEN
//      candidate, limited by every place-scoped statement of any strength or source that does not
//      certainly contain C: allow-lists and work authorizations (C only guessed or a region:
//      YELLOW; C left out: RED if explicit, else WHITE), required bands (edge or unknown: YELLOW;
//      outside: RED if explicit, else WHITE), the location anchors as a set (none names C firmly:
//      YELLOW, whether a region contains C or every anchor leaves it out), and any `conflict:*`
//      note from the rules (YELLOW)
//    - other worldwide wording, or the ATS location "Worldwide": YELLOW, with the same limits
//    Post group (rank 3 and 1) takes its best candidate, the LLM group likewise. Both present
//    (only when step 6 lets the LLM decide): an explicit rank-3 green stands, otherwise the lower
//    tier. An LLM green is always YELLOW. With the soft negative of step 2, a green from an
//    allow-list or work authorization that is not explicit is WHITE (only an explicit statement
//    about the role overrides the anchors); any other green not from rank-3 text is YELLOW.
//    No positive: WHITE; YELLOW if a time-zone band the post names contains C and nothing caps.
// 4. Caps. WHITE: an allow-list region that may or may not contain C; an exclude whose region
//    contains C ambiguously or leaves it out only likely or ambiguously (colloquial usage), or
//    that names C only as a guess; a weak exclude that may cover C; an exclude that is not explicit
//    whose region covers C colloquially; a `non-english-restriction-possible` note (every tier
//    above WHITE; lifted only as step 6 says). A `past-tense-place-rule` note is no signal. An
//    ambiguous place name that may be C ("Georgia") turns a place-list RED into WHITE. YELLOW at
//    most, unless C is named: an ambiguous place name that may be C, or a flagged place name no
//    dictionary resolves ("Crimea"). YELLOW at most: C appears only as a guess (no signal names
//    it); a preferred band leaves C out, or C is at the edge of a band; citizenship or clearance
//    wording that is not an explicit requirement; a weak place list (title segment) leaving C
//    out; a `conflict:*` note.
// 5. Company evidence (never raises over a post negative or cap, never above
//    COMPANY_EVIDENCE_MAX_TIER, which is YELLOW for now):
//    - careers page naming C for W (or all ways), verdict green, fetched within 365 days: raises
//      WHITE to YELLOW
//    - other positive careers-page evidence, or positive user reports with weight >= 2: raises
//      WHITE to YELLOW
//    - careers page naming C with verdict red: RED unless the post itself names C (post wins)
//    - EOR provider evidence red for C: EOR capped at WHITE
//    - flags and user reports, verdict red, weight >= 2 (PLAN section 6): one step down
// 6. LLM precedence. Steps 1 to 4 run first on rule signals alone (text, schema.org, ATS fields):
//    - rules tier WHITE: the LLM decides; steps 1 to 4 rerun on rule and LLM signals together.
//      The `non-english-restriction-possible` cap stays unless a non-weak LLM place signal's quote
//      overlaps every such sentence (the unaccounted sentences with the `non-english` cue, or all of them
//      when none is tagged); other LLM signals never lift it.
//    - rules tier GREEN or YELLOW: LLM signals cannot raise it. An LLM hard negative from step 1
//      (explicit or implied; weak never counts, and unverified quotes are weak) that leaves C out
//      turns it into WHITE (conflict), never RED.
//    - rules tier RED: LLM signals cannot move it.
// 7. Green gates. A GREEN from steps 1 to 6 stays GREEN only if all of these hold, else it drops:
//    - Nothing unexplained: every `rules.unaccounted` sentence (a place, demonym, state or
//      restriction cue that produced no place or timezone signal) is covered by a non-weak LLM
//      place or timezone signal whose quote overlaps it (offsets in the same field, else normalized
//      text). Otherwise YELLOW (`unexplained-location-text`).
//    - Two keys, when `input.llm` is given: no LLM signal of any strength, weak included, leaves C
//      out for W (allow-list or work authorization outside C, exclude that may cover C, band
//      outside, citizenship not scoped to C, employee-only for B2B); otherwise WHITE. And a
//      non-weak LLM positive agrees: it names C for W, or says worldwide with an engagement
//      fitting W (LLM non-weak, or explicit rules text); otherwise YELLOW
//      (`second-reading-missing`).
//    The two keys are not independent when both rest only on the Locations line (rules read it as
//    anchors, the LLM quotes the same line): then the second key only confirms the reading of one
//    field and adds no evidence. The rule stays, but read such greens as one source.
//    Production always gives both keys (rules and LLM). Without `input.llm` (the rules-only eval)
//    only the first gate applies.
// 8. Relocation. When any rules or LLM signal has engagement `relocation-required`, B2B and EOR are
//    at most WHITE, and RED when a non-weak relocation target leaves C out. Relocation with visa is
//    decided by steps 1 to 7 as usual.
// Evidence: up to 3 items, the deciding ones first.

import type { WayOfWorking } from "../../ways-of-working";
import type { EligibilityTier } from "../index";
import { countryName, type CountryCode } from "../regions/countries";
import { lookupPlace } from "../regions/match";
import type { RuleExtraction } from "../rules/extract";
import type { UnaccountedSentence } from "../rules/unaccounted";
import type { EligibilitySignal, SignalScopes, SignalStrength } from "../signals";
import {
  ambiguousNameMayBe,
  exclusionMatch,
  matchScopes,
  placeNames,
  regionName,
  timezoneFit,
  type ScopeMatch,
} from "./places";
import { renderReason, type EngineReasonKey } from "./reasons";

export { ENGINE_REASONS, ENGINE_REASON_KEYS, type EngineReasonKey } from "./reasons";
export { DATED_MEMBERSHIPS } from "./places";

/** Bump on any rule change, so stored verdicts can be recomputed. */
export const ENGINE_VERSION = "engine-2026-09-17.7";

/**
 * The highest tier company evidence (careers pages, EOR providers, user reports, flags) can raise a
 * job to. Held at yellow because the company-evidence extractor's dry run produced wrong country
 * rows (one role's "US only" line became a company-wide US green). Raise it only after an eval of
 * the extractor. Negative company evidence is not limited by this.
 */
export const COMPANY_EVIDENCE_MAX_TIER: EligibilityTier = "yellow";

export interface CompanyEvidenceInput {
  country: CountryCode | "*";
  wayOfWorking: WayOfWorking | null;
  verdict: EligibilityTier;
  excerpt: string | null;
  sourceUrl: string | null;
  fetchedAt: Date | null;
  source: "careers_page" | "eor" | "user_report" | "flag";
  weight: number;
}

export interface EngineInput {
  rules: RuleExtraction;
  /** Source "llm"; evidence already verified verbatim against the post. */
  llm?: { signals: EligibilitySignal[]; model: string } | null;
  company?: readonly CompanyEvidenceInput[];
  countries: readonly CountryCode[];
  ways: readonly WayOfWorking[];
  now?: Date;
  /** Public post URL, attached to post evidence. */
  postUrl?: string | null;
}

export interface EngineEvidence {
  source: "post" | "careers_page" | "eor" | "user_report" | "flag";
  excerpt: string | null;
  url: string | null;
}

export interface EngineVerdict {
  country: CountryCode;
  wayOfWorking: WayOfWorking;
  tier: EligibilityTier;
  reasonKey: EngineReasonKey;
  reasonParams: Record<string, string>;
  /** English, at most 120 characters. */
  reason: string;
  evidence: EngineEvidence[];
  /** "low" when the tier rests only on implied wording or location fields (rubric rule 5). */
  confidence?: "high" | "low";
}

// ---- Internals -----------------------------------------------------------------------------

type Rank = 1 | 2 | 3;

interface Finding {
  tier: "green" | "yellow" | "white" | "red";
  key: EngineReasonKey;
  params: Record<string, string>;
  rank: Rank;
  strength: SignalStrength;
  evidence: EngineEvidence;
  /** A place-list negative (allow-list, exclude, anchor), for the ambiguous-name cap. */
  placeList?: boolean;
  /** A positive from an allow-list or work-authorization statement (not an anchor). */
  fromStatement?: boolean;
}

interface Cap {
  tier: "yellow" | "white";
  key: EngineReasonKey;
  params: Record<string, string>;
  evidence: EngineEvidence | null;
  placeList?: boolean;
}

const STRENGTH_POWER: Record<SignalStrength, number> = { explicit: 3, implied: 2, weak: 1 };
const TIER_ORDER: Record<EligibilityTier, number> = { red: 0, white: 1, yellow: 2, green: 3 };
const COMPANY_FRESH_MS = 365 * 24 * 60 * 60 * 1000;

const CONTRACTOR_ONLY_RE =
  /\b(?:B2B|contractor|freelance)(?:\s+(?:contract|basis|agreement))?\s+only\b|\bonly\s+(?:on\s+an?\s+)?(?:B2B|contractor|freelance)\s+(?:basis|contracts?|agreements?|engagements?)\b/i;

/** Countries the rules resolved from ambiguous names or context guesses (`guessedCountries`). */
function isGuessed(signal: EligibilitySignal, country: CountryCode): boolean {
  return signal.guessedCountries?.includes(country) ?? false;
}

function rankOf(signal: EligibilitySignal, fromLlm: boolean): Rank {
  if (fromLlm) return 2;
  // schema.org jobLocation on a telecommute posting is an address field, not a statement.
  if (signal.kind === "anchor" && isJsonLdAnchor(signal)) return 1;
  return signal.source === "rules" || signal.source === "schema-org" ? 3 : 1;
}

function isJsonLdAnchor(signal: EligibilitySignal): boolean {
  return (
    signal.kind === "anchor" &&
    (signal.source === "schema-org" || signal.evidence.field === "json-ld")
  );
}

const RELOCATION_REQUIRED = "relocation-required";

/** Fields that are one line of text: the title and the Locations line (items joined with "; "). */
const SINGLE_LINE_FIELDS: ReadonlySet<string> = new Set(["title", "locations"]);

/**
 * Allow-lists one source split out of a single line ("Remote - US; Remote - Moldova" as two items)
 * are one statement: merge them into one allow-list over the union of places, at the weakest
 * strength of the parts. Exclusions and other kinds never merge.
 */
export function mergeLineAllowLists(signals: readonly EligibilitySignal[]): EligibilitySignal[] {
  const groups = new Map<string, EligibilitySignal[]>();
  const out: EligibilitySignal[] = [];
  for (const signal of signals) {
    if (signal.kind !== "allow-list" || !SINGLE_LINE_FIELDS.has(signal.evidence.field)) {
      out.push(signal);
      continue;
    }
    const key = JSON.stringify([
      signal.source,
      signal.evidence.field,
      [...signal.waysOfWorking].sort(),
    ]);
    const group = groups.get(key);
    if (group) group.push(signal);
    else {
      groups.set(key, [signal]);
      out.push(signal);
    }
  }
  return out.map((signal) => {
    if (signal.kind !== "allow-list" || !SINGLE_LINE_FIELDS.has(signal.evidence.field))
      return signal;
    const key = JSON.stringify([
      signal.source,
      signal.evidence.field,
      [...signal.waysOfWorking].sort(),
    ]);
    const parts = groups.get(key) ?? [signal];
    if (parts.length === 1) return signal;
    const union = <T>(pick: (s: EligibilitySignal) => readonly T[] | undefined) => [
      ...new Set(parts.flatMap((p) => pick(p) ?? [])),
    ];
    const guessed = union((p) => p.guessedCountries);
    const starts = parts.map((p) => p.evidence.start).filter((n): n is number => n !== undefined);
    const ends = parts.map((p) => p.evidence.end).filter((n): n is number => n !== undefined);
    return {
      ...signal,
      scopes: {
        countries: union((p) => p.scopes.countries),
        regions: union((p) => p.scopes.regions),
      },
      strength: parts.reduce<SignalStrength>(
        (low, p) => (STRENGTH_POWER[p.strength] < STRENGTH_POWER[low] ? p.strength : low),
        "explicit",
      ),
      evidence: {
        field: signal.evidence.field,
        text: [...new Set(parts.map((p) => p.evidence.text))].join("; "),
        ...(starts.length === parts.length ? { start: Math.min(...starts) } : {}),
        ...(ends.length === parts.length ? { end: Math.max(...ends) } : {}),
      },
      ...(guessed.length > 0 ? { guessedCountries: guessed } : {}),
    };
  });
}

function engagementMode(signal: EligibilitySignal): string | undefined {
  return signal.engagement?.mode;
}

function postEvidence(signal: EligibilitySignal, url: string | null): EngineEvidence {
  return { source: "post", excerpt: signal.evidence.text || null, url };
}

function appliesTo(signal: EligibilitySignal, way: WayOfWorking): boolean {
  return signal.waysOfWorking.length === 0 || signal.waysOfWorking.includes(way);
}

interface Tagged {
  signal: EligibilitySignal;
  rank: Rank;
}

interface PairInput {
  signals: readonly Tagged[];
  ambiguousNames: readonly string[];
  /** The rules reported a `conflict:*` note. */
  rulesConflict: boolean;
  /** Restriction wording in a language the rules do not read (`non-english-restriction-possible`). */
  unreadableRestriction: boolean;
  company: readonly CompanyEvidenceInput[];
  country: CountryCode;
  way: WayOfWorking;
  now: Date;
  postUrl: string | null;
}

interface PostAssessment {
  tier: EligibilityTier;
  key: EngineReasonKey;
  params: Record<string, string>;
  evidence: EngineEvidence[];
  confidence: "high" | "low";
  /** A post-level negative or cap applied (company evidence cannot raise to green). */
  postNegative: boolean;
  /** The post named C itself as a green place. */
  namesCountry: boolean;
  /** The first non-weak hard negative with an evidence quote, whatever tier won. */
  hardNegative: EngineEvidence | null;
}

function requirementText(requirement: string | undefined, scopes: SignalScopes): string {
  const where = scopes.countries.length > 0 || scopes.regions.length > 0 ? placeNames(scopes) : "";
  switch (requirement) {
    case "us-person":
      return "US person status";
    case "export-control":
      return "export-control eligibility";
    case "clearance":
      return where ? `a ${where} security clearance` : "a security clearance";
    default:
      return where ? `${where} citizenship` : "a specific citizenship";
  }
}

function assessPost(input: PairInput): PostAssessment {
  const { country: c, way, now, postUrl } = input;
  const countryLabel = { country: countryDisplay(c) };
  const hard: Finding[] = [];
  const positives: Finding[] = [];
  const weakPositives: Finding[] = [];
  const caps: Cap[] = [];
  const worldwide: Tagged[] = [];
  /** A band the post names that contains C: a yellow fallback when nothing else is said. */
  let zoneIncludes: EngineEvidence | null = null;
  const anchors: Array<{ tagged: Tagged; match: ScopeMatch }> = [];
  let engagementFits: Tagged | null = null;

  const anchorScopes: SignalScopes = {
    countries: [
      ...new Set(
        input.signals
          .filter((t) => t.signal.kind === "anchor")
          .flatMap((t) => t.signal.scopes.countries),
      ),
    ],
    regions: [
      ...new Set(
        input.signals
          .filter((t) => t.signal.kind === "anchor")
          .flatMap((t) => t.signal.scopes.regions),
      ),
    ],
  };

  for (const tagged of input.signals) {
    const { signal: s, rank } = tagged;
    const ev = postEvidence(s, postUrl);

    // Contractor-only is read from engagement signals of any way (a B2B pattern names only B2B).
    if (
      s.kind === "engagement" &&
      way === "eor-employee" &&
      s.strength === "explicit" &&
      (s.engagement?.mode === "b2b" ||
        s.engagement?.mode === "contractor" ||
        s.engagement?.mode === "freelance") &&
      CONTRACTOR_ONLY_RE.test(s.evidence.text)
    ) {
      hard.push({
        tier: "red",
        key: "contractor-only",
        params: {},
        rank,
        strength: s.strength,
        evidence: ev,
      });
      continue;
    }
    if (!appliesTo(s, way)) continue;

    switch (s.kind) {
      case "allow-list":
      case "work-authorization": {
        const scopes =
          s.kind === "work-authorization" &&
          s.scopes.countries.length === 0 &&
          s.scopes.regions.length === 0
            ? anchorScopes
            : s.scopes;
        const m = matchScopes(scopes, c, now);
        if (m.match === "empty") break;
        if (s.strength === "weak") {
          if (m.match === "country" || m.match === "region") {
            weakPositives.push({
              tier: "yellow",
              key: "no-signal",
              params: {},
              rank,
              strength: s.strength,
              evidence: ev,
              placeList: true,
            });
          } else if (m.match === "outside") {
            caps.push({
              tier: "yellow",
              key: "locations-leave-out",
              params: countryLabel,
              evidence: ev,
            });
          }
          break;
        }
        if (m.match === "country") {
          positives.push({
            tier: isGuessed(s, c) ? "yellow" : "green",
            key: isGuessed(s, c) ? "place-guessed" : "country-named",
            params: countryLabel,
            rank,
            strength: s.strength,
            evidence: ev,
            fromStatement: true,
          });
        } else if (m.match === "region") {
          positives.push({
            tier: "yellow",
            key: "region-includes",
            params: { ...countryLabel, region: regionName(m.region) },
            rank,
            strength: s.strength,
            evidence: ev,
          });
        } else if (m.match === "unclear") {
          caps.push({
            tier: "white",
            key: "region-unclear",
            params: { ...countryLabel, region: regionName(m.region) },
            evidence: ev,
            placeList: true,
          });
        } else {
          hard.push({
            tier: "red",
            key: s.kind === "allow-list" ? "places-only" : "work-authorization",
            params: { places: placeNames(scopes) },
            rank,
            strength: s.strength,
            evidence: ev,
            placeList: true,
          });
        }
        break;
      }
      case "exclude": {
        const m = exclusionMatch(s.scopes, c, now, isGuessed(s, c));
        if (s.strength === "weak") {
          if (m.match !== "outside") {
            caps.push({
              tier: "white",
              key: "exclusion-hedged",
              params: countryLabel,
              evidence: ev,
              placeList: true,
            });
          }
          break;
        }
        if (m.match === "excluded" || (m.match === "colloquial" && s.strength === "explicit")) {
          hard.push({
            tier: "red",
            key: "excluded",
            params: countryLabel,
            rank,
            strength: s.strength,
            evidence: ev,
            placeList: true,
          });
        } else if (m.match === "unclear" || m.match === "colloquial") {
          caps.push({
            tier: "white",
            key: "exclusion-unclear",
            params: { ...countryLabel, region: m.label },
            evidence: ev,
            placeList: true,
          });
        }
        break;
      }
      case "worldwide": {
        if (s.source === "ats-structured" && rank === 1) {
          positives.push({
            tier: "yellow",
            key: "worldwide-location",
            params: {},
            rank,
            strength: "implied",
            evidence: ev,
          });
        } else if (s.strength === "weak") {
          weakPositives.push({
            tier: "yellow",
            key: "worldwide",
            params: {},
            rank,
            strength: s.strength,
            evidence: ev,
          });
        } else {
          worldwide.push(tagged);
        }
        break;
      }
      case "citizenship-or-clearance": {
        const m = matchScopes(s.scopes, c, now);
        const scopedToC =
          m.match === "country" || (m.match === "region" && m.confidence === "certain");
        if (s.strength === "explicit" && !scopedToC) {
          hard.push({
            tier: "red",
            key: "citizenship",
            params: { requirement: requirementText(s.requirement, s.scopes) },
            rank,
            strength: s.strength,
            evidence: ev,
          });
        } else {
          caps.push({ tier: "yellow", key: "citizenship-mentioned", params: {}, evidence: ev });
        }
        break;
      }
      case "timezone": {
        if (!s.timezone) break;
        const fit = timezoneFit(s.timezone, c, now);
        if (fit === "inside" && s.timezone.mode === "within" && !zoneIncludes) zoneIncludes = ev;
        if (fit === "inside" || fit === "unknown") break;
        if (s.strength === "weak") {
          caps.push({
            tier: "yellow",
            key: fit === "edge" ? "timezone-edge" : "timezone-preferred",
            params: countryLabel,
            evidence: ev,
          });
        } else if (fit === "outside") {
          hard.push({
            tier: "red",
            key: "timezone-required",
            params: countryLabel,
            rank,
            strength: s.strength,
            evidence: ev,
          });
        } else {
          caps.push({ tier: "yellow", key: "timezone-edge", params: countryLabel, evidence: ev });
        }
        break;
      }
      case "engagement": {
        const mode = s.engagement?.mode;
        if (mode === "employee-only" && way === "b2b-contractor" && s.strength === "explicit") {
          hard.push({
            tier: "red",
            key: "employee-only",
            params: {},
            rank,
            strength: s.strength,
            evidence: ev,
          });
        }
        // Green from worldwide wording needs a rules-text engagement (LLM engagements do not count).
        // Worldwide green needs an explicit, role-scoped engagement from rules text.
        if (s.strength !== "explicit" || rank !== 3) break;
        const fits =
          (way === "b2b-contractor" && (mode === "b2b" || mode === "contractor")) ||
          (way === "eor-employee" && mode === "eor");
        if (fits && !engagementFits) engagementFits = tagged;
        break;
      }
      case "anchor": {
        anchors.push({ tagged, match: matchScopes(s.scopes, c, now) });
        break;
      }
    }
  }

  // Anchors.
  let softNegative: Finding | null = null;
  const placed = anchors.filter((a) => a.match.match !== "empty");
  for (const { tagged, match } of placed) {
    const s = tagged.signal;
    const ev = postEvidence(s, postUrl);
    const workplace = s.anchor?.workplace ?? "unspecified";
    if (match.match === "country") {
      positives.push(
        workplace === "unspecified" || isGuessed(s, c) || isJsonLdAnchor(s)
          ? {
              tier: "yellow",
              key: isGuessed(s, c) ? "place-guessed" : "location-in-country",
              params: countryLabel,
              rank: tagged.rank,
              strength: "implied",
              evidence: ev,
            }
          : {
              tier: "green",
              key: "country-named",
              params: countryLabel,
              rank: tagged.rank,
              strength: "implied",
              evidence: ev,
            },
      );
    } else if (match.match === "region") {
      positives.push({
        tier: "yellow",
        key: "region-includes",
        params: { ...countryLabel, region: regionName(match.region) },
        rank: tagged.rank,
        strength: "implied",
        evidence: ev,
      });
    }
  }
  if (placed.length > 0 && placed.every((a) => a.match.match === "outside")) {
    const first = placed[0]!.tagged;
    const onsite = placed.every(
      (a) =>
        a.tagged.signal.anchor?.workplace === "onsite" ||
        a.tagged.signal.anchor?.workplace === "hybrid",
    );
    const scopes: SignalScopes = {
      countries: [...new Set(placed.flatMap((a) => a.tagged.signal.scopes.countries))],
      regions: [...new Set(placed.flatMap((a) => a.tagged.signal.scopes.regions))],
    };
    softNegative = {
      tier: "red",
      key: onsite ? "onsite-elsewhere" : "posted-elsewhere",
      params: { places: placeNames(scopes) },
      rank: first.rank,
      strength: "implied",
      evidence: postEvidence(first.signal, postUrl),
      placeList: true,
    };
  }

  // Worldwide wording is limited by every place-scoped statement that does not certainly contain C:
  // allow-lists and work authorizations and required bands of any strength or source, and the
  // location anchors as a set. Region, edge or anchors only: yellow. A statement or band leaving C
  // out: red if explicit, else white.
  const limits: Array<{
    tier: EligibilityTier;
    evidence: EngineEvidence | null;
    anchor?: boolean;
  }> = [];
  let anchorsLeaveOut = false;
  if (worldwide.length > 0) {
    for (const { signal: s } of input.signals) {
      if (!appliesTo(s, way)) continue;
      const ev = postEvidence(s, postUrl);
      if (s.kind === "allow-list" || s.kind === "work-authorization") {
        if (s.scopes.countries.length === 0 && s.scopes.regions.length === 0) continue;
        const m = matchScopes(s.scopes, c, now);
        if (m.match === "country" && !isGuessed(s, c)) continue;
        const tier: EligibilityTier =
          m.match === "country" || m.match === "region"
            ? "yellow"
            : m.match === "outside" && s.strength === "explicit"
              ? "red"
              : "white";
        limits.push({ tier, evidence: ev });
      } else if (s.kind === "timezone" && s.timezone && s.strength !== "weak") {
        const fit = timezoneFit(s.timezone, c, now);
        if (fit === "inside") continue;
        const tier: EligibilityTier =
          fit === "outside" ? (s.strength === "explicit" ? "red" : "white") : "yellow";
        limits.push({ tier, evidence: ev });
      }
    }
    const firmAnchor = placed.some(
      (a) => a.match.match === "country" && !isGuessed(a.tagged.signal, c),
    );
    if (placed.length > 0 && !firmAnchor) {
      const partly = placed.some((a) => a.match.match === "country" || a.match.match === "region");
      anchorsLeaveOut = !partly;
      limits.push({
        anchor: true,
        tier: "yellow",
        evidence: postEvidence(placed[0]!.tagged.signal, postUrl),
      });
    }
    if (input.rulesConflict) limits.push({ tier: "yellow", evidence: null });
  }
  type Limit = (typeof limits)[number];
  const lowest = (items: readonly Limit[]) =>
    items.reduce<Limit | null>(
      (low, x) => (!low || TIER_ORDER[x.tier] < TIER_ORDER[low.tier] ? x : low),
      null,
    );
  const limit = lowest(limits);
  /** Worldwide wording a limit turned white or red: not a positive, but it still conflicts. */
  const blockedWorldwide: Finding[] = [];

  for (const { signal: s, rank } of worldwide) {
    const ev = postEvidence(s, postUrl);
    const fit = engagementFits as Tagged | null;
    const wanted: EligibilityTier = s.strength === "explicit" && fit ? "green" : "yellow";
    const bound = limit;
    if (bound && TIER_ORDER[bound.tier] <= TIER_ORDER.white) {
      blockedWorldwide.push({
        tier: "white",
        key: "worldwide-limited",
        params: countryLabel,
        rank,
        strength: s.strength,
        evidence: bound.evidence ?? ev,
      });
    } else if (bound && wanted === "green") {
      positives.push({
        tier: "yellow",
        key: anchorsLeaveOut && bound.anchor ? "worldwide-narrow-location" : "worldwide-limited",
        params: countryLabel,
        rank,
        strength: s.strength,
        evidence: ev,
      });
    } else if (wanted === "green") {
      positives.push({
        tier: "green",
        key: "worldwide-engagement",
        params: {
          engagement:
            way === "eor-employee" ? "employees through an employer of record" : "contractors",
        },
        rank,
        strength: "explicit",
        evidence: ev,
      });
    } else {
      positives.push({
        tier: "yellow",
        key: anchorsLeaveOut ? "worldwide-narrow-location" : "worldwide",
        params: anchorsLeaveOut ? countryLabel : {},
        rank,
        strength: s.strength,
        evidence: ev,
      });
    }
  }
  const fitEvidence = engagementFits
    ? postEvidence((engagementFits as Tagged).signal, postUrl)
    : null;

  const ambiguous = input.ambiguousNames.some((name) => ambiguousNameMayBe(name, c));
  // A place name the rules flagged that no dictionary resolves ("Crimea"): it may be anywhere.
  const unknownPlace = input.ambiguousNames.some((name) => lookupPlace(name) === null);
  // C named by a firm (not guessed) place in any applicable signal.
  const namedFirmly = input.signals.some(
    ({ signal: s }) => appliesTo(s, way) && s.scopes.countries.includes(c) && !isGuessed(s, c),
  );
  const guessedOnly =
    !namedFirmly && input.signals.some(({ signal: s }) => appliesTo(s, way) && isGuessed(s, c));
  const ambiguousCap: Cap | null = ambiguous
    ? { tier: "white", key: "ambiguous-place", params: countryLabel, evidence: null }
    : null;

  const result = (
    tier: EligibilityTier,
    key: EngineReasonKey,
    params: Record<string, string>,
    evidence: Array<EngineEvidence | null | undefined>,
    extra: Partial<PostAssessment> = {},
  ): PostAssessment => ({
    tier,
    key,
    params,
    evidence: dedupe(evidence),
    confidence: "high",
    postNegative: tier === "red" || caps.length > 0 || hard.length > 0 || softNegative !== null,
    namesCountry: false,
    hardNegative: hard.find((h) => h.evidence.excerpt)?.evidence ?? null,
    ...extra,
  });

  // 1. Hard negatives.
  if (hard.length > 0) {
    const n = [...hard].sort(
      (a, b) => STRENGTH_POWER[b.strength] - STRENGTH_POWER[a.strength] || b.rank - a.rank,
    )[0]!;
    const conflicting = [...positives, ...blockedWorldwide];
    const maxPositiveRank = Math.max(0, ...conflicting.map((p) => p.rank));
    if (conflicting.length === 0 || (n.strength === "explicit" && n.rank >= maxPositiveRank)) {
      if (n.placeList && ambiguousCap) {
        return result("white", ambiguousCap.key, ambiguousCap.params, [n.evidence]);
      }
      return result(
        "red",
        n.key,
        n.params,
        [n.evidence, ...hard.filter((h) => h !== n).map((h) => h.evidence)],
        {
          confidence: n.strength === "explicit" ? "high" : "low",
        },
      );
    }
    const top = bestPositive(conflicting)!;
    return result("white", "conflicting-signals", {}, [n.evidence, top.evidence]);
  }

  // 2. Soft negative from location anchors.
  if (softNegative && positives.length === 0) {
    if (blockedWorldwide.length > 0) {
      return result("white", "worldwide-limited", countryLabel, [
        softNegative.evidence,
        blockedWorldwide[0]!.evidence,
      ]);
    }
    // Weak positives (a title region such as "Engineer (EMEA)", often a sales territory, or perk
    // wording such as "work from anywhere") lift the negative to white only when the anchors are
    // not all remote: remote anchors already are the places people work from.
    const anchorsRemote = placed.every((a) => a.tagged.signal.anchor?.workplace === "remote");
    const lifting = anchorsRemote ? [] : weakPositives;
    if (lifting.length > 0) {
      return result("white", "conflicting-signals", {}, [
        softNegative.evidence,
        lifting[0]!.evidence,
      ]);
    }
    if (ambiguousCap)
      return result("white", ambiguousCap.key, ambiguousCap.params, [softNegative.evidence]);
    return result("red", softNegative.key, softNegative.params, [softNegative.evidence], {
      confidence: "low",
    });
  }

  // 3. Positives.
  if (positives.length === 0) {
    const cap = caps.find((x) => x.tier === "white");
    if (cap) return result("white", cap.key, cap.params, [cap.evidence]);
    if (ambiguousCap) return result("white", ambiguousCap.key, ambiguousCap.params, []);
    if (blockedWorldwide.length > 0) {
      return result("white", "worldwide-limited", countryLabel, [blockedWorldwide[0]!.evidence]);
    }
    if (zoneIncludes && caps.length === 0) {
      return result("yellow", "timezone-includes", countryLabel, [zoneIncludes], {
        confidence: "low",
      });
    }
    return result("white", "no-signal", {}, []);
  }
  const post = bestPositive(positives.filter((p) => p.rank !== 2));
  const llm = bestPositive(positives.filter((p) => p.rank === 2));
  let decided: Finding;
  if (post && llm) {
    const postStands = post.tier === "green" && post.rank === 3 && post.strength === "explicit";
    decided = postStands || TIER_ORDER[post.tier] <= TIER_ORDER[llm.tier] ? post : llm;
  } else {
    decided = (post ?? llm)!;
  }
  let tier: EligibilityTier = decided.tier;
  let key = decided.key;
  let params = decided.params;
  if (
    !post &&
    llm &&
    llm.tier === "green" &&
    (llm.strength !== "explicit" || !llm.evidence.excerpt)
  ) {
    tier = "yellow";
    key = "country-mentioned";
    params = countryLabel;
  }
  // An LLM green is never green on its own evidence.
  if (tier === "green" && decided.rank === 2) {
    tier = "yellow";
    key = decided.key === "country-named" ? "country-mentioned" : "worldwide";
    params = decided.key === "country-named" ? countryLabel : {};
  }
  // Every location anchor leaves C out: only an explicit statement about the role overrides them.
  if (softNegative && tier === "green") {
    if (decided.fromStatement && decided.strength !== "explicit") {
      return result("white", "conflicting-signals", {}, [decided.evidence, softNegative.evidence]);
    }
    if (decided.rank !== 3) {
      tier = "yellow";
      key = "locations-leave-out";
      params = countryLabel;
    }
  }
  const evidence: Array<EngineEvidence | null> = [decided.evidence];
  if (decided.key === "worldwide-engagement") evidence.push(fitEvidence);

  // 4. Caps.
  if (input.unreadableRestriction) {
    caps.push({ tier: "white", key: "restriction-unreadable", params: {}, evidence: null });
  }
  const whiteCap = caps.find((x) => x.tier === "white");
  if (whiteCap) {
    return result("white", whiteCap.key, whiteCap.params, [whiteCap.evidence, ...evidence]);
  }
  const yellowCap =
    caps.find((x) => x.tier === "yellow") ??
    (guessedOnly
      ? {
          tier: "yellow" as const,
          key: "place-guessed" as const,
          params: countryLabel,
          evidence: null,
        }
      : undefined) ??
    ((ambiguousCap || unknownPlace) && !namedFirmly
      ? {
          tier: "yellow" as const,
          key: "ambiguous-place" as const,
          params: countryLabel,
          evidence: null,
        }
      : undefined) ??
    (input.rulesConflict
      ? { tier: "yellow" as const, key: "conflicting-signals" as const, params: {}, evidence: null }
      : undefined);
  if (yellowCap && tier === "green") {
    return result("yellow", yellowCap.key, yellowCap.params, [yellowCap.evidence, ...evidence], {
      confidence: "low",
    });
  }
  const namesCountry = tier === "green" && decided.key === "country-named";
  return result(tier, key, params, evidence, {
    confidence: decided.strength === "explicit" && tier !== "yellow" ? "high" : "low",
    namesCountry,
  });
}

function bestPositive(findings: readonly Finding[]): Finding | undefined {
  return [...findings].sort(
    (a, b) =>
      TIER_ORDER[b.tier] - TIER_ORDER[a.tier] ||
      STRENGTH_POWER[b.strength] - STRENGTH_POWER[a.strength] ||
      b.rank - a.rank,
  )[0];
}

function dedupe(items: Array<EngineEvidence | null | undefined>): EngineEvidence[] {
  const out: EngineEvidence[] = [];
  for (const item of items) {
    if (!item) continue;
    if (
      out.some((o) => o.source === item.source && o.excerpt === item.excerpt && o.url === item.url)
    )
      continue;
    out.push(item);
    if (out.length === 3) break;
  }
  return out;
}

function countryDisplay(code: CountryCode): string {
  return countryName(code) ?? code;
}

function companyEvidence(e: CompanyEvidenceInput): EngineEvidence {
  return { source: e.source, excerpt: e.excerpt, url: e.sourceUrl };
}

const STEP_DOWN: Record<EligibilityTier, EligibilityTier> = {
  green: "yellow",
  yellow: "white",
  white: "red",
  red: "red",
};

function lowerTier(a: EligibilityTier, b: EligibilityTier): EligibilityTier {
  return TIER_ORDER[a] <= TIER_ORDER[b] ? a : b;
}

/** Step 6: rules decide first; the LLM decides only where rules left the pair white. */
function assessWithLlm(pair: PairInput, gate: GateContext): PostAssessment {
  const llmSignals = gate.llmSignals;
  const rulesOnly = assessPost({ ...pair, signals: pair.signals.filter((t) => t.rank !== 2) });
  if (llmSignals.length === 0) return rulesOnly;
  // The unreadable-restriction cap lifts only when the LLM placed every such sentence.
  if (rulesOnly.tier === "white") {
    return assessPost({
      ...pair,
      unreadableRestriction: pair.unreadableRestriction && !unreadableCleared(gate),
    });
  }
  if (rulesOnly.tier === "red") return rulesOnly;
  const llmOnly = assessPost({ ...pair, rulesConflict: false, signals: llmSignals });
  if (!llmOnly.hardNegative) return rulesOnly;
  return {
    ...rulesOnly,
    tier: "white",
    key: "conflicting-signals",
    params: {},
    evidence: dedupe([llmOnly.hardNegative, ...rulesOnly.evidence]),
    confidence: "low",
    postNegative: true,
    namesCountry: false,
  };
}

interface GateContext {
  /** `input.llm` was given (production always gives it). */
  llmPresent: boolean;
  llmSignals: readonly Tagged[];
  /** Rule signals, for engagements that fit a worldwide statement. */
  ruleSignals: readonly Tagged[];
  unaccounted: readonly UnaccountedSentence[];
}

const PLACE_KINDS: ReadonlySet<EligibilitySignal["kind"]> = new Set([
  "allow-list",
  "exclude",
  "work-authorization",
  "citizenship-or-clearance",
  "anchor",
]);

function isPlaceSignal(signal: EligibilitySignal): boolean {
  if (!PLACE_KINDS.has(signal.kind)) return false;
  if (signal.kind === "citizenship-or-clearance") return true;
  return signal.scopes.countries.length > 0 || signal.scopes.regions.length > 0;
}

const normalizeText = (text: string) =>
  text
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** The signal's quote overlaps the sentence: by offsets in the same field, or by normalized text. */
function quoteCovers(signal: EligibilitySignal, sentence: UnaccountedSentence): boolean {
  const ev = signal.evidence;
  if (
    ev.field === sentence.field &&
    ev.start !== undefined &&
    ev.end !== undefined &&
    ev.start < sentence.end &&
    ev.end > sentence.start
  ) {
    return true;
  }
  const quote = normalizeText(ev.text);
  const text = normalizeText(sentence.text);
  return quote.length >= 4 && text.length > 0 && (text.includes(quote) || quote.includes(text));
}

/** Unaccounted sentences no non-weak LLM place or timezone signal covers. */
function uncoveredSentences(gate: GateContext): UnaccountedSentence[] {
  return gate.unaccounted.filter(
    (sentence) =>
      !gate.llmSignals.some(
        ({ signal }) =>
          signal.strength !== "weak" &&
          (isPlaceSignal(signal) || signal.kind === "timezone") &&
          quoteCovers(signal, sentence),
      ),
  );
}

/**
 * M1: the non-English restriction note clears only when a non-weak LLM place signal's quote overlaps
 * each unaccounted sentence with the rules' `non-english` cue (every unaccounted sentence when none
 * is tagged). No unaccounted data: never cleared.
 */
function unreadableCleared(gate: GateContext): boolean {
  const tagged = gate.unaccounted.filter((u) => u.cues.includes("non-english"));
  const sentences = tagged.length > 0 ? tagged : gate.unaccounted;
  return (
    sentences.length > 0 &&
    sentences.every((sentence) =>
      gate.llmSignals.some(
        ({ signal }) =>
          signal.strength !== "weak" && isPlaceSignal(signal) && quoteCovers(signal, sentence),
      ),
    )
  );
}

/** An LLM signal of any strength, weak included, that leaves C out for this way. */
function llmRestriction(pair: PairInput, gate: GateContext): EligibilitySignal | null {
  const { country: c, way, now } = pair;
  for (const { signal: s } of gate.llmSignals) {
    if (!appliesTo(s, way)) continue;
    switch (s.kind) {
      case "allow-list":
      case "work-authorization": {
        const m = matchScopes(s.scopes, c, now);
        if (m.match === "outside" || m.match === "unclear") return s;
        break;
      }
      case "exclude":
        if (exclusionMatch(s.scopes, c, now, isGuessed(s, c)).match !== "outside") return s;
        break;
      case "timezone":
        if (s.timezone && timezoneFit(s.timezone, c, now) === "outside") return s;
        break;
      case "citizenship-or-clearance":
        if (matchScopes(s.scopes, c, now).match !== "country") return s;
        break;
      case "engagement":
        if (engagementMode(s) === "employee-only" && way === "b2b-contractor") return s;
        break;
    }
  }
  return null;
}

/** A non-weak LLM positive that agrees: names C for this way, or worldwide plus a fitting engagement. */
function llmAgrees(pair: PairInput, gate: GateContext): boolean {
  const { country: c, way } = pair;
  const fits = (s: EligibilitySignal) =>
    s.kind === "engagement" &&
    appliesTo(s, way) &&
    ((way === "b2b-contractor" &&
      (engagementMode(s) === "b2b" || engagementMode(s) === "contractor")) ||
      (way === "eor-employee" && engagementMode(s) === "eor"));
  const nonWeak = gate.llmSignals.filter(
    (t) => t.signal.strength !== "weak" && appliesTo(t.signal, way),
  );
  const namesC = nonWeak.some(
    ({ signal: s }) =>
      (s.kind === "allow-list" || s.kind === "work-authorization" || s.kind === "anchor") &&
      s.scopes.countries.includes(c) &&
      !isGuessed(s, c),
  );
  if (namesC) return true;
  const worldwide = nonWeak.some(({ signal: s }) => s.kind === "worldwide");
  const engagement =
    nonWeak.some(({ signal: s }) => fits(s)) ||
    gate.ruleSignals.some(({ signal: s }) => s.strength === "explicit" && fits(s));
  return worldwide && engagement;
}

/** Step 7: green needs nothing unexplained and, with the LLM present, both keys. */
function applyGreenGates(post: PostAssessment, pair: PairInput, gate: GateContext): PostAssessment {
  if (post.tier !== "green") return post;
  const countryLabel = { country: countryDisplay(pair.country) };
  const lower = (
    tier: EligibilityTier,
    key: EngineReasonKey,
    params: Record<string, string>,
    evidence: EngineEvidence | null,
  ): PostAssessment => ({
    ...post,
    tier,
    key,
    params,
    evidence: dedupe([evidence, ...post.evidence]),
    confidence: "low",
    namesCountry: false,
  });
  const uncovered = uncoveredSentences(gate);
  const unexplained = uncovered[0]
    ? { source: "post" as const, excerpt: uncovered[0].text, url: pair.postUrl }
    : null;
  if (gate.llmPresent) {
    const restriction = llmRestriction(pair, gate);
    if (restriction) {
      return lower("white", "conflicting-signals", {}, postEvidence(restriction, pair.postUrl));
    }
  }
  if (unexplained) return lower("yellow", "unexplained-location-text", countryLabel, unexplained);
  if (gate.llmPresent && !llmAgrees(pair, gate)) {
    return lower("yellow", "second-reading-missing", countryLabel, null);
  }
  return post;
}

/** M3: a post that requires relocation is not a B2B or EOR role from C. */
function applyRelocation(
  post: PostAssessment,
  pair: PairInput,
  signals: readonly Tagged[],
): PostAssessment {
  if (pair.way !== "b2b-contractor" && pair.way !== "eor-employee") return post;
  const relocation = signals.filter((t) => engagementMode(t.signal) === RELOCATION_REQUIRED);
  if (relocation.length === 0 || post.tier === "red") return post;
  const elsewhere = relocation.find(
    ({ signal: s }) =>
      s.strength !== "weak" &&
      (s.scopes.countries.length > 0 || s.scopes.regions.length > 0) &&
      matchScopes(s.scopes, pair.country, pair.now).match === "outside",
  );
  const first = (elsewhere ?? relocation[0]!).signal;
  const evidence = dedupe([postEvidence(first, pair.postUrl), ...post.evidence]);
  if (elsewhere) {
    return {
      ...post,
      tier: "red",
      key: "relocation-elsewhere",
      params: { places: placeNames(elsewhere.signal.scopes) },
      evidence,
      confidence: "high",
      namesCountry: false,
    };
  }
  if (post.tier === "white") return post;
  return {
    ...post,
    tier: "white",
    key: "relocation-required",
    params: { country: countryDisplay(pair.country) },
    evidence,
    confidence: "low",
    namesCountry: false,
  };
}

function applyCompany(post: PostAssessment, input: PairInput): PostAssessment {
  const { country: c, way, now } = input;
  const countryLabel = { country: countryDisplay(c) };
  const relevant = input.company.filter(
    (e) =>
      e.weight > 0 &&
      (e.country === c || e.country === "*") &&
      (e.wayOfWorking === null || e.wayOfWorking === way),
  );
  if (relevant.length === 0) return post;
  let out = post;
  const withEvidence = (
    next: PostAssessment,
    tier: EligibilityTier,
    key: EngineReasonKey,
    items: readonly CompanyEvidenceInput[],
  ): PostAssessment => ({
    ...next,
    tier,
    key,
    params: countryLabel,
    evidence: dedupe([...items.map(companyEvidence), ...next.evidence]),
    confidence: "low",
  });

  // Raises: never over a post negative, never above the post's own green.
  if (out.tier === "white" || out.tier === "yellow") {
    const naming = relevant.filter(
      (e) =>
        e.source === "careers_page" &&
        e.country === c &&
        e.verdict === "green" &&
        e.fetchedAt !== null &&
        now.getTime() - e.fetchedAt.getTime() <= COMPANY_FRESH_MS,
    );
    const target = lowerTier("green", COMPANY_EVIDENCE_MAX_TIER);
    if (naming.length > 0 && !out.postNegative && TIER_ORDER[target] > TIER_ORDER[out.tier]) {
      out = withEvidence(out, target, "company-names-country", naming);
    } else if (
      out.tier === "white" &&
      !out.postNegative &&
      TIER_ORDER[COMPANY_EVIDENCE_MAX_TIER] >= TIER_ORDER.yellow
    ) {
      const careers = relevant.filter(
        (e) => e.source === "careers_page" && (e.verdict === "green" || e.verdict === "yellow"),
      );
      const reports = relevant.filter(
        (e) => e.source === "user_report" && (e.verdict === "green" || e.verdict === "yellow"),
      );
      const reportWeight = reports.reduce((sum, e) => sum + e.weight, 0);
      if (careers.length > 0 || reportWeight >= 2) {
        out = withEvidence(
          out,
          "yellow",
          "company-evidence",
          careers.length > 0 ? careers : reports,
        );
      }
    }
  }

  // Careers page says the company does not hire in C.
  const excludes = relevant.filter(
    (e) => e.source === "careers_page" && e.country === c && e.verdict === "red",
  );
  if (excludes.length > 0 && out.tier !== "red" && !out.namesCountry) {
    out = withEvidence(out, "red", "company-excludes", excludes);
  }

  // Employer of record provider does not support C.
  const eorRed = relevant.filter(
    (e) => e.source === "eor" && e.country === c && e.verdict === "red",
  );
  if (way === "eor-employee" && eorRed.length > 0 && TIER_ORDER[out.tier] > TIER_ORDER.white) {
    out = withEvidence(out, "white", "eor-unsupported", eorRed);
  }

  // User reports and flags (PLAN section 6: 2+ independent flags downgrade the tier).
  const reported = relevant.filter(
    (e) => (e.source === "flag" || e.source === "user_report") && e.verdict === "red",
  );
  if (reported.reduce((sum, e) => sum + e.weight, 0) >= 2 && out.tier !== "red") {
    const tier = STEP_DOWN[out.tier];
    out = withEvidence(out, tier, "user-reports", reported);
  }
  return out;
}

// ---- Entry point ---------------------------------------------------------------------------

/**
 * One verdict per (country, way of working). Pure: the same input always gives the same output,
 * with `now` defaulting to the current time (it only matters for dated region memberships and
 * company evidence freshness).
 */
export function decideEligibility(input: EngineInput): EngineVerdict[] {
  const now = input.now ?? new Date();
  const llmSignals: Tagged[] = mergeLineAllowLists(input.llm?.signals ?? []).map((signal) => ({
    signal,
    rank: rankOf(signal, true),
  }));
  const signals: Tagged[] = [
    ...mergeLineAllowLists(input.rules.signals).map((signal) => ({
      signal,
      rank: rankOf(signal, false),
    })),
    ...llmSignals,
  ];
  const ambiguousNames = [...input.rules.unresolvedReasons, ...input.rules.notes]
    .map((note) => /^ambiguous-(?:place|location):(.+)$/.exec(note)?.[1])
    .filter((name): name is string => Boolean(name));
  const rulesConflict = [...input.rules.unresolvedReasons, ...input.rules.notes].some((note) =>
    note.startsWith("conflict:"),
  );
  const unreadableRestriction = [...input.rules.unresolvedReasons, ...input.rules.notes].includes(
    "non-english-restriction-possible",
  );
  const gate: GateContext = {
    llmPresent: input.llm !== undefined && input.llm !== null,
    llmSignals,
    ruleSignals: signals.filter((t) => t.rank !== 2),
    unaccounted: input.rules.unaccounted,
  };
  const verdicts: EngineVerdict[] = [];
  for (const country of input.countries) {
    for (const way of input.ways) {
      const pair: PairInput = {
        signals,
        ambiguousNames,
        rulesConflict,
        unreadableRestriction,
        company: input.company ?? [],
        country,
        way,
        now,
        postUrl: input.postUrl ?? null,
      };
      const assessed = applyGreenGates(assessWithLlm(pair, gate), pair, gate);
      const decided = applyRelocation(applyCompany(assessed, pair), pair, signals);
      verdicts.push({
        country,
        wayOfWorking: way,
        tier: decided.tier,
        reasonKey: decided.key,
        reasonParams: decided.params,
        reason: renderReason(decided.key, decided.params),
        evidence: decided.evidence,
        confidence: decided.confidence,
      });
    }
  }
  return verdicts;
}
