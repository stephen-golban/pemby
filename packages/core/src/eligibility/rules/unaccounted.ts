// Sentences the rules could not account for (B4). Rules never parse every restriction phrasing, so
// the extractor reports each sentence that names a place or uses restriction wording without
// producing a place-scoped or time-zone signal. The engine does not trust a rules green while any
// remain. High recall on purpose: a false positive here only costs a green. Isomorphic.

import { findDemonymMentions } from "../regions/demonyms";
import { findPlaceMentions, isUsStateAbbreviation, type PlaceMention } from "../regions/match";
import type { EligibilitySignal, EvidenceField } from "../signals";

/** A sentence, title or location item that may restrict location and that no signal explains. */
export interface UnaccountedSentence {
  field: EvidenceField;
  /** Verbatim text (at most 400 characters). */
  text: string;
  /** UTF-16 offsets into the field's text (for `locations`: into the items joined with "\n"). */
  start: number;
  end: number;
  /** Which cues fired: "place", "demonym", "us-state-code", or a cue name from `UNACCOUNTED_CUES`. */
  cues: readonly string[];
}

/**
 * Restriction wording. `alone` cues make a sentence a candidate without a place; the others
 * ("only", "must", "require") are listed with the cues of a sentence that has a place, since on
 * their own they are in every requirements list.
 */
