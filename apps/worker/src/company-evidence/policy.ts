// Code-level guards for company hiring-policy statements: the wording a company-wide policy uses,
// the explicit words that make a policy worldwide, and the structure of job listings and job detail
// pages, whose per-role locations are not company policy. The model's reading is never trusted alone.

/**
 * Wording of a company-wide statement about where people are hired, employed or engaged. A quote
 * without any of these ("100% remote. US only.", "Remote (Europe)", "work wherever home is") is a
 * role line or a perk, not a policy.
 */
const POLICY_PATTERNS: readonly RegExp[] = [
  // "we hire", "we can hire", "we're not able to employ", "we are currently hiring in"
  /\bwe(?:'re|’re| are|'ve|’ve| have)?\b[^.!?\n]{0,40}?\b(?:hir(?:e|es|ing)|employ(?:s|ing)?|engag(?:e|es|ing)|recruit(?:s|ing)?|onboard(?:s|ing)?)\b/i,
  // "hire in", "hiring from", "employed through", "engage contractors in"
  /\b(?:hir(?:e|es|ed|ing)|employ(?:s|ed|ing)?|engag(?:e|es|ed|ing)|onboard(?:s|ed|ing)?)\b[^.!?\n]{0,40}?\b(?:in|from|across|outside|within|through|via|regardless)\b/i,
  // "countries we hire in", "locations where you can be employed"
  /\b(?:countr(?:y|ies)|locations?|regions?|places)\b[^.!?\n]{0,30}?\b(?:hire|hiring|employ\w*|engage\w*|work from|be based|live in)\b/i,
  // "open to candidates in", "applicants from"
  /\bopen to (?:candidates|applicants|applications|people|talent|team members|hires)\b/i,
  /\b(?:candidates|applicants|team members|employees|contractors|people)\b[^.!?\n]{0,30}?\b(?:based|located|living|residing) (?:in|outside|anywhere)\b/i,
  // Employment arrangements.
  /\b(?:employer of record|EOR|PEO|professional employer organi[sz]ation|legal entit(?:y|ies)|local entit(?:y|ies)|payroll)\b/i,
  /\b(?:via|through|using|with|partner with)\s+(?:Deel|Remote(?:\.com)?|Oyster(?: HR)?|Papaya(?: Global)?|Velocity Global|Globalization Partners|G-P|Multiplier|Omnipresent|Rippling|Remofirst|Atlas|Safeguard Global)\b/i,
  /\bcontractors?\b[^.!?\n]{0,40}?\b(?:in|from|based|any|all|anywhere|countr\w*|worldwide|globally)\b/i,
  // "work from anywhere in the world", "live in any country" (being invited to apply is not policy)
  /\b(?:work|live|join us|be based)\b[^.!?\n]{0,25}?\b(?:from|in)\b[^.!?\n]{0,25}?\b(?:anywhere in the world|any country|wherever you are in the world|worldwide)\b/i,
  /\bregardless of (?:your )?(?:location|country|geography|where you live)\b/i,
  // Exclusions and sanctions.
  /\b(?:not|unable to|cannot|can't|can’t|don't|don’t|do not)\b[^.!?\n]{0,25}?\b(?:hire|employ|engage|accept applications|consider candidates)\b/i,
  /\b(?:sanction\w*|export control\w*|embargo\w*)\b/i,
  /\bvisa sponsorship\b|\bsponsor\w* (?:work )?visas?\b|\brelocation (?:support|package|assistance)\b/i,
];

export function hasPolicyLanguage(text: string): boolean {
  return POLICY_PATTERNS.some((re) => re.test(text));
}

/** An explicit no-country-limit phrase; a bare "anywhere", "remote-first" or "wherever home is" are not. */
const WORLDWIDE_WORDS =
  /\b(?:anywhere in the world|worldwide|world-wide|globally(?! distributed)|any country|all countries|every country|any location in the world|wherever you are in the world|regardless of (?:your )?(?:location|country|geography|where you live))\b/i;

/** Words between a hiring or working phrase and a worldwide phrase: up to three, no customers. */
const PEOPLE_GAP = String.raw`(?:\s+(?!(?:customers|clients|users|partners|companies|businesses|brands|organi[sz]ations|merchants|players|patients|audiences)\b)[\w'’-]+){0,3}?\s+`;

/**
 * Looser worldwide phrases, counted only right after hiring, working or living wording: "hiring and
 * working from all over the world", "team members from around the world". "From anywhere" counts
 * only after hiring wording ("we can hire from anywhere"), since "work from anywhere" is often a
 * perk inside one country, and never when a place follows ("from anywhere in the US").
 */
