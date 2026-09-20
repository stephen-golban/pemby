// The shapes `/api/kit/*` answers with, shared by the route handlers and the browser.
//
// Everything here is JSON-safe: dates are ISO strings, enums are their database or vocabulary
// spelling, and every sentence a person reads is a key the client renders through i18n
// (docs/conventions.md). Error bodies carry stable codes, never English.
//
// Two rules of this surface are encoded in these types rather than left to a convention:
//
// 1. **A kit never travels without its provenance.** `KitView` cannot be constructed without a
//    `KitProvenance`, whose `aiGenerated` is the literal `true`. That is the machine-readable
//    marking Article 50(2) of Regulation (EU) 2024/1689 requires of generated text, in force since
//    2026-08-02, and making it non-optional is the cheapest way to stop a later refactor serving
//    kit text with the marking quietly dropped.
// 2. **Nothing here submits an application.** There is no endpoint, field or verb for it, by
//    design (PLAN D9, D16). A kit is a draft the person edits and sends themselves.

/** The three sections, in render order, mirroring `KIT_SECTIONS` in `@pemby/core`. */
export const KIT_SECTIONS = ["cvBullets", "coverLetter", "screeningAnswers"] as const;
export type KitSection = (typeof KIT_SECTIONS)[number];

/**
 * Every code these routes can answer with. The client's messages are keyed by exactly these.
 *
 * The `key_*` family is deliberately five codes rather than one. A user's own OpenRouter key can
 * fail in ways that need opposite answers — top up, wait, reconnect — and a single "your key
 * failed" would send everyone down the wrong one. Only `key_busy` is retryable.
 */
export const KIT_ERRORS = [
  "unauthenticated",
  "forbidden",
  "invalid_request",
  "job_not_found",
  /** No `profiles` row: the account never finished onboarding. Not a quota problem. */
  "no_profile",
  /** No readable CV text. A kit written from nothing would be invention, so it is refused. */
  "no_cv",
  /** The application defaults have never been answered; the page asks for them first (PLAN D5). */
  "defaults_missing",
  /** The three free kits for this calendar month are spent (PLAN D13). */
  "quota_exhausted",
  /** A key row exists but the stored blob will not decrypt — usually a rotated secret. */
  "key_unreadable",
  /** 402 `openrouter_credits`: the user's own balance cannot cover the call. */
  "key_credits",
  /** 402 `openrouter_key_limit`: the key's own cap is spent. */
  "key_limit",
  /** 402 `openrouter_in_flight_budget`: transient. The one retryable key failure. */
  "key_busy",
  /** The key was rejected outright (revoked, deleted, or never valid). */
  "key_invalid",
  /** Pemby's own daily AI cap is reached (PLAN D18). Nothing to do but wait. */
  "cap_reached",
  /** Every model attempt failed for a reason that is not about money. */
  "model_failed",
  /** The model answered, twice, with something the schema rejects. */
  "output_invalid",
  "unavailable",
] as const;
export type KitError = (typeof KIT_ERRORS)[number];

/**
 * The machine-readable marking that travels with every kit Pemby stores and serves
 * (Art. 50(2), Regulation (EU) 2024/1689).
 *
 * `aiGenerated` is the literal `true`, not `boolean`: there is no kit for which it is false, and a
 * type that allowed one would invite a code path that wrote it.
 *
 * At rest the same claim is carried by the `kits` row itself — `model`, `prompt_version` and
 * `key_class` are `not null` on every row, so a stored kit is attributable to a model by
 * construction. This object is that record, read back out and served.
 */
export interface KitProvenance {
  aiGenerated: true;
  /** The model that wrote it, as OpenRouter reports the answering model. */
  model: string;
  /** `PromptTemplate.versionId` of the `application-kit` prompt, from the private config. */
  promptVersion: string;
  /** Whose credits paid: `user` is the reader's own connected OpenRouter account. */
  keyClass: string;
  /** ISO, `kits.created_at`. */
  generatedAt: string;
}

export interface KitScreeningAnswerView {
  question: string;
  answer: string;
}

/** Structurally `KitContent` from `@pemby/core`, already normalized to `KIT_LIMITS`. */
export interface KitContentView {
  cvBullets: string[];
  coverLetter: string;
  screeningAnswers: KitScreeningAnswerView[];
}

export interface KitView {
  kitId: string;
  jobId: string;
  content: KitContentView;
  provenance: KitProvenance;
}

/** The post the kit is written against. Public data only; no eligibility verdict, no score. */
export interface KitJobView {
  jobId: string;
  title: string;
  company: string;
  /** The post's own URL; `applyUrl` when the board gives a separate one. */
  url: string;
  location: string | null;
  otherLocations: number;
  /** A seeded demonstration post. It carries the EXAMPLE stamp wherever it is shown (DESIGN.md). */
  demo: boolean;
  /**
   * Questions Pemby found in the post's own text. A heuristic over public text, not an extraction
   * model — see `./questions.ts` for exactly what it will and will not pick up.
   */
  screeningQuestions: string[];
}