export const UNACCOUNTED_CUES: ReadonlyArray<{ cue: string; re: RegExp; alone: boolean }> = [
  { cue: "only", re: /\bonly\b/i, alone: false },
  { cue: "must", re: /\bmust\b/i, alone: false },
  { cue: "require", re: /\brequir\w*/i, alone: false },
  {
    cue: "eligible",
    re: /\beligib\w*\s+(?:to\s+(?:work|be employed)|for\s+employment)|\bnot\s+eligible\b|\bineligible\b/i,
    alone: true,
  },
  {
    cue: "authorized",
    re: /\bauthori[sz](?:ed|ation)\s+to\s+work\b|\bwork\s+authori[sz]ation\b/i,
    alone: true,
  },
  { cue: "right to work", re: /\bright to (?:live and )?work\b/i, alone: true },
  {
    cue: "work permit",
    re: /\bwork\s+(?:permit|visa)\b|\bresidence\s+(?:permit|card)\b/i,
    alone: true,
  },
  {
    cue: "residen",
    // Not pay or tax wording: "may vary depending on your country of residence".
    re: /(?<!\bcountry of\s)\bresiden\w*|\breside\b|\bdomicil\w*/i,
    alone: true,
  },
  { cue: "based in", re: /\bbased\s+(?:in|within|out of|at)\b/i, alone: true },
  { cue: "located in", re: /\blocated\s+(?:in|within|near|at)\b|\blocation\s*:/i, alone: true },
  { cue: "live in", re: /\b(?:live|living)\s+(?:in|within|near)\b/i, alone: true },
  { cue: "relocat", re: /\brelocat\w*/i, alone: true },
  { cue: "on-site", re: /\bon[- ]?site\b|\bin[- ]office\b|\bin[- ]person\b/i, alone: true },
  {
    cue: "hybrid",
    // A work arrangement, not "hybrid cloud" or "a builder-designer hybrid".
    re: /\bhybrid\b(?=\s*(?:role|position|job|work\b|working|setup|schedule|arrangement|policy|basis|mode|model\s+(?:of|with)|office|[,.;:)(/|–—-]|$|\d|from|in\s|at\s|within))|(?:\b(?:is|fully|remote|on-?site|work|working)\s+|[(/:|]\s*)hybrid\b/i,
    alone: true,
  },
  {
    cue: "office",
    re: /(?<!\b(?:home|back|front|box|post)\s)\boffices?\b(?!\s+(?:365|suite|supplies|hours|politics|manager|administrator))/i,
    alone: true,
  },
  { cue: "citizen", re: /\bcitizen\w*|\bpassport\b|\bgreen card\b/i, alone: true },
  {
    cue: "national",
    re: /(?<!inter)\bnationals?\b(?!\s+(?:and international|holidays?|public holidays?|origin|insurance|bank|days?|security|laboratory|labs?|level|average|championship|parks?))|\bnationality\b/i,
    alone: true,
  },
  { cue: "excluded", re: /\bexclud\w*|\bexcept\b|\bexceptions?\s*:/i, alone: true },
  {
    cue: "not available in",
    re: /\b(?:not|n['’]t)\s+(?:be\s+)?(?:available|open|possible|supported)\s+(?:in|to|for|from)\b/i,
    alone: true,
  },
  {
    cue: "cannot hire",
    re: /\b(?:can['’]t|cannot|can not|unable to|not able to|do not|don['’]t|won['’]t|will not)\s+(?:currently\s+)?(?:hire|employ|consider|accept|engage|work with|pay|onboard|recruit)\b/i,
    alone: true,
  },
  {
    cue: "within distance",
    re: /\bwithin\s+(?:\d+\s*(?:miles?|mi|km|kilomet\w*)|(?:a\s+)?(?:commut\w*|reasonable|driving)\s+distance)|\bcommut(?:e|ing|able)\b/i,
    alone: true,
  },
  {
    cue: "time zone",
    re: /\btime ?zones?\b|\btimezones?\b|\b(?:UTC|GMT|CET|CEST|EET|EEST|WET|BST|EST|EDT|CST|CDT|MST|MDT|PST|PDT|AEST|SGT|JST)\b|\b(?:Pacific|Eastern|Central|Mountain)\s+(?:time|hours)\b|\b(?:business|working|office)\s+hours\b|\boverlap\w*\b[^.;]{0,40}\b(?:hours?|time|time ?zones?|timezones?|[A-Z]{2,4}T)\b|\b\d+\s*(?:\+\s*)?hours?\s+(?:of\s+)?overlap|\b(?:east|west) coast\b/i,
    alone: true,
  },
  {
    cue: "time zone",
    re: /\b(?:ET|PT|CT|MT)\b(?=\s*(?:time|hours|business|\)|\/))|\d\s*(?:[ap]\.?m\.?)?\s*(?:ET|PT|CT|MT)\b|\bIST\b/,
    alone: true,
  },
  {
    cue: "us-paperwork",
    re: /\bE-Verify\b|\bW-?2\b|\bW-?9\b|\b1099\b|\bI-9\b|\bSocial Security\b|\bSSN\b|\bH-?1B\b|\bC2C\b/,
    alone: true,
  },
  {
    cue: "sanctions",
    re: /\bsanction\w*|\bembargo\w*|\bOFAC\b|\bexport control\w*|\bITAR\b/i,
    alone: true,
  },
  { cue: "security clearance", re: /\bclearance\b/i, alone: true },
];

/** US state codes after residence or "states" words ("Must reside in AZ, CA, CO, TX"). */
const STATE_CODE_CONTEXT_RE =
  /\b(?:reside|residents?|residing|located|based|live|living|states?|hire in|hiring in)\b[^.;\n]{0,25}?\b([A-Z]{2})\b/g;

export interface SentencePlaces {
  mentions: PlaceMention[];
  cues: string[];
}

/** Places (names, demonyms, state codes) and restriction cues in `text`. */
export function sentenceCues(rawText: string): SentencePlaces {
  // Links are not wording ("https://officesnapshots.com/..."); blank them, keeping offsets.
  const text = rawText.replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, (url) => " ".repeat(url.length));
  const mentions = findPlaceMentions(text);
  const cues: string[] = [];
  if (mentions.length > 0) cues.push("place");
  const demonyms = findDemonymMentions(text, true).filter(
    (d) => !mentions.some((m) => d.start < m.end && d.end > m.start),
  );
  if (demonyms.length > 0) cues.push("demonym");
  for (const match of text.matchAll(STATE_CODE_CONTEXT_RE)) {
    if (match[1] && isUsStateAbbreviation(match[1])) {
      cues.push("us-state-code");
      break;
    }
  }
  for (const { cue, re } of UNACCOUNTED_CUES) if (re.test(text)) cues.push(cue);
  return {
    mentions: [...mentions, ...demonyms].sort((a, b) => a.start - b.start),
    cues: [...new Set(cues)],
  };
}

const PLACE_CUES = new Set(["place", "demonym", "us-state-code"]);

/**
 * A place plus a restriction cue that can stand alone: never skipped as boilerplate. US paperwork
 * words alone do not count (they are in every US equal-opportunity footer); such sentences are
 * still reported as unaccounted.
 */
export function hasRestrictionCueAndPlace(text: string): boolean {
  const { cues } = sentenceCues(text);
  const alone = new Set(UNACCOUNTED_CUES.filter((c) => c.alone).map((c) => c.cue));
  const hasPlace = cues.some((c) => PLACE_CUES.has(c));
  return hasPlace && cues.some((c) => (alone.has(c) && c !== "us-paperwork") || c === "only");
}

const PLACE_KINDS = new Set([
  "allow-list",
  "exclude",
  "work-authorization",
  "citizenship-or-clearance",
  "timezone",
  "anchor",
]);

/**
 * The unaccounted entry for one sentence, or null. `signals` are the non-deduplicated signals the
 * extractor emitted for this field; a signal belongs to the sentence when its evidence starts
 * inside it. `accounted` are spans the rules read on purpose without a signal of their own (the
 * origin in "candidates in Ukraine ready to relocate to Poland").
 */
export function unaccountedFor(
  field: EvidenceField,
  sentence: { text: string; start: number; end: number },
  signals: readonly EligibilitySignal[],
  accounted: ReadonlyArray<readonly [number, number]>,
): UnaccountedSentence | null {
  const { mentions, cues } = sentenceCues(sentence.text);
  const aloneCues = new Set(UNACCOUNTED_CUES.filter((c) => c.alone).map((c) => c.cue));
  const hasPlace = cues.some((c) => PLACE_CUES.has(c));
  if (!hasPlace && !cues.some((c) => aloneCues.has(c))) return null;
  // A place in a perk with no restriction wording ("team retreats (last one in Spain)").
  if (
    hasPlace &&
    !cues.some((c) => aloneCues.has(c) || c === "only") &&
    /\b(?:retreats?|off-?sites?|offsites?|team trips?|meetups?|conferences?|summits?|workations?)\b/i.test(
      sentence.text,
    )
  ) {
    return null;
  }

  const own = signals.filter(
    (s) =>
      s.evidence.field === field &&
      s.strength !== "weak" &&
      s.evidence.start !== undefined &&
      s.evidence.start >= sentence.start &&
      s.evidence.start < sentence.end,
  );
  const placeSignals = own.filter(
    (s) =>
      PLACE_KINDS.has(s.kind) ||
      (s.engagement?.mode === "relocation-required" &&
        s.scopes.countries.length + s.scopes.regions.length > 0),
  );
  const worldwide = own.some((s) => s.kind === "worldwide");
  const timezone = own.some((s) => s.kind === "timezone");

  let accountedFor: boolean;
  if (!hasPlace) {
    accountedFor = placeSignals.length > 0 || worldwide;
  } else {
    const inSpan = (m: PlaceMention) =>
      accounted.some(([s, e]) => sentence.start + m.start >= s && sentence.start + m.end <= e);
    const covered = (m: PlaceMention) => {
      if (inSpan(m)) return true;
      const ref = m.ref;
      // "Europe/Kyiv": an IANA zone name read by the time-zone rules.
      if (
        timezone &&
        (/\/$/.test(sentence.text.slice(0, m.start)) || sentence.text.charAt(m.end) === "/")
      ) {
        return true;
      }
      if (
        timezone &&
        /^\s*(?:[\p{L}-]+\s+){0,2}(?:time|hours|time ?zones?|timezones?)(?![\p{L}])/iu.test(
          sentence.text.slice(m.end),
        )
      ) {
        return true;
      }
      return placeSignals.some((s) => {
        const places = [
          ...s.scopes.countries,
          ...s.scopes.regions,
          ...(s.timezone?.places?.countries ?? []),
          ...(s.timezone?.places?.regions ?? []),
        ];
        if (ref.type === "country") return places.includes(ref.country);
        if (ref.type === "region") return places.includes(ref.region);
        return ref.candidates.some((c) => places.includes(c));
      });
    };
    const stateCodesCovered =
      !cues.includes("us-state-code") ||
      placeSignals.some((s) => s.scopes.countries.includes("US"));
    accountedFor = mentions.every(covered) && stateCodesCovered;
  }
  if (accountedFor) return null;
  return {
    field,
    text: sentence.text.length > 400 ? `${sentence.text.slice(0, 397)}...` : sentence.text,
    start: sentence.start,
    end: sentence.end,
    cues,
  };
}
