// The user message of the `application-kit` task: everything the model is given, as labeled plain
// text. Isomorphic and pure — the same input string is produced on the worker and anywhere else.
//
// The prompt itself is **not here and is not in this repo**. `resolvePrompt`
// (`packages/ai/src/structured.ts`) loads the `application-kit` template from the private config and
// that becomes the system instructions; this module builds only the `input` string beside it. The
// precedent is `buildEnrichmentInput` in `../eligibility/llm/input.ts`, called from the enrichment
// worker, and this follows it deliberately.
//
// Two things about the ordering below are load-bearing.
//
// 1. **Static to volatile, for prompt caching.** The person's profile, CV and application defaults
//    come first, the job post and its screening questions last. One CV run against many job posts
//    is exactly the shape that earns cache hits on a long stable prefix, and the reverse ordering
//    earns none (research 07 section 5). It costs nothing to get right and cannot be fixed later
//    without changing every cached prefix at once.
//
// 2. **Every section is labeled unambiguously.** The worst failure this feature has is a cover
//    letter that claims experience the CV does not contain, and the easiest way to produce one is
//    to hand a model two blocks of prose about jobs and let it decide which belongs to whom. The
//    headers say whose words each block is, in the block itself, where a truncation or a stray
//    heading inside a job post cannot detach them.
//
// Free text a user typed into a flag never reaches this builder (phase 09 contract). Everything
// here is either the person's own profile and CV, or the public job post.

/** Roughly 5k tokens of CV. Longer is padding, boilerplate, or a CV that is really a portfolio. */
export const MAX_CV_CHARS = 20_000;

/** As `MAX_DESCRIPTION_CHARS` in the enrichment builder: benefits and EEO text sit at the end. */
export const MAX_JOB_DESCRIPTION_CHARS = 20_000;

/** Kept in step with `KIT_LIMITS.screeningAnswers`: we ask for one answer per question passed in. */
export const MAX_SCREENING_QUESTIONS = 10;

/** Longest single screening question kept; a longer one is a whole section misread as a question. */
export const MAX_SCREENING_QUESTION_CHARS = 500;

/**
 * The person, as Pemby already knows them. Plain strings rather than core's enums, exactly like
 * `EnrichmentPost`: this is display text going into a prompt, and a mapping layer here would only
 * be a second place for the spellings to drift.
 */
export interface KitProfileFacts {
  /** `profiles.titles`, most recent first. */
  titles: readonly string[];
  /** `profiles.seniority`, worded. */
  seniority: string | null;
  yearsExperience: number | null;
  /** `profiles.stack`. */
  stack: readonly string[];
  /** Business domains from the parsed CV. */
  domains: readonly string[];
  /** Country of residence, as a name rather than an ISO code. */
  residence: string | null;
  /** `profiles.ways_of_working`, worded (`WAY_LABELS` in `../delivery/strings/en.ts`). */
  waysOfWorking: readonly string[];
  /** `profiles.english_level`. */
  englishLevel: string | null;
}

/** The public job post. Same fields the enrichment builder reads, plus what a kit needs. */
export interface KitJobPost {
  title: string;
  company: string | null;
  /** `jobs.locations`. */
  locations: readonly string[];
  /** `jobs.workplace_type`. */
  workplaceType: string | null;
  /** Raw vendor employment type (`jobs.employment_type`). */
  employmentType: string | null;
  /** Stack listed by the post, not inferred. */
  stack: readonly string[];
  /** Salary as the post states it, or null when it states none. Never a computed figure. */
  salaryText: string | null;
  /** Plain-text description (`jobs.raw_text`). */
  descriptionText: string;
}

/** One link the person publishes: portfolio, GitHub, LinkedIn. */
export interface KitLink {
  label: string;
  url: string;
}

/**
 * The answers a person gives once and reuses on every form (PLAN D5, asked in context). They are
 * facts about the applicant, so they belong in the stable prefix with the profile and the CV.
 */
export interface KitApplicationDefaults {
  /** "Immediately", "30 days", or null when they have not said. */
  noticePeriod: string | null;
  links: readonly KitLink[];
  /** Work-authorization answers the person has already given, as question and answer. */
  workAuthorization: readonly { question: string; answer: string }[];
}

export interface KitInputParts {
  profile: KitProfileFacts;
  /** CV text **we** extracted (PLAN privacy rule: never a file, never a PDF plugin). */
  cvText: string;
  job: KitJobPost;
  defaults: KitApplicationDefaults;
  /** Screening questions found in the post. Frequently empty; the empty case is stated, not hidden. */
  screeningQuestions: readonly string[];
}

