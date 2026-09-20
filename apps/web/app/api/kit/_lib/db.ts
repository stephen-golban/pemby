// Database side of `/api/kit`. Raw SQL on the shared pool for the per-surface reads, exactly as
// `app/api/brief/_lib/db.ts` and `app/api/profile/_lib/db.ts` do it: `apps/web` does not declare
// `drizzle-orm`, so a query written against `@pemby/db`'s builder is not reachable from here.
//
// The exception is deliberate and is the point of the phase-09 kernel. Anything whose correctness
// depends on there being exactly **one** implementation goes through a `@pemby/db` helper that
// takes a `Db`, which this app may call even though it may not write a query:
//
//   countKitsThisMonth     the free quota's count. One definition, or the number means two things.
//   insertKitWithinQuota   the reservation. A hand-written count-then-insert loses the race.
//   selectKit              the kit a page renders, scoped to its owner inside the predicate.
//   selectUserAiKeyStatus  "is a key connected", answered by a query that cannot leak the blob.
//   loadUserAiKey          the ciphertext, on the one path that is about to make a model call.
//
// Personal data — CV text, profile facts, kit content — is read here and never logged.

import {
  ENGLISH_LEVELS,
  SENIORITIES,
  renderWayLabel,
  type TrackerApplicationState,
  type KitApplicationDefaults,
  type KitJobPost,
  type KitProfileFacts,
} from "@pemby/core";
import { getDb, selectKit } from "@pemby/db";
// The tracker's own writer, imported rather than reimplemented. It carries the ownership check
// (`claimOn`) that decides who may create an `applications` row at all, and it is the only place
// that check exists — which is the point: a second copy of it is how one surface ends up permitting
// what the others refuse.
import { recordApplicationState } from "@/app/api/applications/_lib/db";
import { findScreeningQuestions } from "./questions";
import {
  MAX_DEFAULT_LINKS,
  MAX_LINK_CHARS,
  NOTICE_PERIODS,
  WORK_AUTH_QUESTIONS,
  type ApplicationDefaultsPatch,
  type ApplicationDefaultsView,
  type KitContentView,
  type KitJobView,
  type KitView,
  type NoticePeriod,
  type WorkAuthQuestion,
} from "./view";

const isIn = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((s): s is string => typeof s === "string" && s !== "") : [];

/**
 * A country's English name for the model input. `Intl.DisplayNames` ships with Node, so this is the
 * same table the browser uses in `components/profile/format.ts` — no second list of country names.
 */
function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

// Application defaults ----------------------------------------------------
//
// `profiles.application_defaults` is an untyped `jsonb` with no schema and, before this phase, no
// writer. Everything read out of it is therefore validated rather than cast: a value that is not
// in the closed vocabulary is dropped, not repaired, because the next place it goes is a prompt.

const DEFAULTS_VERSION = 1;

export function toDefaultsView(raw: unknown): ApplicationDefaultsView {
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};

  const notice = source.noticePeriod;
  const links = strings(source.links)
    .map((link) => link.trim().slice(0, MAX_LINK_CHARS))
    .filter(isPublishableUrl)
    .slice(0, MAX_DEFAULT_LINKS);

  const auth: Partial<Record<WorkAuthQuestion, boolean>> = {};
  const rawAuth =
    typeof source.workAuthorization === "object" && source.workAuthorization !== null
      ? (source.workAuthorization as Record<string, unknown>)
      : {};
  for (const question of WORK_AUTH_QUESTIONS) {
    const value = rawAuth[question];
    if (typeof value === "boolean") auth[question] = value;
  }

  const answeredAt = typeof source.answeredAt === "string" ? source.answeredAt : null;

  return {
    noticePeriod: isIn(NOTICE_PERIODS, notice) ? notice : null,
    links,
    workAuthorization: auth,
    answeredAt: answeredAt !== null && !Number.isNaN(Date.parse(answeredAt)) ? answeredAt : null,
  };
}

/**
 * An absolute `http(s)` URL and nothing else.
 *
 * A link goes into a prompt and onto a page, so `javascript:`, `data:` and a bare "my portfolio"
 * are all refused rather than shown. Parsing with `URL` rather than a regex, because the failure
 * mode of a hand-rolled URL regex is accepting something the browser then resolves differently.
 */
function isPublishableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * True once the person has said they are **done** with the defaults form, however much of it they
 * filled in — not once one field happens to hold a value. See `answeredAt` in `./view.ts`.
 */
export function defaultsAnswered(defaults: ApplicationDefaultsView): boolean {
  return defaults.answeredAt !== null;
}

/**
 * The defaults as `buildKitInput` wants them: worded, not coded.
 *
 * The English here is the text that reaches the model, and it is deliberately **not** taken from
 * the next-intl catalogue. The catalogue is the reader's language, which will not always be
 * English (PLAN D22); the prompt's language is English whatever the reader's is, and coupling the
 * two would mean a Russian UI silently switching the model's input language.
 */
const NOTICE_WORDS: Record<NoticePeriod, string> = {
  immediately: "Immediately",
  two_weeks: "Two weeks",
  one_month: "One month",
  two_months: "Two months",
  three_months: "Three months",
};

const WORK_AUTH_WORDS: Record<WorkAuthQuestion, string> = {
  rightToWorkResidence: "Are you legally allowed to work in the country where you live?",
  needsSponsorshipAbroad:
    "Would you need visa sponsorship or relocation support for a role in another country?",
};

export function toKitDefaults(defaults: ApplicationDefaultsView): KitApplicationDefaults {
  const workAuthorization: { question: string; answer: string }[] = [];
  for (const question of WORK_AUTH_QUESTIONS) {
    const answer = defaults.workAuthorization[question];
    if (answer === undefined) continue;
    workAuthorization.push({ question: WORK_AUTH_WORDS[question], answer: answer ? "Yes" : "No" });
  }

  return {
    noticePeriod: defaults.noticePeriod === null ? null : NOTICE_WORDS[defaults.noticePeriod],
    // The label is derived from the host rather than asked for: one fewer field on a form the
    // person is filling in to get to something else, and a hostname is a better label than
    // whatever they would have typed.
    links: defaults.links.map((url) => ({ label: labelForLink(url), url })),
    workAuthorization,
  };
}

function labelForLink(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "github.com") return "GitHub";
    if (host === "gitlab.com") return "GitLab";
    if (host.endsWith("linkedin.com")) return "LinkedIn";
    return host;
  } catch {
    return "Link";
  }
}

/**
 * Writes the answered defaults back onto `profiles.application_defaults`.
 *
 * A merge over the stored object rather than a replace of it: the column is shared with whatever a
 * later phase asks in context, and a route that overwrote the whole blob would silently drop a key
 * it had never heard of. Returns null when the account has no profile row.
 *
 * **`answeredAt` is stamped only when the patch carries `answered: true`.** Saving one of the four
 * fields stores that field and nothing else. It used to stamp the date as well, which meant
 * answering one question retired the whole form — the other three were then unreachable from any
 * screen in the product, and every kit afterwards was written with them empty. A field a person
 * edited and then walked away from is still kept; they are simply asked again.
 */
export async function saveApplicationDefaults(
  userId: string,
  patch: ApplicationDefaultsPatch,
  now: Date,
): Promise<ApplicationDefaultsView | null> {
  const client = getDb().$client;
  const current = await client.query<{ application_defaults: unknown }>(
    "select application_defaults from profiles where user_id = $1",
    [userId],
  );
  const row = current.rows[0];
  if (!row) return null;

  const existing = toDefaultsView(row.application_defaults);
  const merged: Record<string, unknown> = {
    ...(typeof row.application_defaults === "object" && row.application_defaults !== null
      ? (row.application_defaults as Record<string, unknown>)
      : {}),
    v: DEFAULTS_VERSION,
    noticePeriod: patch.noticePeriod === undefined ? existing.noticePeriod : patch.noticePeriod,
    links: patch.links === undefined ? existing.links : patch.links,
    workAuthorization:
      patch.workAuthorization === undefined
        ? existing.workAuthorization
        : { ...existing.workAuthorization, ...patch.workAuthorization },
    answeredAt: patch.answered === true ? now.toISOString() : existing.answeredAt,
  };

  const saved = await client.query<{ application_defaults: unknown }>(
    `update profiles set application_defaults = $2::jsonb, updated_at = now()
      where user_id = $1
      returning application_defaults`,
    [userId, JSON.stringify(merged)],
  );
  const stored = saved.rows[0];
  return stored ? toDefaultsView(stored.application_defaults) : null;
}

