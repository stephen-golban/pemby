// Deterministic eligibility extraction from a job post (phase 05, rules first). Precision over
// recall: when a sentence could be read two ways, no signal is emitted and the job is marked
// unresolved so the LLM and the engine decide. Isomorphic.

import { WAYS_OF_WORKING, type WayOfWorking } from "../../ways-of-working";
import type { CountryCode } from "../regions/countries";
import { DEMONYMS, findDemonymMentions } from "../regions/demonyms";
import { findPlaceMentions, type PlaceMention } from "../regions/match";
import type {
  CitizenshipRequirement,
  EligibilitySignal,
  EngagementMode,
  EvidenceField,
  SignalKind,
  SignalScopes,
  SignalSource,
  SignalStrength,
} from "../signals";
import { parsePlaceList, type PlaceList } from "./place-list";
import { extractSalaries, type SalaryMention } from "./salary";
import { readEmploymentType, readJsonLd, readLocations } from "./structured";
import {
  NEGATION_RE,
  PREFERENCE_RE,
  clauseBefore,
  isConditional,
  isDescriptive,
  isPureBoilerplate,
  negationScopeBefore,
  splitSentences,
  type Sentence,
} from "./text";
import { extractTimezoneHits } from "./timezone";
import { unaccountedFor, type UnaccountedSentence } from "./unaccounted";

/** Bump when patterns change, so stored rule output can be recomputed. */
export const RULES_VERSION = "rules-2026-09-17.5";

export interface RuleInput {
  title: string;
  /** Every location string the ATS lists (`jobs.locations`). */
  locations: readonly string[];
  /** `jobs.workplace_type`: remote | hybrid | onsite | unknown, or null. */
  workplaceType: string | null;
  /** Raw vendor employment type (`jobs.employment_type`). */
  employmentType: string | null;
  /** Plain-text description (`jobs.raw_text`), newlines between paragraphs and list items. */
  descriptionText: string;
  /** Parsed JSON-LD from the posting page, when available (object, array or @graph). */
  jsonLd?: unknown;
}

export interface RuleExtraction {
  signals: EligibilitySignal[];
  /**
   * True when rules cannot settle eligibility: no decisive statement, an ambiguous or negated
   * place statement, or statements that conflict. The LLM and engine must decide.
   */
  unresolved: boolean;
  /** Machine-readable reasons, for example "no-decisive-signal" or "ambiguous-place:Georgia". */
  unresolvedReasons: string[];
  /** Informational notes that do not block ("ats-worldwide-vs-text-restriction"). */
  notes: string[];
  /** Salary figures found in the description (not eligibility signals). */
  salaries: SalaryMention[];
  /**
   * B4: sentences (and, when the workplace type is unknown, title and location items) that name a
   * place or use restriction wording but produced no place-scoped or time-zone signal (weak ones do
   * not count; a worldwide signal accounts only for a sentence without places). A rules green is
   * not trustworthy while this is non-empty: something in the post may restrict location that the
   * rules did not read. Company self-description with places ("our Kyiv-based engineers") lands
   * here too. See `UNACCOUNTED_CUES`.
   */
  unaccounted: UnaccountedSentence[];
  rulesVersion: string;
}

interface Context {
  field: EvidenceField;
  source: SignalSource;
  workplaceType: string | null;
  /** Full description, for "is this provider the employer itself" checks. */
  fullText: string;
  signals: EligibilitySignal[];
  notes: string[];
  /** B4: spans (field offsets) read on purpose without a signal of their own (relocation origin). */
  accounted: Array<[number, number]>;
  /** B4: ways of working for place signals of a way-specific clause ("Contractors: US only"). */
  ways?: readonly WayOfWorking[];
}

// ---- Patterns ------------------------------------------------------------------------------

const WHO = String.raw`(?:(?:candidates|applicants|applications|people|talent|residents|citizens|nationals|those|individuals|professionals|engineers|developers|team members|employees|contractors|freelancers|anyone|someone)\s+)`;
const WHERE_VERB = String.raw`(?:(?:who\s+(?:are|live|reside)\s+)?(?:currently\s+)?(?:based|located|living|residing|resident)\s+)`;
const PREP = String.raw`(?:in|from|within|inside)`;

/** B4: "... in our New York office": the lead of an office place (the office word must follow). */
const OFFICE_LEAD_RE = /\b(?:in(?:to)?|at|from|out of|for|to)\s+(?:one of\s+)?our\s+/gi;

interface Trigger {
  re: RegExp;
  strength: SignalStrength;
  /** A "Location:"-style label: an anchor unless the label or job says remote. */
  label?: boolean;
  /** Needs job words in the sentence ("available in Ukraine" is also said of products). */
  roleContext?: boolean;
  /** Must follow the last place ("resident" in "must be a current US resident"). */
  suffix?: RegExp;
  /** The trigger already contains the negation that makes it a rule ("cannot hire outside"). */
  negationInTrigger?: boolean;
  /** The trigger contains its own "if" ("please only apply if you live in"). */
  conditionalOk?: boolean;
  /** Emit only when a negative tail follows ("candidates based in X won't be considered"). */
  excludeOnly?: boolean;
  /** Skip when the sentence describes duties or a sales territory ("work across Moldova"). */
  dutyGuard?: boolean;
  /** B4: the list must be followed by an office word ("based in our New York office"). */
  office?: boolean;
  /** B4: "only" after an excludeOnly list makes it an allow-list ("will be accepted only"). */
  positiveTail?: boolean;
}