export interface KitInput {
  text: string;
  /** True when the CV, the description or the question list was cut to a limit above. */
  truncated: boolean;
}

const NOT_GIVEN = "(not given)";
const NONE_LISTED = "(none listed)";

function list(values: readonly string[]): string {
  const kept = values.map((value) => value.trim()).filter((value) => value.length > 0);
  return kept.length > 0 ? kept.join("; ") : NONE_LISTED;
}

function value(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : NOT_GIVEN;
}

/**
 * The model input for one (person, job) pair.
 *
 * Section order is the caching order and is not cosmetic; see the note at the top of this file.
 */
export function buildKitInput(parts: KitInputParts): KitInput {
  const { profile, job, defaults } = parts;
  let text = "";
  let truncated = false;

  const line = (label: string, shown: string) => {
    text += `${label}: ${shown}\n`;
  };
  const header = (title: string) => {
    text += `${text.length === 0 ? "" : "\n"}=== ${title} ===\n`;
  };

  // ---- Stable prefix: the person ------------------------------------------------------------
  header("SECTION 1/5: THE PERSON (their Pemby profile)");
  line("Titles", list(profile.titles));
  line("Seniority", value(profile.seniority));
  line(
    "Years of experience",
    profile.yearsExperience === null ? NOT_GIVEN : String(profile.yearsExperience),
  );
  line("Stack", list(profile.stack));
  line("Domains", list(profile.domains));
  line("Lives in", value(profile.residence));
  line("Ways of working", list(profile.waysOfWorking));
  line("English", value(profile.englishLevel));

  header("SECTION 2/5: THE PERSON'S CV (their own words, extracted from their file)");
  const cv = parts.cvText.trim();
  if (cv.length === 0) {
    text += `${NOT_GIVEN}\n`;
  } else if (cv.length > MAX_CV_CHARS) {
    truncated = true;
    text += `${cv.slice(0, MAX_CV_CHARS)}\n(CV truncated)\n`;
  } else {
    text += `${cv}\n`;
  }

  header("SECTION 3/5: THE PERSON'S APPLICATION DEFAULTS (answers they have already given)");
  line("Notice period", value(defaults.noticePeriod));
  line(
    "Links",
    list(defaults.links.map((link) => `${link.label.trim()} ${link.url.trim()}`.trim())),
  );
  if (defaults.workAuthorization.length === 0) {
    line("Work authorization", NONE_LISTED);
  } else {
    text += "Work authorization:\n";
    for (const entry of defaults.workAuthorization) {
      text += `- Q: ${entry.question.trim()}\n  A: ${entry.answer.trim()}\n`;
    }
  }

  // ---- Volatile suffix: this one job post ---------------------------------------------------
  header("SECTION 4/5: THE JOB POST (the employer's advertisement, not the person's history)");
  line("Title", job.title.trim());
  line("Company", value(job.company));
  line("Locations", list(job.locations));
  line("Workplace type", value(job.workplaceType));
  line("Employment type", value(job.employmentType));
  line("Stack listed by the post", list(job.stack));
  line("Salary as the post states it", value(job.salaryText));

  text += "\nPost text:\n";
  const description = job.descriptionText.trim();
  if (description.length === 0) {
    text += `${NOT_GIVEN}\n`;
  } else if (description.length > MAX_JOB_DESCRIPTION_CHARS) {
    truncated = true;
    text += `${description.slice(0, MAX_JOB_DESCRIPTION_CHARS)}\n(post text truncated)\n`;
  } else {
    text += `${description}\n`;
  }

  // Stated even when empty. A missing section reads as "questions were withheld", and the model
  // then invents the questions it thinks it was not shown.
  header("SECTION 5/5: SCREENING QUESTIONS FROM THE JOB POST");
  const questions = parts.screeningQuestions
    .map((question) => question.replace(/\s+/g, " ").trim().slice(0, MAX_SCREENING_QUESTION_CHARS))
    .filter((question) => question.length > 0);
  if (questions.length === 0) {
    text += "(the post lists no screening questions)\n";
  } else {
    if (questions.length > MAX_SCREENING_QUESTIONS) truncated = true;
    for (const [index, question] of questions.slice(0, MAX_SCREENING_QUESTIONS).entries()) {
      text += `${index + 1}. ${question}\n`;
    }
  }

  return { text, truncated };
}