// The post ----------------------------------------------------------------

interface JobRow {
  job_id: string;
  title: string;
  company_name: string;
  url: string;
  apply_url: string | null;
  locations: string[] | null;
  workplace_type: string | null;
  employment_type: string | null;
  salary_text: string | null;
  raw_text: string;
  stack: string[] | null;
  ways_of_working: string[] | null;
  is_demo: boolean;
}

/**
 * One post, by id, with the enrichment beside it.
 *
 * Not scoped to a match. A kit is per (person, post) and `kits` has no `match_id` requirement, so a
 * post the person reached from a near-miss chip or from an old Brief still has a kit — the thing
 * that decides whether they may generate one is the quota, not whether the matcher is still
 * standing behind a row. Closed and merged posts are excluded: writing a cover letter for a post
 * that no longer exists spends real money on nothing.
 */
const SELECT_JOB = `
  select j.id as job_id, j.title, j.url, j.apply_url, j.locations, j.workplace_type,
         j.employment_type, j.salary_text, j.raw_text, j.is_demo,
         c.name as company_name,
         e.stack, e.ways_of_working
    from jobs j
    join companies c on c.id = j.company_id
    left join job_enrichment e on e.job_id = j.id
   where j.id = $1 and j.status = 'open' and j.duplicate_of_job_id is null`;

export interface KitJobSubject {
  view: KitJobView;
  post: KitJobPost;
}

export async function loadJob(jobId: string): Promise<KitJobSubject | null> {
  const { rows } = await getDb().$client.query<JobRow>(SELECT_JOB, [jobId]);
  const row = rows[0];
  if (!row) return null;

  const locations = strings(row.locations);
  const screeningQuestions = findScreeningQuestions(row.raw_text);

  return {
    view: {
      jobId: row.job_id,
      title: row.title,
      company: row.company_name,
      url: row.apply_url ?? row.url,
      location: locations[0] ?? null,
      otherLocations: Math.max(0, locations.length - 1),
      demo: row.is_demo,
      screeningQuestions,
    },
    post: {
      title: row.title,
      company: row.company_name,
      locations,
      workplaceType: row.workplace_type,
      employmentType: row.employment_type,
      stack: strings(row.stack),
      salaryText: row.salary_text,
      descriptionText: row.raw_text,
    },
  };
}

// The person --------------------------------------------------------------

interface ProfileRow {
  titles: string[] | null;
  seniority: string | null;
  years_experience: number | string | null;
  stack: string[] | null;
  residence_country: string | null;
  ways_of_working: string[] | null;
  english_level: string | null;
  application_defaults: unknown;
  include_yellow: boolean;
  is_demo: boolean;
  cv_text: string | null;
  cv_domains: unknown;
}

/**
 * Everything the kit needs to know about the person: the profile row, their newest parsed CV's
 * extracted text, and the business domains that CV parse found.
 *
 * `distinct on (created_at desc)` over `cv_files`, matching `userDomains` in the matcher: a person
 * can have several CVs and the newest parsed one is the one they meant.
 */
const SELECT_SUBJECT = `
  select p.titles, p.seniority::text as seniority, p.years_experience, p.stack,
         p.residence_country, p.ways_of_working, p.english_level::text as english_level,
         p.application_defaults, p.include_yellow, p.is_demo,
         cv.extracted_text as cv_text, cv.parsed -> 'domains' as cv_domains
    from profiles p
    left join lateral (
      select f.extracted_text, f.parsed
        from cv_files f
       where f.user_id = p.user_id and f.extracted_text is not null
       order by f.parsed_at desc nulls last, f.created_at desc
       limit 1
    ) cv on true
   where p.user_id = $1`;

export interface KitSubject {
  profile: KitProfileFacts;
  cvText: string;
  defaults: ApplicationDefaultsView;
  /** `profiles.include_yellow`, which `entitlementsFor` needs to answer `allowedTiers`. */
  includeYellow: boolean;
  /** A seeded demonstration account. Never spend a real model call on a fictional person. */
  demo: boolean;
}