export interface KitQuotaView {
  /** Kits allowed this calendar month, or null for unlimited (a pass, or your own key). */
  limit: number | null;
  /** Pemby-paid kits already written this month. Kits on your own key never count. */
  used: number;
  /** A key row exists. **Not** a promise that the key still works (phase 09 contract). */
  ownKey: boolean;
  plan: "free" | "pass";
}

/** `profiles.application_defaults`, asked in context the first time a kit needs them (PLAN D5). */
export const NOTICE_PERIODS = [
  "immediately",
  "two_weeks",
  "one_month",
  "two_months",
  "three_months",
] as const;
export type NoticePeriod = (typeof NOTICE_PERIODS)[number];

/**
 * The work-authorization answers every application form asks for, as a closed vocabulary.
 *
 * Two, not ten, and both yes/no. They are the two questions whose answer is a fact about the
 * person rather than about one employer, so they are the two worth storing once and reusing. There
 * is no free-text field here and there must not be one: this goes into a model prompt.
 */
export const WORK_AUTH_QUESTIONS = ["rightToWorkResidence", "needsSponsorshipAbroad"] as const;
export type WorkAuthQuestion = (typeof WORK_AUTH_QUESTIONS)[number];

export const MAX_DEFAULT_LINKS = 4;
export const MAX_LINK_CHARS = 200;

export interface ApplicationDefaultsView {
  noticePeriod: NoticePeriod | null;
  /** Absolute http(s) URLs the person publishes: portfolio, GitHub, LinkedIn. */
  links: string[];
  workAuthorization: Partial<Record<WorkAuthQuestion, boolean>>;
  /**
   * ISO of the last time the person said they were **done with this form**, or null if they never
   * have. It is written by the "Save and continue" action alone, never by saving one field.
   *
   * Stored rather than inferred, because "no links and no notice period" is a legitimate set of
   * answers and is indistinguishable from never having been asked. Without it the page would ask
   * the same person the same questions before every kit.
   *
   * It is deliberately **not** "every question has a value". Three of the four have an honest
   * "nothing to say", and inferring done-ness from the values would either nag somebody who has no
   * links forever or need a per-question skip flag for a decision one tap already settles.
   */
  answeredAt: string | null;
}

export type ApplicationDefaultsPatch = Partial<
  Pick<ApplicationDefaultsView, "noticePeriod" | "links" | "workAuthorization">
> & {
  /**
   * The person pressed "Save and continue": the form is dealt with, however much of it they
   * filled in. This is the only thing that stamps `answeredAt`.
   *
   * `true` and nothing else — there is no "un-answer". A form that could be reset to "never asked"
   * would put a reader back behind a gate they have already passed.
   */
  answered?: true;
};

/** The one thing standing between this account and a kit, when there is one. */
export const KIT_BLOCKERS = ["no_profile", "no_cv"] as const;
export type KitBlocker = (typeof KIT_BLOCKERS)[number];

/** Everything `/kit/[jobId]` renders on first paint. */
export interface KitPageView {
  /** ISO, the instant the server read this page. */
  readAt: string;
  /**
   * What the account is missing, or null when nothing is.
   *
   * Sent rather than inferred. The client cannot tell a missing profile from a pass holder by
   * looking at the quota — both read `limit: null, ownKey: false` — and a page that guessed would
   * send a paying reader to onboarding.
   */
  blocker: KitBlocker | null;
  /**
   * This person already has an `applications` row for this post.
   *
   * Read from `applications`, not from `matches.state`, because that table is what the tracker
   * board reads and a post reached from a near-miss chip has no match row at all.
   */
  applied: boolean;
  /**
   * Whether "I applied" would be accepted: Pemby has shown this person this post (a `matches` row)
   * or they already have an application on it.
   *
   * Sent so the page does not draw a control that would 404. It is **not** the enforcement — the
   * write is refused server-side by the tracker's own ownership check whatever a client sends.
   */
  canRecordApplied: boolean;
  job: KitJobView;
  /** The newest kit for this (person, post), or null when none has been written. */
  kit: KitView | null;
  quota: KitQuotaView;
  defaults: ApplicationDefaultsView;
}

// The stream ---------------------------------------------------------------
//
// NDJSON: one JSON object per line, `application/x-ndjson`. See the note at the top of
// `app/api/kit/[jobId]/generate/route.ts` for why this transport and not the AI SDK's helpers.

export type KitStreamEvent =
  /**
   * Always the first line, before a single token of generated text.
   *
   * Art. 50(2) asks that generated content be marked in a machine-readable form. A consumer of
   * this stream — the browser, a screen reader's live region, anything else — knows what it is
   * about to receive before it receives any of it, rather than learning at the end.
   */
  | { type: "disclosure"; aiGenerated: true }
  /** A partial kit, parsed from incomplete JSON. Fields appear as the model writes them. */
  | { type: "partial"; content: Partial<KitContentView> }
  /** The finished, normalized, stored kit. */
  | { type: "done"; kit: KitView; quota: KitQuotaView }
  /** The generation stopped. `error` is one of `KIT_ERRORS`. */
  | { type: "error"; error: KitError };