const WORLDWIDE_PEOPLE: readonly RegExp[] = [
  new RegExp(
    String.raw`\b(?:hir(?:e|es|ed|ing)|employ(?:s|ed|ing)?|engag(?:e|es|ed|ing)|work(?:s|ed|ing)?|live|living|team members|teammates|employees|colleagues)${PEOPLE_GAP}(?:(?:from|in|across)\s+)?(?:all over|around) the (?:world|globe)\b`,
    "i",
  ),
  new RegExp(
    String.raw`\b(?:hir(?:e|es|ed|ing)|employ(?:s|ed|ing)?|engag(?:e|es|ed|ing))${PEOPLE_GAP}from anywhere\b(?!\s+(?:in|within|across|inside)\s+(?!the world\b))`,
    "i",
  ),
];

/** Phrases that confine a remote arrangement to one country or region. */
const COUNTRY_LIMIT =
  /\bin-country\b|\bwithin (?:your|their|the same|one|a single|a) (?:country|region)\b|\bin (?:your|their) (?:home )?country\b|\b(?:select|selected|specific|certain) (?:countries|locations|regions)\b/i;

/** True when the quote names no limit and says worldwide in so many words. */
export function saysWorldwide(text: string): boolean {
  return (
    (WORLDWIDE_WORDS.test(text) || WORLDWIDE_PEOPLE.some((re) => re.test(text))) &&
    !COUNTRY_LIMIT.test(text)
  );
}

/** Wording that makes a statement a possibility rather than a practice. */
export const HEDGE =
  /\bmay (?:consider|be able|occasionally)\b|\b(?:might|could)\b|\bin some (?:cases|of these|countries|locations)\b|\bcase[- ]by[- ]case\b|\bconsider(?:ed|ing|s)?\b|\b(?:some|certain|select(?:ed)?|specific) roles\b|\bdepending on\b|\bexceptions?\b/i;

/** Words that point from a sentence to the list or table after it. */
const LIST_POINTER = /\b(?:the following|below|this table|the table|this list|the list)\b/i;

/**
 * True when a quote without policy wording of its own is the list a policy sentence introduces.
 * `lead` is the text just before the quote. Either the sentence running into the quote uses policy
 * wording before a colon ("we are currently able to hire in the following: ... Countries: Brazil"),
 * or a whole sentence in the lead uses policy wording and points at a list or table ("the
 * following table shows the countries where we employ team members").
 */
export function introducedByPolicy(lead: string): boolean {
  const sentences = lead.split(/[.!?](?:\s+|$)/);
  const current = sentences.pop() ?? "";
  if (current.includes(":") && hasPolicyLanguage(current.slice(0, current.lastIndexOf(":")))) {
    return true;
  }
  // The first piece may start mid-sentence; it is still read, since a cut sentence only loses words.
  return sentences.some((s) => LIST_POINTER.test(s) && hasPolicyLanguage(s));
}