export async function loadSubject(userId: string): Promise<KitSubject | null> {
  const { rows } = await getDb().$client.query<ProfileRow>(SELECT_SUBJECT, [userId]);
  const row = rows[0];
  if (!row) return null;

  const seniority = isIn(SENIORITIES, row.seniority) ? row.seniority : null;
  const years = row.years_experience === null ? null : Number(row.years_experience);

  return {
    profile: {
      titles: strings(row.titles),
      seniority,
      yearsExperience: Number.isFinite(years) ? years : null,
      stack: strings(row.stack),
      domains: strings(row.cv_domains),
      residence: countryName(row.residence_country),
      waysOfWorking: strings(row.ways_of_working)
        .map(renderWayLabel)
        .filter((label): label is string => label !== null),
      englishLevel: isIn(ENGLISH_LEVELS, row.english_level)
        ? row.english_level.toUpperCase()
        : null,
    },
    cvText: row.cv_text ?? "",
    defaults: toDefaultsView(row.application_defaults),
    includeYellow: row.include_yellow,
    demo: row.is_demo,
  };
}

// Kits --------------------------------------------------------------------

/**
 * The newest kit this person has for this post, as the page renders it, or null.
 *
 * `selectKit` from `@pemby/db` scopes to the owner inside the predicate, so a kit can only be read
 * by the account that owns it; nothing here re-checks ownership, because the query cannot return
 * somebody else's row.
 *
 * The provenance is built from the row's own `model`, `prompt_version`, `key_class` and
 * `created_at` — all `not null` on the table — so a stored kit is machine-readably attributable to
 * a model whether or not anything remembered to mark it (Art. 50(2)).
 */
export async function loadKit(userId: string, jobId: string): Promise<KitView | null> {
  const row = await selectKit(getDb(), { userId, jobId });
  if (!row) return null;
  return {
    kitId: row.id,
    jobId: row.jobId,
    content: row.content as KitContentView,
    provenance: {
      aiGenerated: true,
      model: row.model,
      promptVersion: row.promptVersion,
      keyClass: row.keyClass,
      generatedAt: row.createdAt.toISOString(),
    },
  };
}

/** The `passes` row `entitlementsFor` takes, for one user. Read here, never inside `@pemby/core`. */
export interface PassRow {
  source: "purchase" | "referral" | "guarantee" | "share";
  startsAt: Date;
  endsAt: Date;
  pausedAt: Date | null;
  revokedAt: Date | null;
}

/**
 * The most recent pass row, or null.
 *
 * Until phase 10 `deliveryEntitlementsFor` deliberately does not believe this row, so today it
 * changes no verdict. It is read anyway, because phase 10 replaces one line inside that module and
 * the kit path should not be the place that then has to learn to read passes — the same reasoning
 * `activePasses` in the matcher records.
 */
export async function loadPass(userId: string): Promise<PassRow | null> {
  const { rows } = await getDb().$client.query<{
    source: PassRow["source"];
    starts_at: Date;
    ends_at: Date;
    paused_at: Date | null;
    revoked_at: Date | null;
  }>(
    `select source, starts_at, ends_at, paused_at, revoked_at
       from passes where user_id = $1 order by ends_at desc limit 1`,
    [userId],
  );
  const row = rows[0];
  return row
    ? {
        source: row.source,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        pausedAt: row.paused_at,
        revokedAt: row.revoked_at,
      }
    : null;
}

// Applying ----------------------------------------------------------------

export interface TrackerStanding {
  /** This person's own `applications.state` for this post, or null when they have no row. */
  applicationState: TrackerApplicationState | null;
  /**
   * Whether "I applied" would be accepted — a `matches` row or an `applications` row exists.
   *
   * The same condition `claimOn` applies, read here **only to decide whether to draw the button**.
   * It is not a second enforcement point and must never become one: the write is still refused by
   * `recordApplicationState`, and a client that ignores this flag gets a 404. Its whole job is to
   * stop the page offering a control that would fail — a kit can legitimately be generated for a
   * post with no match, and the button is the one thing on the page that then cannot work.
   */
  canRecordApplied: boolean;
}

