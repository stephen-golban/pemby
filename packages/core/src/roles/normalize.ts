// Title normalization for the role filter. Isomorphic: no Node imports.

/** Words that carry seniority or contract terms, not the role itself. Removed before matching. */
const NOISE_WORDS = [
  "senior",
  "sr",
  "junior",
  "jr",
  "staff",
  "principal",
  "intermediate",
  "mid",
  "mid level",
  "entry level",
  "associate",
  "intern",
  "internship",
  "trainee",
  "apprentice",
  "graduate",
  "new grad",
  "i",
  "ii",
  "iii",
  "iv",
  "v",
  "remote",
  "hybrid",
  "onsite",
  "on site",
  "contract",
  "contractor",
  "fixed term",
  "full time",
  "part time",
  "temporary",
  "m f d",
  "f m d",
  "w m d",
  "m w d",
  "all genders",
  "h f",
  "f h",
];

/** Kept intact: "staff" and "associate" mean something inside these phrases. */
const PROTECTED_PHRASES: ReadonlyArray<[RegExp, string]> = [
  [/\bmember of (the )?technical staff\b/g, "software engineer"],
  [/\bchief of staff\b/g, "chiefofstaff"],
];

/**
 * Common non-English role words mapped to English. Runs after accents are stripped and
 * punctuation is turned into spaces, so every entry is plain lowercase ASCII (or Cyrillic).
 */
const LANGUAGE_MAP: ReadonlyArray<[RegExp, string]> = [
  [/\bsoftwareentwickler(in)?\b/g, "software developer"],
  [/\b(web|frontend|backend)entwickler(in)?\b/g, "$1 developer"],
  [/\bentwickler(in)?\b/g, "developer"],
  [/\bprogrammierer(in)?\b/g, "programmer"],
  [/\bingenieur(in|e)?\b/g, "engineer"],
  [/\bingenier[oa]\b/g, "engineer"],
  [/\binginer\b/g, "engineer"],
  [/\bdesarrollador(a|es)?\b/g, "developer"],
  [/\bdesenvolvedor(a|es)?\b/g, "developer"],
  [/\bdeveloppeu(r|se)\b/g, "developer"],
  [/\bsviluppat(ore|rice)\b/g, "developer"],
  [/\bprogramator\b|\bprogramista\b|\bprogramador(a)?\b|\bprogrammeu(r|se)\b/g, "programmer"],
  [/\banalista de datos\b|\banalista de dados\b/g, "data analyst"],
  [/\bcientifico de datos\b|\bcientista de dados\b/g, "data scientist"],
  [/разработчик\S*/g, "developer"],
  [/программист\S*/g, "programmer"],
  [/инженер\S*/g, "engineer"],
  // Word order: "inginer software", "ingenieur logiciel", "ingeniero de software".
  [/\bengineer (de )?(software|logiciel|informatica)\b/g, "software engineer"],
  [/\bdeveloper (de )?(software|logiciel)\b/g, "software developer"],
  [/\bdev\b/g, "developer"],
];

const NOISE_RE = new RegExp(
  `\\b(${NOISE_WORDS.map((w) => w.replace(/ /g, "\\s+")).join("|")})\\b`,
  "g",
);

/** Lowercase, strip accents, keep letters and digits only, map languages, drop noise words. */
export function normalizeText(raw: string): string {
  let s = raw
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/c\+\+/g, " cpp ")
    .replace(/c#/g, " csharp ")
    .replace(/\.net\b/g, " dotnet ")
    .replace(/\b(node|vue|react|next)\.?js\b/g, " $1 ")
    .replace(/[^\p{L}\p{N}]+/gu, " ");
  for (const [re, to] of PROTECTED_PHRASES) s = s.replace(re, to);
  for (const [re, to] of LANGUAGE_MAP) s = s.replace(re, to);
  return s.replace(NOISE_RE, " ").replace(/\s+/g, " ").trim();
}

/** A segment that names only a rank ("Manager", "Senior Director") needs the next segment. */
const BARE_SEGMENT =
  /^(manager|director|head|lead|team lead|vp|vice president|supervisor|specialist|chief)?$/;

export interface NormalizedTitle {
  /** The role part of the title: first segment, merged with the next while it is only a rank. */
  primary: string;
  /** Everything: all segments plus parenthetical content. Used for fallback and refinement. */
  full: string;
}

/**
 * Splits "Senior Software Engineer, Payments - Dublin (Remote, EU)" into the role head
 * ("software engineer") and the rest. Team names, locations and parentheticals follow the head
 * after ",", " - ", " | ", ":" and similar separators, so they never decide the role.
 */
export function normalizeTitle(title: string): NormalizedTitle {
  const parentheticals: string[] = [];
  const withoutParens = title.replace(/[([{]([^)\]}]*)[)\]}]?/g, (_m, inner: string) => {
    parentheticals.push(inner);
    return " , ";
  });
  const segments = withoutParens
    .split(/\s[-–—|:@]\s|[,;:|/\\]\s|[,;|]|\s[–—]|[–—]\s|\s\/\s/)
    .map(normalizeText)
    .filter((seg, i) => seg.length > 0 || i === 0);

  let idx = 0;
  let primary = segments[0] ?? "";
  while (BARE_SEGMENT.test(primary) && idx + 1 < segments.length) {
    idx += 1;
    primary = `${primary} ${segments[idx]}`.trim();
  }
  const full = [...segments, ...parentheticals.map(normalizeText)]
    .filter((s) => s.length > 0)
    .join(" ");
  return { primary, full };
}