/** Allow-list triggers. Each regex ends where the place list starts. */
const ALLOW_TRIGGERS: readonly Trigger[] = [
  {
    re: new RegExp(
      String.raw`\b(?:must|should|shall|need to|needs to|required to|have to|has to|will need to)\s+(?:be\s+)?(?:(?:currently|physically|permanently|legally|already)\s+)*(?:based|located|living|residing|resident|reside|live|domiciled|situated)(?:\s+(?:and|&)\s+(?:eligible|authori[sz]ed)\s+(?:to work|for employment))?(?:\s+or\s+(?:be\s+)?(?:willing|able)\s+to\s+relocate\s+to)?\s+${PREP}\s+`,
      "gi",
    ),
    strength: "explicit",
  },
  {
    re: /\b(?:must|should|need to)\s+(?:be\s+)?(?:a\s+)?(?:legal\s+)?residents?\s+of\s+/gi,
    strength: "explicit",
  },
  {
    // B2 rule 4: "must be a (current) <place> resident" is a residence requirement.
    re: /\b(?:must|should|need to|needs to|required to|have to)\s+be\s+(?:a|an)\s+(?:(?:current|legal|permanent|full-time|tax)\s+)*/gi,
    strength: "explicit",
    suffix: /^\s*-?\s*(?:(?:tax|permanent)\s+)?residents?\b/i,
  },
  {
    re: /\b(?:current\s+|permanent\s+)?(?:residence|residency)\s+(?:in|within)\s+/gi,
    strength: "implied",
  },
  {
    re: new RegExp(
      String.raw`\b(?:can|are able to|is able to|are currently able to|is currently able to)\s+(?:only\s+)?(?:hire|employ|recruit|consider|accept|engage|onboard)\s+${WHO}?${WHERE_VERB}?${PREP}\s+`,
      "gi",
    ),
    strength: "implied",
  },
  {
    re: new RegExp(
      String.raw`\b(?:(?:only|currently|exclusively)\s+)+(?:hiring|recruiting|accepting applications|accepting applicants|considering\s+${WHO}|accepting\s+${WHO})\s*${WHO}?${WHERE_VERB}?${PREP}\s+`,
      "gi",
    ),
    strength: "explicit",
  },
  {
    // B3 C2: "we're hiring in X" is usually company-wide ("check our careers page"): weak.
    re: new RegExp(String.raw`\bwe(?:\s+are|'re|’re)\s+(?:currently\s+)?hiring\s+${PREP}\s+`, "gi"),
    strength: "weak",
  },
  {
    re: new RegExp(
      String.raw`\b(?:open|available|restricted|limited)\s+(?:only\s+)?(?:to\s+)${WHO}?${WHERE_VERB}?${PREP}\s+|\b(?:available|open)\s+${PREP}\s+`,
      "gi",
    ),
    strength: "implied",
    roleContext: true,
  },
  {
    // B4: "provided they can work in the US", "as long as you're based in".
    re: /\b(?:as long as|so long as|provided(?: that)?)\s+(?:you|they|candidates|applicants|the candidate)(?:['’]re|\s+are|\s+can|\s+live|\s+reside)?\s+(?:(?:currently|legally|physically)\s+)?(?:(?:based|located|living|residing|work|live|reside|authori[sz]ed to work|eligible to work|able to work)\s+)?(?:in|within|from)\s+/gi,
    strength: "explicit",
  },
  {
    re: new RegExp(
      String.raw`\b(?:only\s+)?(?:interested in|welcome|welcoming|accept|accepting|consider|considering|seeking|looking for)\s+${WHO}${WHERE_VERB}?${PREP}\s+`,
      "gi",
    ),
    strength: "implied",
  },
  {
    re: new RegExp(
      String.raw`\b(?:you(?:'ll|\s+will)?\s+(?:need\s+to\s+)?(?:be\s+)?(?:based|located|working|work)|(?:role|position|job|opportunity)\s+(?:is|will be)\s+(?:(?:fully|100%)\s+)?(?:remote(?:ly)?\s+)?(?:based|located)(?:\s+remotely)?|(?:based|located|working|work)\s+remotely|(?:fully|100%)\s+remote(?:ly)?(?:\s+(?:work|role|position|job|opportunity))?|remote\s+(?:work|role|position|job|opportunity))\s+(?:only\s+)?(?:in|within|across|throughout|from)\s+`,
      "gi",
    ),
    strength: "implied",
    dutyGuard: true,
  },
  {
    re: /\b(?:anywhere|from anywhere)\s+(?:in|within|across|throughout)\s+(?!the world\b|the globe\b)/gi,
    strength: "implied",
  },
  {
    re: /\bremot[eo]\s*[([]\s*/gi,
    strength: "implied",
  },
  {
    re: /\bremot[eo]\s*(?:[-–—|:/]|,(?=\s*[A-Z]))\s*/gi,
    strength: "implied",
  },
  // B3 C2: "only candidates located in X (will be considered)".
  {
    re: new RegExp(String.raw`\bonly\s+${WHO}${WHERE_VERB}?${PREP}\s+`, "gi"),
    strength: "explicit",
  },
  // B3 C2: "only open to residents of X", "restricted to citizens of X".
  {
    re: /\b(?:open|available|restricted|limited)\s+(?:only\s+)?to\s+(?:only\s+)?(?:(?:legal|permanent|current)\s+)?(?:residents|citizens|nationals)\s+of\s+/gi,
    strength: "explicit",
  },
  // B3 C2: "cannot hire outside (of) X", "unable to consider candidates outside the US".
  {
    re: new RegExp(
      String.raw`(?:\bcannot|\bcan['’]t|\bcan not|\bunable to|\bnot able to|\bdo not|\bdon['’]t|\bwon['’]t|\bwill not|\bno longer)\s+(?:currently\s+)?(?:hire|employ|consider|accept|engage|work with|support|onboard|recruit)\s+${WHO}?${WHERE_VERB}?outside(?:\s+of)?\s+`,
      "gi",
    ),
    strength: "explicit",
    negationInTrigger: true,
  },
  // B3 C2: "Remote within the US", "remote across the United States", "Remote from India".
  {
    re: /\b(?:remote(?:ly)?|work remotely)\s+(?:only\s+)?(?:within|across|throughout|from|in)\s+/gi,
    strength: "implied",
    dutyGuard: true,
  },
  // B3 C2: "must be in the US", "must be physically present in the United States".
  {
    re: /\b(?:must|should|need to|needs to|required to|have to|has to)\s+(?:be\s+)?(?:physically\s+)?(?:present\s+|located\s+|living\s+)?in\s+/gi,
    strength: "explicit",
  },
  // B3 C2: "must be based in-country (US)".
  {
    re: /\b(?:must|should|need to|needs to)\s+be\s+(?:(?:based|located)\s+)?in[- ]country\s*\(\s*/gi,
    strength: "explicit",
  },
  // B3 C2: "please only apply if you live in X" (the "if" belongs to the rule).
  {
    re: /\bonly\s+apply\s+if\s+you\s+(?:currently\s+)?(?:live|reside|are\s+(?:based|located|living|residing))\s+(?:in|within)\s+/gi,
    strength: "explicit",
    conditionalOk: true,
  },
  // B3 C2: "applications only accepted from UK residents".
  {
    re: /\b(?:applications|applicants|candidates)\s+(?:are\s+|will\s+)?only\s+(?:be\s+)?(?:accepted|considered)\s+(?:from|in)\s+/gi,
    strength: "explicit",
  },
  // B3 C2: "we hire only in Latin America".
  {
    re: /\b(?:hire|hiring|recruit|recruiting|employ)\s+only\s+(?:in|from)\s+/gi,
    strength: "explicit",
  },
  // B3 C2: "this role is restricted to Brazil".
  {
    re: /\b(?:restricted|limited)\s+(?:only\s+)?to\s+(?:(?:candidates|applicants|people)\s+(?:in|from|based in|located in)\s+)?/gi,
    strength: "explicit",
    roleContext: true,
  },
  // B3 C2: "this role is for candidates in India".
  {
    re: new RegExp(
      String.raw`\b(?:role|position|job|opportunity)\s+is\s+(?:only\s+)?(?:for|open to)\s+${WHO}${WHERE_VERB}?${PREP}\s+`,
      "gi",
    ),
    strength: "implied",
  },
  // B3 C2: "Hiring in: Philippines".
  {
    re: /\bhiring\s+in\s*:\s*/gi,
    strength: "implied",
  },
  // B3 M5: "candidates residing in X won't be considered" (an exclusion, never an allow-list).
  {
    // B4: also "candidates from X can't be considered", "residents of X are not eligible".
    re: new RegExp(String.raw`\b${WHO}(?:${WHERE_VERB}?${PREP}|of)\s+`, "gi"),
    strength: "explicit",
    excludeOnly: true,
    positiveTail: true,
  },
  // B4: "this (particular) role requires US residency".
  {
    re: /\b(?:role|position|job|opportunity)\s+(?:also\s+)?requires\s+(?:(?:a|an|valid|current|permanent|legal|full)\s+)*/gi,
    strength: "explicit",
    suffix:
      /^\s*-?\s*(?:(?:tax|permanent|legal)\s+)?(?:residency|residence|resident status|work authori[sz]ation|right to work)\b/i,
  },
  // B4: "requires you to live in the US".
  {
    re: /\brequires?\s+(?:you|candidates|applicants|the candidate|employees|hires)\s+to\s+(?:be\s+)?(?:(?:physically|currently|permanently)\s+)?(?:live|reside|based|located|work)\s+(?:in|within|from)\s+/gi,
    strength: "explicit",
  },
  // B4: "for this role, we're focused on candidates in the US", "we can only consider applicants in".
  {
    re: new RegExp(
      String.raw`\b(?:focused on|focusing on|concentrating on)\s+${WHO}${WHERE_VERB}?${PREP}\s+`,
      "gi",
    ),
    strength: "implied",
  },
  {
    re: new RegExp(
      String.raw`\b(?:(?:can|will|may)\s+only\s+consider|only\s+consider(?:ing)?)\s+${WHO}?${WHERE_VERB}?${PREP}\s+`,
      "gi",
    ),
    strength: "explicit",
  },
  // B4: "currently, we hire in the US and Canada", "we only hire in", "we hire people in".
  {
    re: new RegExp(
      String.raw`\b(?:currently,?\s+)?we\s+(?:(?:currently|only|exclusively|presently)\s+)*(?:hire|employ|recruit|work with|onboard)\s+${WHO}?${WHERE_VERB}?(?:in|from|within)\s+`,
      "gi",
    ),
    strength: "implied",
  },
  // B4: "hiring across the Americas".
  {
    re: /\b(?:hiring|recruiting)\s+(?:across|throughout)\s+/gi,
    strength: "implied",
    dutyGuard: true,
  },
  // B4: "live within 50 miles of Austin", "within commuting distance of our NYC office", "near Seattle".
  {
    re: /\b(?:within\s+(?:\d+\s*(?:miles?|mi|km|kilomet(?:er|re)s?)|(?:a\s+)?(?:commut(?:ing|able)|reasonable|driving)\s+distance)\s+(?:of|from|to)\s+(?:our\s+)?|(?:located|live|living|based|reside|residing)\s+(?:near|close to|nearby)\s+(?:our\s+)?)/gi,
    strength: "implied",
  },
  // B4: "in-person attendance in San Francisco".
  {
    re: /\bin[- ]person\b[^.;]{0,40}?\b(?:in|at)\s+(?:our\s+)?/gi,
    strength: "implied",
    dutyGuard: true,
  },
  // B4: on-site in an office: "based in our New York office", "3 days a week in our NYC office",
  // "work from our London office", "an on-site role in our Berlin office", "hiring for our Warsaw office".
  {
    re: OFFICE_LEAD_RE,
    strength: "implied",
    office: true,
    dutyGuard: true,
  },
  {
    re: /\b(?:location|locations|region|country|countries|eligible (?:countries|locations|regions)|hiring (?:countries|locations|regions)|candidate location|work location|location requirements?|ubicaci[oó]n|localiza[cç][aã]o|where)(?:\s*[:|]|[ \t]*\n)\s*(?:(?:100%\s+|fully\s+)?remot[eo]\s*(?:[-–—,:(/|]\s*|\bin\s+|\bwithin\s+)?)?/gi,
    strength: "implied",
    label: true,
  },
];

const EXCLUDE_TRIGGERS: readonly RegExp[] = [
  new RegExp(
    // B4: also "unable to pay contractors in", "cannot hire nationals of".
    String.raw`(?:\bnot|n['’]t|\bcannot|\bunable to|\bno longer)\s+(?:currently\s+)?(?:be\s+)?(?:able to\s+)?(?:hire|hiring|employ|recruit|consider(?:ing)?|accept(?:ing)?|support|work with|engage|open to|available (?:to|in|for)|pay|onboard|contract with)\s+${WHO}?${WHERE_VERB}?(?:(?:${PREP}|of)\s+)?`,
    "gi",
  ),
  new RegExp(String.raw`\bno\s+${WHO}${WHERE_VERB}?${PREP}\s+`, "gi"),
  /\b(?:except(?:\s+for)?|excluding|excluded:?|other than|with the exception of|but not(?:\s+in)?|not including|no aplica(?:\s+para)?|excepto|salvo)\s+(?:candidates\s+(?:in|from)\s+)?/gi,
  // B4: "Exceptions: Ukraine", "Restricted countries: Ukraine", "Excluded locations: ...".
  /\b(?:exceptions?|(?:restricted|sanctioned|excluded|ineligible|unsupported|embargoed)\s+(?:countries|locations|regions|territories|jurisdictions))\s*:\s*/gi,
  /\b(?:is|are)\s+not\s+(?:available|open|possible|supported)\s+(?:for\s+(?:candidates\s+)?)?(?:in|from)\s+/gi,
];

/** A list must end cleanly, or it was not a list of places ("work in the EU regulatory space"). */
const CLEAN_END_RE =
  /^\s*(?:$|[.;:!?)\]*]|,|-|–|—|\/|\(|(?:only|region|regions|countries|country|area|time ?zones?|timezones?|based|remote|remotely|residents?|candidates|applicants|office|offices|hub|is|are|will|with|who|and|or|to|at|for|as|if|while|because|due|excluding|except|but|please|so|where|which|we|you|without|unless|on|by|under|through|required|needed|mandatory|necessary|holders?|citizens|nationals|can['’]?t|cannot|won['’]t|may|must|need|office|offices|HQ|headquarters|hub|within|willing|ready|prepared|twice|once|every|each|weekly|monthly|quarterly)\b)/i;

/** "Candidates in X will not be considered." */
// B3 M5: "are excluded", "won't be considered", "not eligible", "no longer possible", "not accepted".
const NEGATIVE_TAIL_RE =
  /^\s*[,:]?\s*(?:(?:are|is)\s+)?(?:not\s+(?:supported|eligible|available|possible|accepted|allowed)\b|(?:can['’]t|cannot|won['’]t|will not)\s+be\s+(?:considered|accepted|hired|supported)\b)|^\s*,?\s*(?:(?:will|can|could|are|is|may)\s*(?:not|n['’]t)\s+be\s+(?:considered|accepted|eligible|able|hired|supported)|(?:won['’]t|cannot|can['’]t)\s+be\s+(?:considered|accepted|hired|supported)|(?:are|is)\s+(?:excluded|not eligible|ineligible|not accepted|not supported|not possible|not allowed|no longer (?:possible|accepted|eligible|supported))|(?:are|is)\s+not\s+(?:currently\s+)?(?:eligible|accepted|considered))/i;

/** B4: "Applicants from the US will be accepted only", "... only will be considered". */
const POSITIVE_ONLY_TAIL_RE =
  /^\s*,?\s*(?:will|can|may)\s+(?:only\s+be|be\s+only|be)\s+(?:accepted|considered|hired)\s+only\b|^\s*,?\s*(?:will|can|may)\s+only\s+be\s+(?:accepted|considered|hired)\b|^\s*only\b/i;

// B3 M5: past tense never makes a current rule ("in the past we could hire in Ukraine").
const PAST_RE =
  /\b(?:in the past|used to|previously|formerly|no longer possible|we once|had been)\b/i;

// B3 C2: "work across Moldova and Romania, travelling monthly": duties, not residence.
const DUTY_RE =
  /\b(?:travel\w*|territor\w*|accounts?|customers?|clients?|partners?|markets?|sales|visit\w*|cover(?:ing)?)\b/i;

/** A rule narrowed by where the company has an entity: weak ("anywhere in EMEA where we have a work location"). */
const ENTITY_QUALIFIER_RE =
  /\bwhere\s+(?:we|[A-Z][\w&.-]+(?:\s[A-Z][\w&.-]+)?)\s+(?:has|have|already have|currently have)\s+(?:a|an)?\s*(?:work location|legal entity|entity|office|offices|presence|payroll|employer of record)|\bas long as we have\b|\bwhere we (?:can|are able to) (?:hire|employ|legally)|\bin (?:which|the countries where) we (?:operate|have)|\bin (?:the |select |selected |supported )?countries (?:it|they|our (?:EOR|partner|provider)) supports?\b|\bwhere (?:it|they|our (?:EOR|partner|provider)) (?:is available|operates?|supports?)\b/i;

const ROLE_CONTEXT_RE =
  /\b(?:role|position|job|opening|opportunit\w*|vacanc\w*|remote|remotely|candidates?|applicants?|hire|hiring)\b/i;

const ELIGIBILITY_CONTEXT_RE =
  /\b(?:remote|remotely|hire|hiring|candidates|applicants|applications|based|located|reside|residents?|citizens|nationals|countries|anywhere|worldwide|globally|eligible|open to|relocat|work from|EMEA|Europe|LATAM|APAC|locations?|ubicaci[oó]n|role|position|job|opening|contractors|pay)\b/i;

const WORLDWIDE_PATTERNS: ReadonlyArray<{
  re: RegExp;
  strength: SignalStrength;
  /** Still counts in a sentence with benefit words (never with a time-limited perk). */
  inBenefits?: boolean;
}> = [
  {
    // B2 rule 2: "work from any location worldwide" names residence, not a perk; allowed next to
    // benefit words because the post-level conflict checks send it to the LLM when anything else
    // in the post restricts location. Implied, so it alone never makes a green.
    re: /\b(?:work|working|live|living|based|remotely)\s+(?:remotely\s+)?from\s+any\s+(?:location|country|place)\s+(?:worldwide|in the world|around the world|globally)\b/gi,
    strength: "implied",
    inBenefits: true,
  },
  {
    // B2 rule 3: "join our workforce from almost any country" is worldwide with a hedge: implied,
    // so the engine keeps it at yellow at most (only explicit worldwide can reach green).
    re: /\b(?:join|work|working|hire|hiring|contribute|collaborate)\b[^.;]{0,40}?\bfrom\s+(?:almost|nearly|virtually|practically)\s+(?:any|every)\s+(?:country|location|place)\b/gi,
    strength: "implied",
  },
  {
    re: /\b(?:anywhere in the world|from anywhere in the world|any country in the world|(?:in|from) any country|regardless of (?:your |their )?(?:location|where you (?:live|are)|country)|location[- ]independent|no location restrictions?|no geographic(?:al)? restrictions?|we hire (?:globally|worldwide|internationally|from anywhere|anywhere)|hire (?:talent|people|engineers|developers) (?:from )?(?:all over|around|across) the (?:world|globe)|open to (?:candidates|applicants|talent|applications|people) (?:from |based )?(?:anywhere|worldwide|globally|all over the world|around the world|in all countries|from all countries|in any country))\b/gi,
    strength: "explicit",
  },
  {
    // Labels only: "Remote (Worldwide)", "Remote - Global", "Location: Anywhere". The word must end
    // the label, so "remote, globally distributed team" and "Remote, Global Culture" do not count.
    // B2 rule 1: a space alone also separates the label ("100% Remote Worldwide").
    re: /\b(?:remot[eo]\s*(?:[([\-–—,|/:]\s*)+|remot[eo]\s+|(?:location|locations|based|region|ubicaci[oó]n)\s*[:(]\s*(?:100%\s+)?(?:remot[eo]\s*[-–—,(/|:]?\s*)?)(?:100%\s+)?(?:worldwide|global|anywhere|world ?wide|international|work from anywhere)\b(?=\s*(?:$|[)\].;,|/\-–—]))/gi,
    strength: "implied",
  },
  {
    re: /\b(?:available|open|hiring)\s+(?:remotely\s+)?in\s+(?:any|every|all)\s+time\s?zones?\b|\bremote roles? (?:open )?in every time ?zone\b/gi,
    strength: "implied",
  },
  {
    re: /\b(?:work|working)\s+(?:remotely\s+)?from\s+anywhere\b|\bremote from anywhere\b|\bwork[- ]from[- ]anywhere\b/gi,
    strength: "weak",
  },
];

/** Benefit words: remote-work wording next to them usually describes a perk. */
const BENEFIT_RE =
  /\b(?:time off|PTO|benefits?|stipend|leave|holidays?|insurance|equity|allowance|budget|perks?|coworking|co-working)\b/i;

/** Time-limited perks ("work from anywhere up to 30 days a year"): never a residence rule. */
const PERK_RE =
  /\b(?:up to|for)\s+\d+\s*(?:days|weeks|months)\b|\b\d+\s*(?:days|weeks)\s+(?:a|per|each)\s+year\b|\bworkation\b|\balmost anywhere\b|\bwithin the country of employment\b/i;

const PROVIDERS = [
  "Deel",
  "Remote.com",
  "Oyster HR",
  "OysterHR",
  "Oyster",
  "Rippling",
  "Papaya Global",
  "Multiplier",
  "Velocity Global",
  "Globalization Partners",
  "Omnipresent",
  "Remofirst",
  "RemoFirst",
];
const PROVIDER_ALT = PROVIDERS.map((p) => p.replace(/\./g, "\\.")).join("|");

const ENGAGEMENT_PATTERNS: ReadonlyArray<{
  re: RegExp;
  mode: EngagementMode;
  ways: readonly WayOfWorking[];
  strength: SignalStrength;
}> = [
  {
    re: /\bB2B\s+(?:contract|agreement|basis|cooperation|collaboration|terms|model|form|engagement|role|position|arrangement|invoic\w*|only|or\s+(?:UoP|employment|permanent))\b|\b(?:on|via|through|under|as|in)\s+(?:a\s+)?B2B\b(?!\s+(?:SaaS|company|companies|customers|clients|solutions?|products?|software|platform|payments|commerce|marketing|sales|space|market|startup|fintech|integrations?))|\(B2B\)|\b(?:[Cc]ontract(?:\s+type)?|[Ee]ngagement|[Ee]mployment(?:\s+type)?|[Ff]orm of (?:employment|cooperation)|[Tt]ype of (?:contract|employment|cooperation)|[Aa]greement)\s*[:\-–]\s*[^.\n]{0,30}\bB2B\b|\b(?:full\s+)?remote B2B\b|\bB2B\s*[,/]\s*(?:UoP|employment contract|permanent|CoE)\b/g,
    mode: "b2b",
    ways: ["b2b-contractor"],
    strength: "explicit",
  },
  {
    re: /\b(?:independent contractors?|contractor (?:role|position|basis|agreement|engagement|relationship|opportunity)|(?:as|hired as|engaged as|work as|join as|joining as)\s+(?:an?\s+)?(?:independent\s+|full[- ]time\s+|remote\s+)?contractor|contract(?:or)? position|on a (?:contract|contractor) basis|1099 (?:contract|contractor|position|role|basis)|freelance\s*\(\s*contractor\s*\))\b/gi,
    mode: "contractor",
    ways: ["b2b-contractor"],
    strength: "explicit",
  },
  {
    re: /\b(?:freelance(?:r|rs)?\s+(?:basis|contract|role|position|engagement|opportunity|project)|on a freelance basis|(?:tipo de contrato|modalidad de contrataci[oó]n|contrataci[oó]n)\s*:\s*freelance)\b/gi,
    mode: "freelance",
    ways: ["freelance"],
    strength: "explicit",
  },
  {
    re: /\b(?:[Ee]mployer [Oo]f [Rr]ecord|EOR)\b/g,
    mode: "eor",
    ways: ["eor-employee"],
    strength: "implied",
  },
  {
    re: new RegExp(
      String.raw`\b(?:via|through|using|with|on|by)\s+(${PROVIDER_ALT})\b|\b(${PROVIDER_ALT})\s+(?:contract|contractor|EOR|platform|agreement)\b`,
      "g",
    ),
    mode: "contractor-platform",
    ways: ["b2b-contractor", "eor-employee"],
    strength: "implied",
  },
  {
    re: /\bnot\s+(?:a\s+)?(?:contract(?:or)?|freelance|B2B|consulting)\s+(?:role|position|opportunity|engagement|job)\b|\b(?:do not|don't|cannot|can't|are unable to|will not|won't)\s+(?:work with|hire|engage|accept|consider)\s+(?:independent\s+)?(?:contractors|freelancers|B2B)\b(?!\s+(?:in|from|located|based|who|that|for))|\bno\s+(?:contractors|freelancers|C2C|corp[- ]to[- ]corp)\b|\b(?:employees only|W-?2 only|W-?2 employees? only)\b|\b(?:(?:an?\s+)?employment contract|permanent employment|full[- ]time employment)\s+only\b|\bonly\s+(?:an?\s+)?(?:employment contract|permanent employment|UoP)\b/gi,
    mode: "employee-only",
    ways: ["b2b-contractor", "freelance"],
    strength: "explicit",
  },
  {
    re: /\b(?:not|unable to|cannot|can't|won't|will not|do not|don't|does not|doesn't|are not able to|is not able to|not able to)\s+(?:currently\s+)?(?:be\s+able\s+to\s+)?(?:offer(?:ing)?\s+|provid(?:e|ing)\s+|support(?:ing)?\s+|consider(?:ing)?\s+)?(?:(?:an?|any)\s+)?(?:(?:visa|immigration|employment visa|work visa|work permit|H-?1B)\s+)?(?:relocation,\s+)?sponsor(?:ship|ing)?\b|\bwithout\s+(?:the\s+need\s+for\s+|requiring\s+)?(?:current\s+or\s+future\s+|now\s+or\s+in\s+the\s+future\s+)?(?:visa\s+|employer\s+|immigration\s+|employment\s+)?sponsorship\b|\bsponsorship\s+(?:is|will)\s+not\s+(?:be\s+)?(?:available|provided|offered|possible)\b|\bno\s+(?:visa\s+)?sponsorship\b/gi,
    mode: "no-visa-sponsorship",
    ways: ["relocation-visa"],
    strength: "explicit",
  },
  {
    re: /\b(?:visa|immigration|work permit)\s+sponsorship\s+(?:is\s+)?(?:available|provided|offered|possible)\b|\bwe\s+(?:can\s+|will\s+|do\s+)?(?:offer|provide|sponsor|support)\s+(?:full\s+)?(?:visa|work permit|work visa)\b|\bsponsor(?:ing)?\s+(?:your\s+|a\s+|the\s+)?(?:work\s+)?visa\b|\bH-?1B transfers?\b|\bwork visa with full support\b|\brelocation (?:support|assistance|package|bonus)\b/gi,
    mode: "visa-sponsorship",
    ways: ["relocation-visa"],
    strength: "implied",
  },
];

const WORK_AUTH_RE =
  /\b(?:(?:(?:legally|currently|independently|already|lawfully)\s+)*(?:authori[sz]ed|eligible|eligibility|permitted|entitled|legally able|legally allowed)|(?:have|has|hold|possess)\s+(?:the\s+)?(?:legal\s+|full\s+|valid\s+|unrestricted\s+)?right)\s+to\s+(?:live\s+and\s+)?work\s+(?:(?:full[- ]time|permanently|legally|lawfully|remotely)\s+)?(?:in|within|for)\s+|\b(?:work(?:ing)?\s+(?:authori[sz]ation|permit|visa|eligibility|rights?)|right to work|eligib(?:le|ility)\s+(?:for|to)\s+(?:employment|be employed))\s+(?:(?:is\s+)?(?:required\s+)?(?:in|for|within)\s+)/gi;
const WORK_AUTH_ANCHOR_RE =
  /^(?:the\s+)?(?:posting location|job location|location of (?:the|this) (?:role|position|job)|country of employment|(?:country|location) (?:in which|where) (?:the|this) (?:role|position|job)|(?:role's|position's) location|hiring country)/i;
const WORK_AUTH_SELF_RE =
  /^(?:the\s+)?(?:country|location)\s+(?:in which|where)\s+you\s+(?:reside|live|are based|are located)|^your\s+(?:country|location)/i;

// ---- Helpers -------------------------------------------------------------------------------

/** Scopes plus the countries that were only guessed; `emit` moves them to `guessedCountries`. */
type GuessedScopes = SignalScopes & { guessed?: readonly CountryCode[] };

function scopesOf(
  list: Pick<PlaceList, "countries" | "regions"> & { guessed?: readonly CountryCode[] },
): GuessedScopes {
  return { countries: [...list.countries], regions: [...list.regions], guessed: list.guessed };
}

function mentionScopes(mention: PlaceMention): GuessedScopes {
  const ref = mention.ref;
  return {
    countries: ref.type === "country" ? [ref.country] : [],
    regions: ref.type === "region" ? [ref.region] : [],
    guessed: ref.type === "country" && ref.guessed ? [ref.country] : [],
  };
}

function emit(
  ctx: Context,
  sentence: Sentence,
  kind: SignalKind,
  scopes: GuessedScopes,
  strength: SignalStrength,
  extra: Partial<EligibilitySignal> = {},
): void {
  const guessed = (scopes.guessed ?? []).filter((c) => scopes.countries.includes(c));
  const placeKind = kind !== "engagement" && kind !== "worldwide";
  ctx.signals.push({
    source: ctx.source,
    kind,
    scopes: { countries: scopes.countries, regions: scopes.regions },
    ...(guessed.length > 0 ? { guessedCountries: guessed } : {}),
    waysOfWorking: placeKind && ctx.ways ? ctx.ways : [],
    strength,
    evidence: {
      field: ctx.field,
      text: sentence.text.length > 400 ? `${sentence.text.slice(0, 397)}...` : sentence.text,
      start: sentence.start,
      end: sentence.end,
    },
    ...extra,
  });
}

/**
 * Negation near a trigger: the clause before it, after its last comma, at most 60 characters.
 * B4: only within the trigger's own clause ("We don't offer relocation and you must be based in
 * the US" keeps the rule; see `negationScopeBefore`).
 */
function negatedBefore(text: string, index: number): boolean {
  const clause = negationScopeBefore(text, index);
  const afterComma = clause.slice(clause.lastIndexOf(",") + 1);
  return NEGATION_RE.test(afterComma.slice(-60));
}

/**
 * B4: past tense only cancels a place rule it governs: in the clause before the trigger or right
 * after the list, outside parentheses ("Must be located in the US (this role was previously open
 * worldwide)" is a current rule; "In the past we could hire in Ukraine" is not).
 */
function pastGoverns(text: string, start: number, end: number): boolean {
  const before = clauseBefore(text, start).replace(/\([^)]*\)/g, " ");
  const afterRaw = text.slice(end);
  const cut = afterRaw.search(/[(;.]|\bbut\b/);
  const after = cut >= 0 ? afterRaw.slice(0, cut) : afterRaw;
  return PAST_RE.test(`${before} ${after}`);
}

/**
 * B4: the clause around a match, for preference words: "Must be based in the US; AWS experience is
 * a plus" is not a preference about the place.
 */
function clauseAround(text: string, start: number, end: number): string {
  const from = Math.max(text.lastIndexOf(";", start), 0);
  const next = text.indexOf(";", end);
  return text.slice(from, next >= 0 ? next : text.length);
}

function weaken(strength: SignalStrength, sentence: string): SignalStrength {
  if (PREFERENCE_RE.test(sentence) || ENTITY_QUALIFIER_RE.test(sentence)) return "weak";
  // Company-wide hedges copied into every posting ("the majority of our roles can be located...").
  if (
    /\b(?:majority of|most of|most) (?:our )?(?:roles|positions|jobs)\b|\b(?:typically|usually|generally)\b/i.test(
      sentence,
    )
  ) {
    return "weak";
  }
  return strength;
}

const STRENGTH_ORDER: readonly SignalStrength[] = ["weak", "implied", "explicit"];

function lowerTo(strength: SignalStrength, cap: SignalStrength): SignalStrength {
  return STRENGTH_ORDER.indexOf(strength) > STRENGTH_ORDER.indexOf(cap) ? cap : strength;
}

function cleanEnd(text: string, list: PlaceList): boolean {
  return CLEAN_END_RE.test(text.slice(list.end));
}

function noteAmbiguous(ctx: Context, list: PlaceList): void {
  for (const name of list.ambiguous) ctx.notes.push(`ambiguous-place:${name}`);
}

// ---- Sentence rules ------------------------------------------------------------------------

/** B4: ways a place rule about working on site applies to: relocation with a visa is the way in. */
const ONSITE_WAYS: readonly WayOfWorking[] = WAYS_OF_WORKING.filter((w) => w !== "relocation-visa");

const OFFICE_WORD_RE =
  /^\s*(?:-\s*based\s+)?(?:office|offices|HQ|headquarters|hub|studio|campus|site|location|premises)\b/i;

/** B4: "must relocate to Lisbon", "relocation to Berlin is required", "ready to relocate to Poland". */
const RELOCATE_TO_RE = /\b(?:relocat(?:e|ing|ion)|move|moving)\s+to\s+(?:(?:our|the)\s+)?/gi;
const RELOCATION_NEEDED_RE =
  /\b(?:must|required|requires?|requirement|need(?:s|ed)? to|will need to|have to|has to|willing to|ready to|able to|prepared to|expected to|mandatory|is a must)\b/i;

/**
 * B4: relocation a role requires, as an engagement `relocation-required` scoped to the target
 * place. Returns the offset where the relocation phrase starts, so places before it (the
 * candidate's origin: "candidates located in Ukraine who are ready to relocate to Poland") are not
 * read as the job's allow-list. Null when the sentence requires no relocation.
 */
function relocationRules(
  ctx: Context,
  sentence: Sentence,
  mentions: readonly PlaceMention[],
): number | null {
  const text = sentence.text;
  for (const match of text.matchAll(RELOCATE_TO_RE)) {
    if (
      /^mov/i.test(match[0]) &&
      !/\b(?:must|required|need to|will need to|have to)\b/i.test(text)
    ) {
      continue;
    }
    const from = match.index + match[0].length;
    const list = parsePlaceList(text, mentions, from);
    if (list.mentions.length === 0 || list.timezone) continue;
    if (!cleanEnd(text, list) && !list.only) continue;
    if (!RELOCATION_NEEDED_RE.test(text)) continue;
    if (
      isConditional(clauseBefore(text, match.index)) ||
      pastGoverns(text, match.index, list.end)
    ) {
      continue;
    }
    if (negatedBefore(text, match.index)) {
      ctx.notes.push("negated-relocation");
      continue;
    }
    noteAmbiguous(ctx, list);
    const strength = /\b(?:must|required|requires?|mandatory|need(?:s)? to|have to|has to)\b/i.test(
      text,
    )
      ? "explicit"
      : "implied";
    emit(
      ctx,
      sentence,
      "engagement",
      scopesOf(list),
      weaken(strength, clauseAround(text, match.index, list.end)),
      {
        waysOfWorking: [],
        engagement: { mode: "relocation-required" },
      },
    );
    return match.index;
  }
  return null;
}

function placeRules(ctx: Context, sentence: Sentence, mentions: readonly PlaceMention[]): void {
  const text = sentence.text;
  const consumed: Array<[number, number]> = [];
  const overlaps = (start: number, end: number) => consumed.some(([s, e]) => start < e && end > s);
  const eligibilityContext = ELIGIBILITY_CONTEXT_RE.test(text);
  // B4: places before a required relocation (or before an office, in a sentence about relocation)
  // are where candidates come from, not where the job is.
  let originBefore = relocationRules(ctx, sentence, mentions);
  if (originBefore === null && /relocat/i.test(text)) {
    for (const match of text.matchAll(OFFICE_LEAD_RE)) {
      const list = parsePlaceList(text, mentions, match.index + match[0].length);
      if (list.mentions.length > 0 && OFFICE_WORD_RE.test(text.slice(list.end))) {
        originBefore = match.index;
        break;
      }
    }
  }
  const origin = (start: number, end: number): boolean => {
    if (originBefore === null || end > originBefore) return false;
    ctx.accounted.push([sentence.start + start, sentence.start + end]);
    return true;
  };

  // Exclusions first, so "not open to candidates in X" is never read as an allow-list.
  for (const re of EXCLUDE_TRIGGERS) {
    for (const match of text.matchAll(re)) {
      const from = match.index + match[0].length;
      const list = parsePlaceList(text, mentions, from);
      if (list.mentions.length === 0 || list.timezone || !cleanEnd(text, list)) continue;
      if (!eligibilityContext && !/:\s*$/.test(match[0])) continue;
      if (pastGoverns(text, match.index, list.end)) continue;
      if (isConditional(clauseBefore(text, match.index))) continue;
      consumed.push([match.index, list.end]);
      noteAmbiguous(ctx, list);
      emit(
        ctx,
        sentence,
        "exclude",
        scopesOf(list),
        weaken("explicit", clauseAround(text, match.index, list.end)),
      );
    }
  }

  // B4: a list that opens the sentence and is declared unsupported ("Ukraine, Moldova: not supported").
  const lead = mentions[0];
  if (lead && /^[\s*•·▪◦-]*$/.test(text.slice(0, lead.start))) {
    const list = parsePlaceList(text, mentions, lead.start);
    if (
      list.mentions.length > 0 &&
      !overlaps(lead.start, list.end) &&
      /^\s*[:\-–]\s*(?:(?:is|are)\s+)?not\s+(?:supported|eligible|available|possible|accepted|allowed)\b/i.test(
        text.slice(list.end),
      )
    ) {
      consumed.push([lead.start, list.end]);
      noteAmbiguous(ctx, list);
      emit(ctx, sentence, "exclude", scopesOf(list), "explicit");
    }
  }

  // B4: "Our 40-person team works remotely from Ukraine": the company, not the hire.
  const companySubject = (index: number) =>
    /\b(?:our|the company's|their)\s+(?:[\w-]+\s+){0,3}(?:team|teams|engineers|developers|employees|people|colleagues|staff|members|founders|designers)\b/i.test(
      clauseBefore(text, index),
    );

  for (const trigger of ALLOW_TRIGGERS) {
    for (const match of text.matchAll(trigger.re)) {
      const from = match.index + match[0].length;
      if (overlaps(match.index, from)) continue;
      const list = parsePlaceList(text, mentions, from);
      if (list.countries.length === 0 && list.regions.length === 0 && list.ambiguous.length === 0) {
        continue;
      }
      if (list.timezone) continue;
      const tail = text.slice(list.end);
      if (trigger.office && !OFFICE_WORD_RE.test(tail)) continue;
      if (
        trigger.excludeOnly &&
        !NEGATIVE_TAIL_RE.test(tail) &&
        !(trigger.positiveTail && POSITIVE_ONLY_TAIL_RE.test(tail))
      ) {
        continue;
      }
      if (trigger.dutyGuard && (DUTY_RE.test(text) || companySubject(match.index))) continue;
      if (pastGoverns(text, match.index, list.end)) {
        ctx.notes.push("past-tense-place-rule");
        continue;
      }
      if (trigger.suffix) {
        const last = list.mentions[list.mentions.length - 1];
        if (!last || !trigger.suffix.test(text.slice(last.end))) continue;
      } else if (!cleanEnd(text, list) && !list.only && !trigger.office) continue;
      if (overlaps(from, list.end)) continue;
      const clause = clauseBefore(text, match.index);
      if (!trigger.conditionalOk && isConditional(clause)) continue;
      if (trigger.roleContext && (!ROLE_CONTEXT_RE.test(text) || isDescriptive(text))) continue;
      consumed.push([match.index, list.end]);
      if (origin(from, list.end)) continue;
      // "(Remote - US)" in a label or title only means a restriction when the job is remote.
      if (trigger.label) {
        const remoteLabel = /remot[eo]/i.test(match[0]) || ctx.workplaceType === "remote";
        if (!remoteLabel) {
          emit(ctx, sentence, "anchor", scopesOf(list), "implied", {
            anchor: { workplace: anchorWorkplace(ctx.workplaceType) },
          });
          noteAmbiguous(ctx, list);
          continue;
        }
      }
      if (
        !trigger.negationInTrigger &&
        (negatedBefore(text, match.index) || NEGATION_RE.test(match[0]))
      ) {
        ctx.notes.push("negated-place-rule");
        continue;
      }
      noteAmbiguous(ctx, list);
      if (NEGATIVE_TAIL_RE.test(tail)) {
        emit(ctx, sentence, "exclude", scopesOf(list), "explicit");
        continue;
      }
      let strength = trigger.strength;
      if (
        list.only ||
        /\bonly\b/i.test(match[0]) ||
        (trigger.positiveTail && POSITIVE_ONLY_TAIL_RE.test(tail))
      ) {
        strength = "explicit";
      }
      if (trigger.office) {
        // An office the role sits in: it binds remote ways, not relocation with a visa.
        if (/\b(?:must|required|requires?|mandatory|need to)\b/i.test(text)) strength = "explicit";
        const scope = clauseAround(text, match.index, list.end);
        emit(ctx, sentence, "allow-list", scopesOf(list), weaken(strength, scope), {
          waysOfWorking: ctx.ways ?? ONSITE_WAYS,
        });
        if (/relocat/i.test(text) && originBefore === null) originBefore = match.index;
        continue;
      }
      const scope = clauseAround(text, match.index, list.end);
      const finalStrength = list.entityIntro ? strength : weaken(strength, scope);
      emit(ctx, sentence, "allow-list", scopesOf(list), finalStrength);
    }
  }

  // "US only", "USA and Canada only", "(EU only)".
  for (let i = 0; i < mentions.length; i += 1) {
    const last = mentions[i];
    // B3 C2: "(US) only", "Europe (EU) only".
    if (!last || !/^\s*\)?\s*(?:[-–(]\s*)?only\b/i.test(text.slice(last.end))) continue;
    let first = i;
    while (first > 0) {
      const prev = mentions[first - 1];
      const cur = mentions[first];
      if (!prev || !cur) break;
      if (
        !/^[\s,/&()]*(?:and|or|&|,|\/)?[\s,/&()]*(?:the\s+)?$/i.test(
          text.slice(prev.end, cur.start),
        )
      )
        break;
      first -= 1;
    }
    const chainStart = mentions[first]?.start ?? last.start;
    if (overlaps(chainStart, last.end)) continue;
    const before = text.slice(Math.max(0, chainStart - 12), chainStart);
    if (/\bnot\s*$|\boutside(?: of)?\s+(?:the\s+)?$/i.test(before)) continue;
    const list = parsePlaceList(text, mentions, chainStart, last.end);
    if (list.mentions.length === 0 || isConditional(clauseBefore(text, chainStart))) continue;
    consumed.push([chainStart, last.end]);
    if (origin(chainStart, last.end)) continue;
    noteAmbiguous(ctx, list);
    emit(
      ctx,
      sentence,
      "allow-list",
      scopesOf(list),
      weaken("explicit", clauseAround(text, chainStart, last.end)),
    );
  }

  // "US-based candidates", "EU-based role", B4: "a US-based engineer", "US-remote position",
  // "(US Remote)", "only Indian candidates", "open to LATAM candidates", "US applicants".
  for (const mention of mentions) {
    if (overlaps(mention.start, mention.end)) continue;
    const after = text.slice(mention.end);
    const before = text.slice(Math.max(0, mention.start - 30), mention.start);
    // B3 C2: "must be US based", "this role is UK-based", a bare "EU-based" line.
    const requirementBased =
      /^\s*-?\s*based\b(?=\s*(?:$|[.;,)!]|only\b|role\b|position\b|to\b|and\b|for\b|with\b|or\b))/i.test(
        after,
      ) &&
      (/\b(?:must|should|need to|needs to|required to|has to|have to)\s+be\s*$|\b(?:role|position|job|opportunity)\s+is\s+(?:a\s+|an\s+)?(?:fully\s+|100%\s+)?(?:remote\s+)?$/i.test(
        before,
      ) ||
        text.slice(0, mention.start).trim() === "");
    const person =
      /^\s*-?\s*based\s+(?:candidates?|applicants?|individuals?|people|person|talent|professionals?|engineers?|developers?|contractors?|employees?|team members?|hires?|designers?|specialists?|freelancers?)\b/i.exec(
        after,
      );
    const roleNoun = /^\s*-?\s*based\s+(?:role|position|job|opportunity|remote|hire)\b/i.exec(
      after,
    );
    // "US-remote position", "(US Remote)", "US Remote" alone.
    const remoteSuffix =
      /^\s*(?:-\s*|\s)remote\b(?=\s*(?:role|position|job|opportunity|contract|only|[.;,)!|]|$))/i.exec(
        after,
      );
    // Place before a person noun, led by a selecting verb.
    const selected =
      /^\s+(?:candidates?|applicants?|residents?|citizens?|talent|professionals|engineers?|developers?|individuals|people|nationals)\b/i.exec(
        after,
      ) &&
      /\b(?:only|consider(?:ing)?|focused on|focusing on|open to|welcome|welcoming|accept(?:ing)?|seeking|prioriti[sz]ing)\s+(?:(?:the|a|an)\s+)?$/i.test(
        before,
      );
    const m = requirementBased
      ? /^\s*-?\s*based\b/i.exec(after)
      : (person ?? roleNoun ?? remoteSuffix ?? (selected ? /^/.exec(after) : null));
    if (!m) continue;
    if (
      !requirementBased &&
      !person &&
      !selected &&
      !(remoteSuffix && !roleNoun) &&
      /\b(?:company|startup|business|firm|organi[sz]ation|team|a|an)\s*$/i.test(before)
    ) {
      continue;
    }
    // Colleagues, not the hire: "our Kyiv-based engineers", "work alongside Ukraine-based developers".
    if (
      person &&
      /\b(?:our|their|the company's|alongside|with|among|join(?:ing)?|of)\s+(?:[\w-]+\s+){0,2}$/i.test(
        before,
      )
    ) {
      continue;
    }
    if (isConditional(clauseBefore(text, mention.start))) continue;
    if (mention.ref.type === "ambiguous") {
      ctx.notes.push(`ambiguous-place:${mention.text}`);
      continue;
    }
    consumed.push([mention.start, mention.end + m[0].length]);
    if (origin(mention.start, mention.end)) continue;
    if (
      NEGATIVE_TAIL_RE.test(
        text
          .slice(mention.end + m[0].length)
          .replace(/^\s*(?:candidates|applicants|residents|citizens|people|talent)\b/i, ""),
      )
    ) {
      emit(ctx, sentence, "exclude", mentionScopes(mention), "explicit");
      continue;
    }
    if (negatedBefore(text, mention.start)) {
      ctx.notes.push("negated-place-rule");
      continue;
    }
    const strength = /\bonly\b|\bmust\b/i.test(text) || requirementBased ? "explicit" : "implied";
    emit(
      ctx,
      sentence,
      "allow-list",
      mentionScopes(mention),
      weaken(strength, clauseAround(text, mention.start, mention.end)),
    );
  }

  residentAndPaperworkRules(ctx, sentence, mentions, overlaps, consumed);

  // "candidates outside the US are welcome" vs "we cannot hire outside the US": both exist.
  if (OUTSIDE_CONTRACTORS_RE.test(text) && OUTSIDE_CONTRACTORS_TAIL_RE.test(text)) return;
  for (const m of text.matchAll(/\boutside(?: of)?\s+(?:the\s+)?/gi)) {
    const from = m.index + m[0].length;
    if (mentions.some((mention) => mention.start === from) && eligibilityContext) {
      ctx.notes.push("outside-phrase");
    }
  }
}

/**
 * B3 C2: "(open to) US residents only", "open to EU citizens and residents", "a valid UK work
 * visa", "a US address and bank account", "W-9 required", "employed via our Philippine entity".
 */
function residentAndPaperworkRules(
  ctx: Context,
  sentence: Sentence,
  mentions: readonly PlaceMention[],
  overlaps: (start: number, end: number) => boolean,
  consumed: Array<[number, number]>,
): void {
  const text = sentence.text;
  if (isConditional(text.replace(/\bonly apply if\b/gi, ""))) return;
  const requirement =
    /\b(?:must|required|requires?|need|needs|only|hold|holding|valid|mandatory)\b/i;
  for (let i = 0; i < mentions.length; i += 1) {
    const mention = mentions[i] as PlaceMention;
    if (overlaps(mention.start, mention.end) || mention.ref.type === "ambiguous") continue;
    if (pastGoverns(text, mention.start, mention.end)) continue;
    const after = text.slice(mention.end);
    const before = text.slice(0, mention.start);
    const residents =
      /^\s*(?:residents?|citizens|nationals)(?:\s+(?:and|or|&)\s+(?:(?:permanent\s+)?residents|citizens|nationals))?\b\s*(only\b)?/i.exec(
        after,
      );
    if (residents) {
      // B4: "Georgian citizens are excluded", "Residents of ... are not eligible".
      if (NEGATIVE_TAIL_RE.test(after.slice(residents[0].length))) {
        consumed.push([mention.start, mention.end + residents[0].length]);
        emit(ctx, sentence, "exclude", mentionScopes(mention), "explicit");
        continue;
      }
      const opened =
        /\b(?:open|available|restricted|limited)\s+(?:only\s+)?to\s+(?:only\s+)?(?:the\s+)?$/i.test(
          before,
        );
      const only = Boolean(residents[1]) || /\bonly\b/i.test(text);
      const alone = before.trim() === "";
      if ((opened || only || alone) && !negatedBefore(text, mention.start)) {
        consumed.push([mention.start, mention.end + residents[0].length]);
        emit(ctx, sentence, "allow-list", mentionScopes(mention), only ? "explicit" : "implied");
      }
      continue;
    }
    if (
      /^\s*(?:work\s+(?:visa|permit|authori[sz]ation)|right to work|residence\s+(?:card|permit)|residency\s+permit|permanent residen\w*)\b/i.test(
        after,
      ) &&
      requirement.test(text) &&
      !negatedBefore(text, mention.start)
    ) {
      emit(ctx, sentence, "work-authorization", mentionScopes(mention), "explicit");
      continue;
    }
    if (
      /^\s*(?:(?:mailing|home|residential|physical)\s+)?(?:address|bank account|social security number|SSN|tax ID|taxpayer)\b/i.test(
        after,
      ) &&
      requirement.test(text)
    ) {
      emit(ctx, sentence, "allow-list", mentionScopes(mention), "implied");
    }
  }
  if (PAST_RE.test(text)) return;
  // US tax forms and Social Security numbers only apply to US persons.
  if (
    PRODUCT_OR_DUTY_RE.test(text) ||
    /\b(?:build|builds|building|features?|products?|platform|software|compliance|onboarding flows?)\b/i.test(
      text,
    )
  ) {
    // "Build features for 1099 contractor onboarding": the product, not this hire's paperwork.
  } else if (
    /\bW-?9\b/.test(text) ||
    /\b1099\b/.test(text) ||
    (/\bSocial Security (?:Number|No)|\bSSN\b/i.test(text) && requirement.test(text))
  ) {
    emit(ctx, sentence, "allow-list", { countries: ["US"], regions: [] }, "implied");
  }
  // B4b: employment wording ("employed via our Moldovan entity", "employment contract with our UK
  // entity", "on our Polish payroll") is an allow-list for EOR employees only, and says the role is
  // employment, not B2B. "Engaged/contracted/paid via our <place> entity" stays for every way.
  const PLACE = String.raw`([A-Z][\p{L}.]+(?:\s[A-Z][\p{L}.]+)?)`;
  const employment = new RegExp(
    String.raw`\b(?:employed|hired)\s+(?:via|through|by|under)\s+(?:our|the|a)\s+${PLACE}\s+(?:entity|subsidiary|legal entity|branch|company|payroll)\b|\bemployment\s+(?:contract|agreement)\s+(?:with|through|via)\s+(?:our|the|a)\s+${PLACE}\s+(?:entity|subsidiary|legal entity|branch|company)\b|\b(?:on|via|through)\s+(?:our|the)\s+${PLACE}\s+payroll\b`,
    "u",
  ).exec(text);
  const entity =
    employment ??
    /\b(?:engaged|contracted|paid)\s+(?:via|through|by|under)\s+(?:our|the|a)\s+([A-Z][\p{L}.]+(?:\s[A-Z][\p{L}.]+)?)\s+(?:entity|subsidiary|legal entity|branch|company)\b/u.exec(
      text,
    );
  const placeName = entity?.slice(1).find((g) => g !== undefined);
  if (entity && placeName) {
    const start = entity.index + entity[0].indexOf(placeName);
    const named = mentions.find((m) => m.start === start);
    const demonym = DEMONYMS.get(placeName);
    const scopes =
      named && named.ref.type !== "ambiguous"
        ? mentionScopes(named)
        : demonym
          ? { countries: [demonym], regions: [] }
          : null;
    if (scopes) {
      emit(
        ctx,
        sentence,
        "allow-list",
        scopes,
        "implied",
        employment ? { waysOfWorking: ["eor-employee"] } : {},
      );
      if (employment) {
        // Implied, so B2B is at most white (never the explicit employee-only red).
        emit(ctx, sentence, "engagement", { countries: [], regions: [] }, "implied", {
          waysOfWorking: ["b2b-contractor", "freelance"],
          engagement: { mode: "employee-only" },
        });
      }
    }
  }
}

function anchorWorkplace(workplaceType: string | null) {
  return workplaceType === "remote" || workplaceType === "hybrid" || workplaceType === "onsite"
    ? workplaceType
    : "unspecified";
}

function workAuthorizationRules(
  ctx: Context,
  sentence: Sentence,
  mentions: readonly PlaceMention[],
): void {
  const text = sentence.text;
  // B4: "we'll verify your eligibility to work in the U.S. (E-Verify, Form I-9)" describes a process
  // for US hires, not a requirement of this role.
  if (/\bverif(?:y|ies|ication)\b|\bE-Verify\b|\bForm I-9\b/i.test(text)) return;
  for (const match of text.matchAll(WORK_AUTH_RE)) {
    const from = match.index + match[0].length;
    const tail = text.slice(from).replace(/^one of the following countries:?\s*/i, "");
    if (WORK_AUTH_SELF_RE.test(tail)) continue;
    const clause = clauseBefore(text, match.index);
    if (isConditional(clause)) continue;
    if (negatedBefore(text, match.index)) {
      ctx.notes.push("negated-work-authorization");
      continue;
    }
    if (WORK_AUTH_ANCHOR_RE.test(tail)) {
      emit(
        ctx,
        sentence,
        "work-authorization",
        { countries: [], regions: [] },
        weaken("explicit", text),
      );
      continue;
    }
    const list = parsePlaceList(text, mentions, from);
    if (list.mentions.length === 0 || list.timezone || !cleanEnd(text, list)) continue;
    noteAmbiguous(ctx, list);
    emit(ctx, sentence, "work-authorization", scopesOf(list), weaken("explicit", text));
  }
}

/**
 * B3 C3: the hiring phrase is the object of a product or of the candidate's duties ("help companies
 * hire contractors in any country", "manage a team of independent contractors").
 */
const PRODUCT_OR_DUTY_RE =
  /\b(?:help(?:s|ing)?|enabl(?:e|es|ing)|allow(?:s|ing)?|let(?:s|ting)?|empower(?:s|ing)?|so that)\s+(?:(?:our\s+|their\s+)?(?:companies|businesses|customers|clients|teams|employers|organi[sz]ations|users|brands|startups|enterprises|HR teams|them)\b)|\b(?:manag(?:e|es|ing)|overse(?:e|es|eing)|coordinat(?:e|es|ing)|lead(?:s|ing)?|supervis(?:e|es|ing)|onboard(?:s|ing)?|pay(?:s|ing)?|source|sourcing|vet(?:ting)?|work(?:ing)? with)\s+(?:a\s+(?:team|network|pool|group)\s+of\s+|our\s+|external\s+|your\s+)?(?:independent\s+)?(?:contractors|freelancers|vendors)\b|\b(?:platform|product|products|software|solution|tool|tools|app)\b[^.]{0,60}\b(?:hire|hiring|pay|payroll|employ|onboard)\b|\b(?:this|our)\s+(?:notice|policy|privacy)\b|\bapplies to\b/i;

/**
 * B4: wording that says how this role's hire is engaged ("you'll be engaged as", "this is a
 * contract role", "contract type: B2B", "we hire ... as contractors / through an EOR", "all hires
 * are contractors"). Only these make an engagement explicit.
 */
const ROLE_ENGAGEMENT_RE =
  /\b(?:this (?:is an?\b[^.;]{0,40}\b)?(?:role|position|job|opportunity|engagement|contract)\b|the (?:role|position|job) is\b|you(?:['’]ll| will)?\s+(?:be\s+)?(?:engaged|hired|contracted|employed|paid|working|work|join(?:ing)?)\s+(?:as|via|through|on|under)\b|(?:we|the company)\s+(?:only\s+|currently\s+|exclusively\s+)*(?:hire|hires|engage|engages|employ|employs|contract|work with|onboard|pay)\b[^.;]{0,60}\b(?:as|via|through|on|under|using|with)\b|(?:hired|engaged|contracted|employed|paid|joining|join)\s+(?:as|via|through|on|under)\b|(?:all\s+)?(?:hires|team members|roles|positions|engineers|contractors|people)\s+(?:are|will be)\b|(?:contract|engagement|employment|cooperation|agreement)(?:\s+(?:type|form|model))?\s*[:\-–]|type of (?:contract|employment|cooperation)|form of (?:employment|cooperation)|B2B\s+(?:contract|only|basis)|on a (?:B2B|contract(?:or)?|freelance) basis|\((?:B2B|contract(?:or)?|freelance)\))/i;

/** B3 C3: wording clearly about this role's hire; otherwise worldwide and engagement are implied. */
const THIS_HIRE_RE =
  /\b(?:this (?:role|position|job|opportunity|engagement|contract)|the (?:role|position) is|we (?:hire|recruit|engage|contract)|we(?:'re| are|’re) hiring|you(?:'ll| will)? (?:be )?(?:engaged|hired|contracted|employed|joining|join)|(?:hired|engaged|contracted|join|joining) as|this is an?\b[^.;]{0,40}\b(?:role|position|job|opportunity|contract)|(?:all )?(?:hires|team members) (?:are|will be)|(?:contract|engagement|employment|cooperation)(?:\s+(?:type|form|model))?\s*:|type of (?:contract|employment|cooperation)|candidates|applicants|open to)\b/i;

/** B3 C4: negation after an EOR, platform or contractor mention ("EOR employment is not available"). */
const NEGATED_AFTER_RE =
  /^[^;.]{0,60}?\b(?:(?:is|are)\s+not\s+(?:available|possible|offered|supported|an option|used|allowed)|not (?:available|possible|offered|supported)|(?:we|they)\s+(?:don['’]t|do not|won['’]t|will not|cannot|can['’]t)|no longer)\b/i;

/** A question states nothing ("We use an EOR? No, we don't."). */
function isQuestion(text: string): boolean {
  return /\?\s*$/.test(text);
}

function worldwideRules(
  ctx: Context,
  sentence: Sentence,
  mentions: readonly PlaceMention[] = [],
): void {
  const text = sentence.text;
  if (PERK_RE.test(text)) return;
  if (isQuestion(text) || PRODUCT_OR_DUTY_RE.test(text)) return;
  const benefits = BENEFIT_RE.test(text);
  if (isDescriptive(text) && !/\b(?:hire|hiring|candidates?|applicants?|you)\b/i.test(text)) return;
  for (const { re, strength, inBenefits } of WORLDWIDE_PATTERNS) {
    if (benefits && !inBenefits) continue;
    for (const match of text.matchAll(re)) {
      const tail = text.slice(match.index + match[0].length);
      if (/^\s*(?:in|within|across|throughout|inside)\s+(?!the world\b|the globe\b)/i.test(tail))
        continue;
      if (strength === "weak" && isDescriptive(text)) continue;
      const clause = clauseBefore(text, match.index);
      if (isConditional(clause)) continue;
      if (negatedBefore(text, match.index)) {
        ctx.notes.push("negated-worldwide");
        continue;
      }
      const aboutThisHire = THIS_HIRE_RE.test(text) ? strength : lowerTo(strength, "implied");
      emit(ctx, sentence, "worldwide", { countries: [], regions: [] }, weaken(aboutThisHire, text));
      // "Work from anywhere in the world, as long as you are in the EU": a place in the same
      // sentence that is not an exception may narrow it.
      if (
        mentions.length > 0 &&
        !/\b(?:except|excluding|other than|with the exception of|but not)\b/i.test(text)
      ) {
        ctx.notes.push("worldwide-with-place");
      }
      return;
    }
  }
}

function citizenshipRules(
  ctx: Context,
  sentence: Sentence,
  mentions: readonly PlaceMention[],
): void {
  const text = sentence.text;
  const strengthFor = (): SignalStrength => {
    if (PREFERENCE_RE.test(text)) return "weak";
    if (/\bmay\b/i.test(text)) return "implied";
    return /\b(?:must|required|requires?|only|eligib|ability to obtain|obtain and maintain|to conform|mandatory)\b|\b(?:looking for|seeking|searching for)\b[^.;]{0,40}\bwith\s+[^.;]{0,30}\bcitizenship\b/i.test(
      text,
    )
      ? "explicit"
      : "implied";
  };
  const us: SignalScopes = { countries: ["US"], regions: [] };
  const found = (requirement: CitizenshipRequirement, scopes: SignalScopes) =>
    emit(ctx, sentence, "citizenship-or-clearance", scopes, strengthFor(), { requirement });

  // "If access to export-controlled technology is required, we may apply for a license": not a rule.
  if (
    /^\s*(?:if|when|where|should)\b/i.test(text) ||
    /\bmay (?:need to )?(?:apply|seek|obtain) (?:for )?(?:an? )?(?:U\.?S\.? )?(?:export )?licen[cs]e/i.test(
      text,
    )
  ) {
    return;
  }
  if (/\bITAR\b|International Traffic in Arms/.test(text)) found("export-control", us);
  else if (
    /\bExport Administration Regulations\b|\bexport[- ]control(?:led|s)?\b/i.test(text) &&
    /U\.?S\.? persons?|citizen|licen[cs]e|authori[sz]ation|lawful permanent/i.test(text)
  ) {
    found("export-control", us);
  }
  if (/\bU\.?S\.? persons?\b/.test(text)) found("us-person", us);

  for (const m of text.matchAll(
    /\b(?:citizen(?:s|ship)?|nationals?|nationality|passport holders?)\b/gi,
  )) {
    const before = text.slice(Math.max(0, m.index - 30), m.index);
    const demonym = /\b([A-Z][a-z]+)\s*$/.exec(before)?.[1];
    let scopes: SignalScopes | null = null;
    const near = mentions.filter((x) => x.end <= m.index && m.index - x.end <= 3);
    const lastNear = near[near.length - 1];
    if (lastNear && lastNear.ref.type === "country") {
      scopes = { countries: [lastNear.ref.country], regions: [] };
    } else if (lastNear && lastNear.ref.type === "region") {
      scopes = { countries: [], regions: [lastNear.ref.region] };
    } else if (demonym && DEMONYMS.has(demonym)) {
      scopes = { countries: [DEMONYMS.get(demonym) as CountryCode], regions: [] };
    } else {
      const of = /^\s*of\s+(?:the\s+)?/.exec(text.slice(m.index + m[0].length));
      const target = of
        ? mentions.find((x) => x.start === m.index + m[0].length + of[0].length)
        : undefined;
      if (target?.ref.type === "country") scopes = { countries: [target.ref.country], regions: [] };
    }
    if (!scopes) continue;
    const clause = clauseBefore(text, m.index);
    if (NEGATION_RE.test(clause) || isConditional(clause)) continue;
    // B4: "Ukrainian citizens are not eligible" excludes them (see the resident rules).
    if (NEGATIVE_TAIL_RE.test(text.slice(m.index + m[0].length))) continue;
    if (
      // B2 rule 7: "looking for someone with <place> citizenship" is a requirement too.
      !/\b(?:must|required|requires?|only|eligib|to be|be an?|hold|holding|possess|may)\b|\b(?:looking for|seeking|searching for)\s+(?:someone|a candidate|candidates|a person|people|an? [\w-]+(?: [\w-]+)?)\s+(?:who (?:has|holds)|with)\b/i.test(
        text,
      )
    )
      continue;
    found("citizenship", scopes);
    break;
  }

  // B2 rule 6: case-insensitive ("SECRET clearance", "TOP SECRET CLEARANCE").
  const clearance =
    /\b(?:TS\s*\/\/?\s*SCI|Top Secret|S\/\/SAR|Secret|SC|DV|NV1|NV2|Baseline|Public Trust|DoD|Government|Security|Federal)\b[^.;]{0,40}?\bclearance\b|\bclearance\s+(?:is\s+)?(?:required|eligib)/i.exec(
      text,
    );
  if (clearance) {
    let scopes: SignalScopes = { countries: [], regions: [] };
    if (/\b(?:NV1|NV2|Baseline|Australian)\b/.test(text))
      scopes = { countries: ["AU"], regions: [] };
    else if (/\b(?:SC|DV|UK|BPSS)\b/.test(clearance[0]) || /\bUK\b/.test(text)) {
      scopes = { countries: ["GB"], regions: [] };
    } else if (/\b(?:TS|SCI|Top Secret|DoD|Public Trust|U\.?S\.?|[Ff]ederal)\b/.test(text))
      scopes = us;
    found("clearance", scopes);
  }
}

/**
 * B2 rule 8: "For roles outside the U.S. and Canada, we work with ... independent contractors" is
 * contractor openness for places outside the listed ones. Emitted only without narrowing words
 * ("select countries"), as an implied engagement: it never makes a green without explicit
 * worldwide wording elsewhere, and the listed places themselves are not target countries' concern.
 */
const OUTSIDE_CONTRACTORS_RE =
  /^for\s+(?:roles|positions|candidates|applicants|hires|team members|people|talent)\s+(?:(?:based|located)\s+)?outside(?:\s+of)?\s+(?:the\s+)?/i;
const OUTSIDE_CONTRACTORS_TAIL_RE =
  /^\s*,?\s*we\s+(?:work with|engage|hire|use|partner with|contract with|bring on)\b[^.;]{0,80}?\b(?:independent\s+)?contractors?\b/i;
const NARROWING_RE =
  /\b(?:select(?:ed)?|certain|specific|some|limited|following|approved|supported|where we|in which we)\b/i;

function outsideContractorRule(
  ctx: Context,
  sentence: Sentence,
  mentions: readonly PlaceMention[],
): boolean {
  const text = sentence.text;
  const lead = OUTSIDE_CONTRACTORS_RE.exec(text);
  if (!lead) return false;
  const list = parsePlaceList(text, mentions, lead[0].length);
  if (list.mentions.length === 0 || list.ambiguous.length > 0) return false;
  const tail = OUTSIDE_CONTRACTORS_TAIL_RE.exec(text.slice(list.end));
  if (!tail || NARROWING_RE.test(text) || NEGATION_RE.test(tail[0])) return false;
  emit(ctx, sentence, "engagement", { countries: [], regions: [] }, weaken("implied", text), {
    waysOfWorking: ["b2b-contractor"],
    engagement: { mode: "contractor" },
  });
  return true;
}

function engagementRules(ctx: Context, sentence: Sentence): void {
  const text = sentence.text;
  if (isQuestion(text)) return;
  for (const pattern of ENGAGEMENT_PATTERNS) {
    for (const match of text.matchAll(pattern.re)) {
      const clause = clauseBefore(text, match.index);
      const negatable = pattern.mode !== "no-visa-sponsorship" && pattern.mode !== "employee-only";
      if (negatable && NEGATION_RE.test(clause.slice(-40))) continue;
      if (negatable && NEGATED_AFTER_RE.test(text.slice(match.index + match[0].length))) continue;
      if (negatable && pattern.mode !== "visa-sponsorship" && PRODUCT_OR_DUTY_RE.test(text))
        continue;
      if (isConditional(clause)) continue;
      if (
        (pattern.mode === "eor" || pattern.mode === "contractor-platform") &&
        isDescriptive(text)
      ) {
        continue;
      }
      if (
        /\b(?:federal|government|defen[cs]e|DoD)\s+contractor/i.test(text) &&
        pattern.mode === "contractor"
      ) {
        continue;
      }
      // "without sponsorship for an export license" is about export controls, not visas.
      if (pattern.mode === "no-visa-sponsorship" && /export licen[cs]e/i.test(text)) continue;
      let provider: string | undefined;
      if (pattern.mode === "contractor-platform") {
        provider = match[1] ?? match[2];
        // The provider posting its own jobs ("At Deel, we...") is not an engagement signal.
        const count = provider ? ctx.fullText.split(provider).length - 1 : 0;
        if (count >= 3) continue;
      }
      let strength = pattern.strength;
      // B4: engagement words in product, company or duty sentences ("the leading Employer of Record
      // platform", "our B2B model", "our marketplace connects clients with independent contractors")
      // say nothing about this hire: no signal. Role-scoped wording is explicit; other hiring wording
      // stays implied.
      if (negatable && pattern.mode !== "visa-sponsorship") {
        if (ROLE_ENGAGEMENT_RE.test(text)) {
          if (pattern.mode === "eor") strength = "explicit";
        } else if (THIS_HIRE_RE.test(text)) {
          strength = lowerTo(strength, "implied");
        } else {
          continue;
        }
      }
      if (pattern.mode === "visa-sponsorship" && /relocation/i.test(match[0])) strength = "weak";
      if (pattern.mode === "no-visa-sponsorship" && /\btransfers?\b/i.test(text)) strength = "weak";
      emit(ctx, sentence, "engagement", { countries: [], regions: [] }, weaken(strength, text), {
        waysOfWorking: pattern.ways,
        engagement: provider ? { mode: pattern.mode, provider } : { mode: pattern.mode },
      });
      break;
    }
  }
}

function timezoneRules(ctx: Context, sentence: Sentence, mentions: readonly PlaceMention[]): void {
  const text = sentence.text;
  if (isDescriptive(text) && !/\b(?:must|required|need to|able to|should)\b/i.test(text)) return;
  for (const hit of extractTimezoneHits(text, mentions)) {
    emit(
      ctx,
      sentence,
      "timezone",
      hit.constraint.places ?? { countries: [], regions: [] },
      hit.strength,
      {
        timezone: hit.constraint,
      },
    );
  }
}

/** Headings of requirement lists ("Requirements", "Qualifications", "What we're looking for"). */
const REQUIREMENTS_HEADING_RE =
  /^(?:(?:minimum|basic|required|preferred|key|job|role)\s+)?(?:requirements?|qualifications?|must[- ]haves?|what (?:you(?:'ll| will)? need|we(?:'re| are) looking for|you bring)|who you are|about you|your profile|you have|skills (?:and|&) experience)\s*:?$/i;

/** Short lines that are neither bullets nor sentences: section headings. */
function headingAt(text: string, offset: number): string | null {
  let end = text.lastIndexOf("\n", offset - 1);
  while (end > 0) {
    const start = text.lastIndexOf("\n", end - 1) + 1;
    const line = text.slice(start, end).trim();
    const isHeading =
      line.length >= 2 &&
      line.length <= 60 &&
      !/^[*•·▪◦-]/.test(line) &&
      !/[.,;]$/.test(line) &&
      line.split(/\s+/).length <= 7;
    if (isHeading) return line;
    end = start - 1;
  }
  return null;
}

/**
 * B2 rule 5: a bullet that is only a place requirement ("Located in European Union") under a
 * Requirements/Qualifications heading is an implied allow-list.
 */
function requirementBulletRules(
  ctx: Context,
  text: string,
  sentence: Sentence,
  mentions: readonly PlaceMention[],
): void {
  const lead =
    /^(?:(?:be|being|currently)\s+)?(?:based|located|living|residing|resident)\s+(?:in|within)\s+/i.exec(
      sentence.text,
    );
  if (!lead) return;
  const lineStart = text.lastIndexOf("\n", sentence.start - 1) + 1;
  if (!/^[\s*•·▪◦-]*$/.test(text.slice(lineStart, sentence.start))) return;
  const heading = headingAt(text, lineStart);
  if (!heading || !REQUIREMENTS_HEADING_RE.test(heading)) return;
  const list = parsePlaceList(sentence.text, mentions, lead[0].length);
  if (list.mentions.length === 0 || list.timezone) return;
  if (!/^\s*(?:only)?\s*[.;!]?\s*$/i.test(sentence.text.slice(list.end))) return;
  noteAmbiguous(ctx, list);
  emit(ctx, sentence, "allow-list", scopesOf(list), weaken("implied", sentence.text));
}

/**
 * B3 C2: restriction words in es/pt/de/fr/pl/uk/ru next to a place name: rules do not read those
 * languages, so the job goes to the LLM.
 */
const NON_ENGLISH_RESTRICTION_RE =
  /(?<![\p{L}])(?:solo|sólo|solamente|únicamente|unicamente|apenas|somente|exclusiv[ao]s?|exclusivamente|residentes?|nur|ausschließlich|Wohnsitz|wohnhaft|uniquement|seulement|résidents?|résidant|tylko|wyłącznie|mieszkańc\w*|тільки|лише|виключно|только|исключительно|резидент\w*|проживающ\w*)(?![\p{L}])/iu;

/** Words that mark a sentence as not English, for the `non-english` unaccounted cue. */
const NON_ENGLISH_TEXT_RE =
  /\p{Script=Cyrillic}|(?<![\p{L}])(?:para|desde|pa[ií]s|com|não|für|mit|und|nicht|pour|avec|dans|dla|oraz|nie|w Polsce)(?![\p{L}])/iu;

/** Place names and demonyms used as places ("Ukrainian residents"), in order. */
function sentenceMentions(text: string): PlaceMention[] {
  const places = findPlaceMentions(text);
  const demonyms = findDemonymMentions(text).filter(
    (d) => !places.some((p) => d.start < p.end && d.end > p.start),
  );
  return demonyms.length === 0
    ? places
    : [...places, ...demonyms].sort((a, b) => a.start - b.start);
}

/**
 * B4: "Contractors: US only; employees: anywhere via EOR": clauses labelled with a way of working
 * carry that way on their place signals.
 */
function wayClauses(
  sentence: Sentence,
): Array<{ sentence: Sentence; ways?: readonly WayOfWorking[] }> {
  if (!/\b(?:contractors?|freelancers?|employees?|B2B|EOR)\s*:/i.test(sentence.text)) {
    return [{ sentence }];
  }
  const out: Array<{ sentence: Sentence; ways?: readonly WayOfWorking[] }> = [];
  let offset = 0;
  for (const part of sentence.text.split(";")) {
    const lead = part.length - part.trimStart().length;
    const text = part.trim();
    const start = sentence.start + offset + lead;
    offset += part.length + 1;
    if (!text) continue;
    const label = /^(contractors?|freelancers?|B2B|employees?|EOR)\s*:/i
      .exec(text)?.[1]
      ?.toLowerCase();
    const ways: readonly WayOfWorking[] | undefined = !label
      ? undefined
      : /^(?:contractor|freelancer|b2b)/.test(label)
        ? ["b2b-contractor", "freelance"]
        : ["eor-employee"];
    out.push({ sentence: { text, start, end: start + text.length }, ways });
  }
  return out;
}

function extractFromText(ctx: Context, text: string): UnaccountedSentence[] {
  if (NON_ENGLISH_RESTRICTION_RE.test(text) && findPlaceMentions(text).length > 0) {
    ctx.notes.push("non-english-restriction-possible");
  }
  const unaccounted: UnaccountedSentence[] = [];
  for (const whole of splitSentences(text)) {
    // B4: boilerplate is skipped only when no clause restricts location (see `isPureBoilerplate`).
    // US paperwork in it (E-Verify, W-2, SSN) still means the post may be for US hires only.
    if (isPureBoilerplate(whole.text)) {
      const open = unaccountedFor(ctx.field, whole, ctx.signals, ctx.accounted);
      if (open?.cues.includes("us-paperwork")) unaccounted.push(open);
      continue;
    }
    for (const { sentence, ways } of wayClauses(whole)) {
      const clauseCtx: Context = ways ? { ...ctx, ways } : ctx;
      const mentions = sentenceMentions(sentence.text);
      requirementBulletRules(clauseCtx, text, sentence, mentions);
      outsideContractorRule(clauseCtx, sentence, mentions);
      placeRules(clauseCtx, sentence, mentions);
      workAuthorizationRules(clauseCtx, sentence, mentions);
      worldwideRules(clauseCtx, sentence, mentions);
      citizenshipRules(clauseCtx, sentence, mentions);
      engagementRules(clauseCtx, sentence);
      timezoneRules(clauseCtx, sentence, mentions);
    }
    const open = unaccountedFor(ctx.field, whole, ctx.signals, ctx.accounted);
    if (open) {
      const nonEnglish =
        NON_ENGLISH_RESTRICTION_RE.test(whole.text) || NON_ENGLISH_TEXT_RE.test(whole.text);
      unaccounted.push(nonEnglish ? { ...open, cues: [...open.cues, "non-english"] } : open);
    }
  }
  return unaccounted;
}

const TITLE_WORKPLACE_WORD_RE =
  /^(?:(?:fully|100%)\s+)?(?:remote|remoto|hybrid|on-?site|in[- ]office|based in|in)\s+|\s+(?:remote|only|based)$/i;

/**
 * Title segments that are only places: "Backend Engineer | EMEA | Remote", "Engineer, Remote US",
 * "Engineer - US", "Engineer LATAM". Weak unless the title says "only". B4: read on remote jobs and
 * when the job's workplace is unknown (a title place may then be the only location).
 */
function titleRules(ctx: Context, title: string): void {
  worldwideRules(ctx, { text: title, start: 0, end: title.length }, findPlaceMentions(title));
  const known = ["remote", "hybrid", "onsite"].includes(ctx.workplaceType ?? "");
  const remote = /\bremot[eo]\b/i.test(title) || ctx.workplaceType === "remote";
  if (!remote && known) return;
  const mentions = findPlaceMentions(title);
  const sentence: Sentence = { text: title, start: 0, end: title.length };
  const emitList = (list: PlaceList, text: string) => {
    noteAmbiguous(ctx, list);
    // Titles often name one of several posting locations ("SRE | Ireland | Remote"): weak unless
    // the title says "only".
    const only = list.only || /\bonly\b/i.test(text);
    emit(ctx, sentence, "allow-list", scopesOf(list), only ? "explicit" : "weak");
  };
  let emitted = false;
  for (const segment of title.matchAll(/[^|()[\]\-–—,/:]+/g)) {
    let raw = segment[0];
    let segmentStart = segment.index;
    // "Remote US", "US Remote", "Remote in Canada".
    for (let guard = 0; guard < 3; guard += 1) {
      const word = TITLE_WORKPLACE_WORD_RE.exec(raw.trim());
      if (!word) break;
      const lead = raw.length - raw.trimStart().length;
      if (word.index === 0) {
        segmentStart += lead + word[0].length;
        raw = raw.trimStart().slice(word[0].length);
      } else {
        raw = raw.slice(0, lead + word.index);
      }
    }
    const trimmedStart = segmentStart + (raw.length - raw.trimStart().length);
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const list = parsePlaceList(title, mentions, trimmedStart, trimmedStart + trimmed.length);
    const covered =
      list.end === trimmedStart + trimmed.length ||
      /^\s*only\s*$/i.test(title.slice(list.end, trimmedStart + trimmed.length));
    if (list.mentions.length === 0 || !covered) continue;
    emitList(list, trimmed);
    emitted = true;
  }
  // A place that ends the title without a separator: "Senior Engineer LATAM".
  const last = mentions[mentions.length - 1];
  if (!emitted && last && /^\s*(?:only|remote)?\s*\)?\s*$/i.test(title.slice(last.end))) {
    if (/\s$/.test(title.slice(0, last.start))) {
      emitList(parsePlaceList(title, mentions, last.start), title.slice(last.start));
    }
  }
}

/** B4: title and location items when the workplace is unknown: a place there is never settled. */
function unaccountedStructured(ctx: Context, input: RuleInput): UnaccountedSentence[] {
  const known = ["remote", "hybrid", "onsite"].includes(input.workplaceType ?? "");
  if (known) return [];
  const out: UnaccountedSentence[] = [];
  const title = unaccountedFor(
    "title",
    { text: input.title, start: 0, end: input.title.length },
    ctx.signals,
    [],
  );
  if (title) out.push(title);
  let offset = 0;
  for (const raw of input.locations) {
    const item = raw.trim();
    const start = offset;
    offset += item.length + 1;
    if (
      !item ||
      /\b(?:remote|home[- ]based|work from home|wfh|telecommute|hybrid|on[- ]?site|in[- ]office)\b/i.test(
        item,
      )
    ) {
      continue;
    }
    const entry = unaccountedFor(
      "locations",
      { text: item, start, end: start + item.length },
      [],
      [],
    );
    if (entry) out.push(entry);
  }
  return out;
}

// ---- Entry point ---------------------------------------------------------------------------

const DECISIVE_KINDS: ReadonlySet<SignalKind> = new Set([
  "allow-list",
  "worldwide",
  "work-authorization",
  "citizenship-or-clearance",
]);

function signalKey(signal: EligibilitySignal): string {
  return JSON.stringify([
    signal.source,
    signal.kind,
    signal.strength,
    [...signal.scopes.countries].sort(),
    [...signal.scopes.regions].sort(),
    signal.waysOfWorking,
    signal.engagement,
    signal.requirement,
    signal.timezone,
    signal.anchor,
  ]);
}

/**
 * Deterministic eligibility signals for one job. Reads the title, ATS location list, workplace and
 * employment type, the description text and optional schema.org JSON-LD. Never guesses: when
 * rules cannot settle eligibility, `unresolved` is true and `unresolvedReasons` says why.
 */
export function extractRuleSignals(input: RuleInput): RuleExtraction {
  const notes: string[] = [];
  const signals: EligibilitySignal[] = [];
  const base = {
    workplaceType: input.workplaceType,
    fullText: input.descriptionText,
    signals,
    notes,
  };
  const unaccounted: UnaccountedSentence[] = [];

  const locations = readLocations(input.locations, input.workplaceType);
  signals.push(...locations.signals);
  for (const name of locations.ambiguous) notes.push(`ambiguous-location:${name}`);
  signals.push(...readEmploymentType(input.employmentType));

  if (input.jsonLd !== undefined) {
    const jsonLd = readJsonLd(input.jsonLd);
    signals.push(...jsonLd.signals);
    notes.push(...jsonLd.notes);
    if (jsonLd.eligibilityText) {
      unaccounted.push(
        ...extractFromText(
          { ...base, field: "json-ld", source: "schema-org", accounted: [] },
          jsonLd.eligibilityText,
        ),
      );
    }
  }

  const titleCtx: Context = { ...base, field: "title", source: "rules", accounted: [] };
  titleRules(titleCtx, input.title);
  unaccounted.push(
    ...extractFromText(
      { ...base, field: "description", source: "rules", accounted: [] },
      input.descriptionText,
    ),
  );
  unaccounted.push(...unaccountedStructured(titleCtx, input));

  // B4: when the ATS location is in the US state of Georgia ("Atlanta, GA"), a "Georgia" in the text
  // is only a guess at the country.
  if (
    input.locations.some((l) =>
      /\bGA\b|\bAtlanta\b|\bGeorgia,?\s*(?:US|USA|United States)\b/.test(l),
    )
  ) {
    for (const signal of signals) {
      if (signal.source !== "rules" || !signal.scopes.countries.includes("GE")) continue;
      if (signal.guessedCountries?.includes("GE")) continue;
      signal.guessedCountries = [...(signal.guessedCountries ?? []), "GE"];
    }
  }

  const seen = new Set<string>();
  const unique = signals.filter((signal) => {
    const key = signalKey(signal);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const textual = unique.filter(
    (s) => (s.source === "rules" || s.source === "schema-org") && s.strength !== "weak",
  );
  const decisive = textual.some(
    (s) =>
      DECISIVE_KINDS.has(s.kind) &&
      !(s.kind === "citizenship-or-clearance" && s.strength !== "explicit") &&
      !(
        s.kind === "work-authorization" &&
        s.scopes.countries.length === 0 &&
        s.scopes.regions.length === 0
      ),
  );
  const worldwide = textual.some((s) => s.kind === "worldwide");
  const restricted = textual.some(
    (s) =>
      (s.kind === "allow-list" || s.kind === "work-authorization") &&
      (s.scopes.countries.length > 0 || s.scopes.regions.length > 0),
  );
  if (worldwide && restricted) notes.push("conflict:worldwide-vs-restriction");
  if (restricted && unique.some((s) => s.source === "ats-structured" && s.kind === "worldwide")) {
    notes.push("ats-worldwide-vs-text-restriction");
  }

  // Text says worldwide, but the structured location or the title names one or two places: the
  // post may be a local listing of a worldwide company, or a restricted role. Let the LLM decide.
  const narrowAnchor = unique.some(
    (s) =>
      s.source === "ats-structured" &&
      s.kind === "anchor" &&
      s.scopes.countries.length + s.scopes.regions.length <= 2,
  );
  const titleRestriction = unique.some(
    (s) => s.kind === "allow-list" && s.evidence.field === "title",
  );
  if (worldwide && (narrowAnchor || titleRestriction)) notes.push("worldwide-vs-narrow-location");

  const onsiteSettled =
    (input.workplaceType === "onsite" || input.workplaceType === "hybrid") &&
    unique.some(
      (s) =>
        s.kind === "anchor" &&
        s.anchor?.workplace !== "remote" &&
        (s.scopes.countries.length > 0 || s.scopes.regions.length > 0),
    ) &&
    !worldwide;

  const INFO_NOTES = new Set(["ats-worldwide-vs-text-restriction"]);
  const reasons = [...new Set(notes)].filter((n) => !INFO_NOTES.has(n));
  if (!decisive && !onsiteSettled) reasons.push("no-decisive-signal");
  return {
    signals: unique,
    unresolved: reasons.length > 0,
    unresolvedReasons: reasons,
    notes: [...new Set(notes)].filter((n) => INFO_NOTES.has(n)),
    salaries: extractSalaries(input.descriptionText),
    unaccounted,
    rulesVersion: RULES_VERSION,
  };
}