/**
 * Where this person stands on this post, as far as the tracker is concerned.
 *
 * A read of the caller's own rows — `user_id` is in both predicates — not an ownership check for a
 * write. The check that decides whether a write is allowed is `recordApplicationState`'s, and there
 * is exactly one of it.
 */
export async function trackerStanding(userId: string, jobId: string): Promise<TrackerStanding> {
  const { rows } = await getDb().$client.query<{
    state: TrackerApplicationState | null;
    has_match: boolean;
  }>(
    `select a.state::text as state,
            exists (select 1 from matches m where m.job_id = $2 and m.user_id = $1) as has_match
       from (select 1) one
       left join applications a on a.job_id = $2 and a.user_id = $1`,
    [userId, jobId],
  );
  const row = rows[0];
  const applicationState = row?.state ?? null;
  return {
    applicationState,
    canRecordApplied: (row?.has_match ?? false) || applicationState !== null,
  };
}

export type AppliedResult =
  /** An `applications` row was created and the match, if any, moved with it. */
  | "recorded"
  /** A row already existed. Its state was left exactly where it was; see below. */
  | "already"
  /** Pemby never showed this person this post. Nothing was written. */
  | "not-yours";

/**
 * "I applied", from the kit surface.
 *
 * ## Who may write one
 *
 * **The caller must already have a `matches` row or an `applications` row for this post**, and that
 * rule is enforced by calling `recordApplicationState` — the tracker's own writer — rather than by
 * a second check here. Its `claimOn` states the reason: *the tracker is a record of what Pemby
 * delivered, not an open notebook, and an unchecked insert here would let anyone write rows against
 * any job.*
 *
 * An earlier version of this function got that wrong, and it was not a tidiness problem. It
 * `LEFT JOIN`ed `matches` and inserted regardless, so any signed-in account could create an
 * `applications` row against any open job. Because `claimOn` accepts a match row **or an
 * application row**, creating that row was the key to the rest of the tracker surface for a post
 * the person had never been shown — three requests from a throwaway account then wrote a red
 * `user_report` row into `eligibility_evidence` against a real company, with no flag, nothing in
 * the review queue and none of the anti-abuse weighting the rest of the phase built. Demonstrated
 * against a real database before this was written, and refused after it.
 *
 * **A kit can be generated for a post with no match** — `planKitRun` deliberately does not require
 * one, because a kit is per (person, post) and someone can reach a post from a near-miss chip. So
 * the two are not the same question: generating a draft spends the person's own quota and touches
 * nobody else, while "applied" writes into a table that feeds a company's eligibility verdict for
 * every user in a country. This route answers the second question, and answers it the way the
 * tracker already answers it.
 *
 * ## Why an existing row is never overwritten
 *
 * `upsertApplication` sets `state = excluded.state` whenever a state is supplied, so passing
 * `"applied"` unconditionally dragged an advanced application backwards: someone who had moved a
 * job to **Offer** on the board and then tapped "I applied" on its kit was silently returned to
 * Applied. This function therefore writes a state **only when there is no row yet**.
 *
 * When a row exists, its own state is passed back in. `upsertApplication` then sets the column to
 * the value it already holds — a no-op on the state — while `recordApplicationState` still brings
 * `matches.state` into line, which is the one thing that may legitimately be behind. The
 * alternative, skipping the call, would leave a Brief row reading "new" beside a board reading
 * "Offer".
 *
 * Nothing here decides that a row in `withdrawn` or `no_response` should become `applied` again.
 * Those are states the person chose on the board, and the board is where they are changed; this
 * button records a fact that is already recorded.
 *
 * `applied_at` is never passed: the column defaults to `now()` on insert and the helper leaves an
 * omitted field alone on update, so a second tap does not rewrite the date.
 */
export async function markApplied(userId: string, jobId: string): Promise<AppliedResult> {
  const { applicationState: current } = await trackerStanding(userId, jobId);
  const written = await recordApplicationState(userId, jobId, current ?? "applied");
  if (written === null) return "not-yours";
  return current === null ? "recorded" : "already";
}
