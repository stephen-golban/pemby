// Demonyms and country adjectives ("Ukrainian residents", "Canadian citizens", "our Moldovan
// entity"). They are place mentions only next to a person, paperwork or organisation noun, since
// most of them are also languages ("fluent German") or ordinary words ("Polish the UI"). Region
// adjectives ("European", "Latin American") are region aliases in `groups.ts`. Isomorphic.

import type { CountryCode } from "./countries";
import type { PlaceMention } from "./match";

/** Adjective to country. "Georgian" is always a guess (the US state has the same adjective). */
export const DEMONYMS: ReadonlyMap<string, CountryCode> = new Map([
  ["American", "US"],
  ["British", "GB"],
  ["Canadian", "CA"],
  ["Australian", "AU"],
  ["Israeli", "IL"],
  ["Indian", "IN"],
  ["German", "DE"],
  ["French", "FR"],
  ["Swiss", "CH"],
  ["Singaporean", "SG"],
  ["Japanese", "JP"],
  ["Korean", "KR"],
  ["Polish", "PL"],
  ["Ukrainian", "UA"],
  ["Moldovan", "MD"],
  ["Moldavian", "MD"],
  ["Georgian", "GE"],
  ["Armenian", "AM"],
  ["Serbian", "RS"],
  ["Bosnian", "BA"],
  ["Montenegrin", "ME"],
  ["Macedonian", "MK"],
  ["Albanian", "AL"],
  ["Kosovar", "XK"],
  ["Russian", "RU"],
  ["Belarusian", "BY"],
  ["Azerbaijani", "AZ"],
  ["Kazakh", "KZ"],
  ["Philippine", "PH"],
  ["Filipino", "PH"],
  ["Brazilian", "BR"],
  ["Mexican", "MX"],
  ["Spanish", "ES"],
  ["Portuguese", "PT"],
  ["Dutch", "NL"],
  ["Irish", "IE"],
  ["Romanian", "RO"],
  ["Argentine", "AR"],
  ["Argentinian", "AR"],
  ["Colombian", "CO"],
  ["Chilean", "CL"],
  ["Peruvian", "PE"],
  ["Uruguayan", "UY"],
  ["Estonian", "EE"],
  ["Lithuanian", "LT"],
  ["Latvian", "LV"],
  ["Czech", "CZ"],
  ["Slovak", "SK"],
  ["Slovenian", "SI"],
  ["Hungarian", "HU"],
  ["Bulgarian", "BG"],
  ["Croatian", "HR"],
  ["Turkish", "TR"],
  ["Emirati", "AE"],
  ["Nigerian", "NG"],
  ["Kenyan", "KE"],
  ["Egyptian", "EG"],
  ["South African", "ZA"],
  ["Pakistani", "PK"],
  ["Bangladeshi", "BD"],
  ["Sri Lankan", "LK"],
  ["Vietnamese", "VN"],
  ["Indonesian", "ID"],
  ["Malaysian", "MY"],
  ["Thai", "TH"],
  ["Chinese", "CN"],
  ["Taiwanese", "TW"],
  ["Italian", "IT"],
  ["Swedish", "SE"],
  ["Norwegian", "NO"],
  ["Danish", "DK"],
  ["Finnish", "FI"],
  ["Austrian", "AT"],
  ["Belgian", "BE"],
  ["Greek", "GR"],
  ["Cypriot", "CY"],
  ["Maltese", "MT"],
  ["Luxembourgish", "LU"],
  ["Icelandic", "IS"],
]);

/** Adjectives that are guesses even when followed by a person noun. */
const GUESSED_DEMONYMS: ReadonlySet<string> = new Set(["Georgian"]);

/** Nouns that make an adjective a place: people, paperwork, legal entities. */
const DEMONYM_NOUN_RE =
  /^(?:\s*-\s*|\s+)(?:(?:tax\s+|legal\s+|permanent\s+)?(?:residents?|residency|residence(?:\s+(?:card|permit))?|citizens?|citizenship|nationals?|nationality|passports?|passport holders?|candidates?|applicants?|talent|engineers?|developers?|professionals?|people|persons?|individuals?|workers?|contractors?|freelancers?|employees?|hires?|team members?|work (?:permit|authori[sz]ation|visa)|visa|entity|entities|subsidiary|legal entity|company|companies|office|offices|team|teams|bank account|address|tax ID|ID card|sole proprietorship|sole proprietors?|private entrepreneurs?|FOP|territory|soil))\b/i;

/** "Latin American", "North American", "South African" stay with their own entries. */
const DEMONYM_PREFIX_BLOCK_RE = /\b(?:Latin|North|South|Central|African|Asian|Native|Anglo)[\s-]$/;

const DEMONYM_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}_])(?:${[...DEMONYMS.keys()]
    .sort((a, b) => b.length - a.length)
    .join("|")})(?![\p{L}\p{N}_])`,
  "gu",
);

/**
 * Demonyms used as places: "Ukrainian residents", "Georgian citizens", "our Moldovan entity",
 * "Canadian-based talent". Each mention resolves to its country, `via: "country"`; "Georgian" is
 * marked guessed. With `loose`, any capitalised demonym counts that is not a language use
 * ("fluent German") or part of a longer adjective ("Latin American"); used to find sentences that
 * may restrict location, never to emit signals.
 */
export function findDemonymMentions(text: string, loose = false): PlaceMention[] {
  const out: PlaceMention[] = [];
  for (const match of text.matchAll(DEMONYM_RE)) {
    const start = match.index;
    const end = start + match[0].length;
    const country = DEMONYMS.get(match[0]);
    if (!country) continue;
    if (DEMONYM_PREFIX_BLOCK_RE.test(text.slice(Math.max(0, start - 10), start))) continue;
    const after = text.slice(end, end + 40);
    const nounFollows = DEMONYM_NOUN_RE.test(after) || /^\s*-?\s*based\b/i.test(after);
    if (!nounFollows) {
      if (!loose) continue;
      const before = text.slice(Math.max(0, start - 30), start);
      const language =
        /^\s*[—–:-]?\s*(?:fluent|native|fluency|[ABC][12]\b|upper|intermediate|advanced|basic|conversational|proficient|written|spoken|is a plus|would be a plus)/i.test(
          after,
        ) ||
        /^\s*(?:and|or|,)?\s*(?:language|speaking|speaker|-speaking|skills|fluency|proficiency|translation|localization|localisation|version|UI|content|text|market|customers|users)\b/i.test(
          after,
        ) ||
        /\b(?:fluent|fluency|native|speak(?:s|ing)?|written|spoken|proficien\w*|knowledge of|command of|translate\w*|in|and|or|English)\s*(?:in\s+)?(?:and\s+|or\s+|,\s*)?$/i.test(
          before,
        );
      // Sentence-initial imperative "Polish the UI".
      if (language || (match[0] === "Polish" && /^\s+(?:the|our|your|and|a|an)\b/i.test(after))) {
        continue;
      }
    }
    out.push({
      start,
      end,
      text: match[0],
      ref: {
        type: "country",
        country,
        via: "country",
        ...(GUESSED_DEMONYMS.has(match[0]) ? { guessed: true } : {}),
      },
    });
  }
  return out;
}