export const NEGATION =
  /\b(?:not|unable|cannot|can't|can’t|don't|don’t|do not|won't|won’t|no longer|except|excluding|excluded|exclusion|other than|outside of|sanction\w*|embargo\w*|prohibit\w*|restrict\w*)\b/i;

export const CONTRACTOR_WORDS =
  /\b(?:contractors?|contracting|freelanc\w*|independent contract\w*|consultants?|B2B)\b/i;

/** Job titles: a role noun somewhere in a short line. */
const ROLE_WORD =
  /\b(?:engineer|developer|manager|designer|director|head of|VP|vice president|lead|scientist|analyst|architect|specialist|consultant|account executive|representative|coordinator|associate|intern|internship|administrator|officer|advocate|writer|researcher|strategist|technician|principal|fellow|owner|marketer|accountant|counsel|operator|SRE|DevOps|recruiter|partner|executive)s?\b/gi;

function isTitleLine(line: string): boolean {
  const trimmed = line.replace(/^[\s*>•-]+/, "").trim();
  if (trimmed.length === 0 || trimmed.length > 100) return false;
  if (/[.!?:]$/.test(trimmed) || trimmed.split(/\s+/).length > 12) return false;
  ROLE_WORD.lastIndex = 0;
  return ROLE_WORD.test(trimmed);
}

/** Several job titles run together on one line (card text with the markup stripped). */
function isPackedListingLine(line: string): boolean {
  if (/[.!?]\s/.test(line)) return false;
  return (line.match(ROLE_WORD)?.length ?? 0) >= 3;
}

/** Title lines within this many lines of each other belong to one listing. */
const LISTING_GAP = 4;
/** Lines after a title that describe that role (location, salary, a summary). */
const CARD_LINES = 3;

/**
 * Lines of `text` that belong to job listings: runs of at least three job titles with the lines
 * that follow each (location, salary, summary), lines packing several titles together, and short
 * lines repeated three or more times with only numbers changing ("Remote, U.S.", "$150K. 100%
 * remote. US only.").
 */
export function jobListingLineMask(text: string): boolean[] {
  const lines = text.split("\n");
  const mask = new Array<boolean>(lines.length).fill(false);

  const titles: number[] = [];
  lines.forEach((line, i) => {
    if (isPackedListingLine(line)) mask[i] = true;
    else if (isTitleLine(line)) titles.push(i);
  });
  let start = 0;
  for (let i = 1; i <= titles.length; i++) {
    const prev = titles[i - 1] ?? 0;
    const cur = titles[i];
    if (cur !== undefined && cur - prev <= LISTING_GAP) continue;
    const run = titles.slice(start, i);
    if (run.length >= 3) {
      run.forEach((t, k) => {
        const next = run[k + 1] ?? t + CARD_LINES + 1;
        for (let j = t; j < Math.min(next, t + CARD_LINES + 1, lines.length); j++) mask[j] = true;
      });
    }
    start = i;
  }

  const counts = new Map<string, number[]>();
  lines.forEach((line, i) => {
    const key = line.trim().replace(/\d+/g, "#").toLowerCase();
    if (key.length === 0 || key.length > 80) return;
    const list = counts.get(key) ?? [];
    list.push(i);
    counts.set(key, list);
  });
  for (const [key, indexes] of counts) {
    if (indexes.length < 3) continue;
    // Repeated headings of a menu or a card grid say nothing about hiring unless they read as one.
    if (hasPolicyLanguage(key)) continue;
    for (const i of indexes) mask[i] = true;
  }
  return mask;
}

/** `text` with job-listing lines blanked out; line count and order are kept. */
export function withoutJobListings(text: string): string {
  const mask = jobListingLineMask(text);
  return text
    .split("\n")
    .map((line, i) => (mask[i] ? "" : line))
    .join("\n");
}

/** Section headings of a single job's description. */
const JOB_DETAIL_HEADING =
  /^(?:responsibilities|key responsibilities|requirements|qualifications|minimum qualifications|preferred qualifications|basic qualifications|what you'?ll do|what you will do|what you'?ll be doing|about the role|about this role|the role|about you|who you are|what we'?re looking for|what we are looking for|nice to haves?|bonus points|apply for this (?:job|role|position)|job description|you will|you have)$/i;

/** Paths and query strings of a single job's page. */
export const JOB_DETAIL_PATH =
  /\/(?:jobs?|positions?|openings?|roles?|careers?|vacancies|opportunities)\/(?:[^/]*\/)*[^/]*\d[^/]*\/?$|\d{5,}|[0-9a-f]{8}-[0-9a-f]{4}-/i;
export const JOB_QUERY = /(?:^|[?&])(?:ashby_jid|gh_jid|lever-(?:source|origin)|jobId|job_id)=/i;
/** Hosted applicant-tracking pages: every page there is about one role or a list of roles. */
export const ATS_HOST =
  /(?:^|\.)(?:greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|bamboohr\.com|recruitee\.com|teamtailor\.com|personio\.(?:de|com)|myworkdayjobs\.com|breezy\.hr|jobvite\.com|icims\.com|rippling-ats\.com|pinpointhq\.com|homerun\.co|join\.com)$/i;

/** Libraries of role descriptions (handbooks publish one page per role). */
const JOB_DESCRIPTION_PATH = /\/job[-_]?descriptions?(?:[-_]library)?(?:\/|$)/i;

export function isJobDetailUrl(url: URL): boolean {
  return (
    JOB_DESCRIPTION_PATH.test(url.pathname) ||
    ATS_HOST.test(url.hostname) ||
    JOB_DETAIL_PATH.test(url.pathname) ||
    JOB_QUERY.test(url.search)
  );
}

/** A page describing one role: its URL, or three or more job-description section headings. */
export function isJobDetailPage(url: URL, text: string): boolean {
  if (isJobDetailUrl(url)) return true;
  const headings = new Set<string>();
  for (const line of text.split("\n")) {
    const heading = line
      .replace(/^[\s*#>•-]+/, "")
      .replace(/[:\s]+$/, "")
      .replace(/’/g, "'")
      .trim();
    if (heading.length < 40 && JOB_DETAIL_HEADING.test(heading))
      headings.add(heading.toLowerCase());
  }
  return headings.size >= 3;
}
