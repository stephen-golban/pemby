// The shape `/admin` renders and `GET /api/admin` answers with.
//
// Everything here is JSON-safe: dates are ISO strings, enums are their database spelling. The same
// object is produced on the server for the first paint and fetched by the client afterwards, so a
// `Date` would be a `Date` once and a string thereafter.
//
// **Two identifiers are deliberately absent.** `flags.user_id` and `delivery_log.user_id` are both
// selected by the `@pemby/db` helpers and both dropped here. Nothing on this page is a decision
// about a person: a flag is judged on the post it names and the weight it carries, and a failed
// delivery is judged on its channel and its error. Carrying the ids anyway would put one account's
// identifier on a screen that shows every account's rows, for no question it helps answer.
//
// **`note` is the one exception and it is here on purpose.** It is free text someone typed into an
// "Other" flag, and this surface is its only reader — it never reaches enrichment, a kit or any
// prompt (`packages/db/src/queries/flags.ts`, rule 1). Nothing else in this file is free text.

import type {
  AiUsageTotalsRow,
  BoardStatus,
  ChannelType,
  FlagAction,
  FlagAutomationState,
  FlagField,
  FlagReason,
  FlagStatus,
  JobStatus,
  SourceHealthTotals,
} from "@pemby/db";

export type { SourceHealthTotals };

/** What the owner can do to one flag from this page. Stable codes; the client maps them to words. */
export const ADMIN_FLAG_ACTIONS = ["approve", "dismiss"] as const;
export type AdminFlagAction = (typeof ADMIN_FLAG_ACTIONS)[number];

export interface AdminFlagPatch {
  flagId: string;
  action: AdminFlagAction;
  /**
   * On a dismissal, also take the flag's job out of quarantine.
   *
   * Separate from the verdict because they are separate judgements. Dismissing says the flag was
   * wrong; releasing puts a post back in front of every user it matches. A `scam` flag quarantines
   * a real job on one tap, so the owner needs both — but a single control that always did both
   * would put a post back every time a flag was thrown out for any reason, which is not what
   * "this flag was wrong" means.
   */
  release?: boolean;
}

/** What the owner can do to one quarantined job. */
export const ADMIN_JOB_ACTIONS = ["release"] as const;
export type AdminJobAction = (typeof ADMIN_JOB_ACTIONS)[number];

export interface AdminJobPatch {
  jobId: string;
  action: AdminJobAction;
}

export interface AdminFlagRow {
  flagId: string;
  jobId: string;
  jobTitle: string;
  jobUrl: string;
  jobStatus: JobStatus;
  companyName: string;
  reason: FlagReason;
  /** "Doesn't hire from my country": the flagger's residence, ISO 3166-1 alpha-2. */
  country: string | null;
  field: FlagField | null;
  /** Null even for a set `field` on the Telegram path, which never writes this column. */
  fieldValue: string | null;
  /** Free text from an "Other" flag. Null on every row today; nothing writes it on any surface. */
  note: string | null;
  weight: number;
  status: FlagStatus;
  actionTaken: FlagAction | null;
  claimAttempts: number;
  automation: FlagAutomationState;
  createdAt: string;
  /** The job is seeded demo data, or the flagger is a demo user. Rendered, never dropped. */
  isDemo: boolean;
  /**
   * Whether the kernel's verdict writer will accept a verdict on this row from the owner.
   *
   * It mirrors `VERDICT_FROM.owner` in `packages/db/src/queries/flags.ts` and nothing else. It used
   * to be `status === "open"`, which was **wrong the moment the kernel gained `by: "owner"`**: the
   * queue deliberately sorts `needs_review` first, so the one field that decides whether the buttons
   * are drawn was hiding them from exactly the rows a rule had escalated to a human. Carried as a
   * field rather than recomputed in the component, so there is one answer.
   */
  actionable: boolean;
  /** True when this flag's job is in quarantine, so a dismissal can offer to put it back. */
  jobQuarantined: boolean;
  /** `eligibility_evidence` rows still carrying this flag's id. See the automated row's note. */
  evidenceRows: number;
}

/**
 * Something a rule did on its own: an `auto_resolved` flag carrying a real `action_taken`.
 *
 * **A separate list from the review queue, and deliberately so.** "You must decide this" and "we
 * already did this, look if you want" are different jobs, and a queue that mixed them would bury
 * the first behind the second — the same shadowing the kernel avoids by keeping `auto_resolved` out
 * of `REVIEW_QUEUE_STATUSES`. Nothing here is waiting on anybody; it is here to be seen.
 */
export interface AdminAutomatedActionRow {
  flagId: string;
  jobId: string;
  jobTitle: string;
  jobUrl: string;
  /** What the post is **now**, which is not always what the action made it. */
  jobStatus: JobStatus;
  companyName: string;
  reason: FlagReason;
  /** The scope a tier downgrade applied to, when the flag carried one. */
  country: string | null;
  weight: number;
  /**
   * Never null and never `none`: a rule that did nothing is not an event, and `sent_to_review`
   * belongs in the queue, where the flag it produced already is. Narrowed to the six that are, so
   * the consequence sentence has a key for every value this can hold.
   */
  actionTaken: LoggedFlagAction;
  createdAt: string;
  /** When the rule decided. Never null on this list: `history` excludes rows that have not. */
  resolvedAt: string;
  /**
   * `eligibility_evidence` rows still carrying this flag's id.
   *
   * The undo copy is written from this, not from an assumption: with rows it can promise a
   * withdrawal, with none it has to say there is nothing left to withdraw. A message that describes
   * the work it intends rather than the outcome it achieves is this phase's signature defect, and
   * one number is what keeps this one honest.
   */
  evidenceRows: number;
  isDemo: boolean;
  /**
   * The three actions that changed something about a real company's business without a human:
   * a post closed for everyone, a post held out of every send, a company's tier stepped down.
   */
  heavy: boolean;
  /** Whether a dismissal from here would be accepted (`VERDICT_FROM.owner` includes it). */
  undoable: boolean;
  /** True when the post is in quarantine now, so the dismissal can offer to put it back. */
  jobQuarantined: boolean;
}

export interface AdminQuarantinedJobRow {
  jobId: string;
  title: string;
  url: string;
  companyName: string;
  updatedAt: string;
  firstSeenAt: string;
  flagCount: number;
  flagWeight: number;
  flagReasons: FlagReason[];
  isDemo: boolean;
  /**
   * Whether this page can put the post back.
   *
   * False until `releaseJob` exists in `@pemby/db`. `quarantineJob` has no inverse anywhere in the
   * repo, so a post quarantined by one tap on a `scam` flag stays out of every Brief, every send
   * and every kit with no path back short of an `UPDATE` by hand. The control is built; it is drawn
   * only when the kernel can honour it.
   */
  releasable: boolean;
}

export interface AdminSpendTaskRow {
  task: AiUsageTotalsRow["task"];
  calls: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  /** Key classes seen in this task's rows today, in the ledger's own spelling. */
  keyClasses: AiUsageTotalsRow["keyClass"][];
  /** False when every call in the group ran on a user's own key and none of it counts. */
  countsTowardCap: boolean;
}

export interface AdminSpend {
  /** The UTC day the totals cover, `YYYY-MM-DD`. The cap is a UTC-day cap. */
  day: string;
  /**
   * The real cap: `readDailyCapUsd()` from `@pemby/ai`. **Not** `ai_cap_alerts`, which holds a
   * `cap_usd = 0.000000` row from a forced-zero-cap test and would render a breach that never
   * happened. Null when `AI_DAILY_CAP_USD` is unreadable, and then `capError` says so.
   */
  capUsd: number | null;
  capError: "invalid_cap_config" | null;
  /** Today's spend that counts toward the cap. Spend on a user's own key is excluded, as in `cost.ts`. */
  spentUsd: number;
  /** Today's spend on users' own keys. Shown beside the cap, never added to it. */
  userKeyUsd: number;
  calls: number;
  byTask: AdminSpendTaskRow[];
}

/** The `flag_action` values that record something a rule actually did. */
export type LoggedFlagAction = Exclude<FlagAction, "none" | "sent_to_review">;

/** Why a board is in the attention list; a board with none is counted, not listed. */
export type BoardConcern = "erroring" | "not-found" | "disabled" | "stale" | "empty";

export interface AdminBoardRow {
  companyId: string;
  companyName: string;
  ats: string;
  boardStatus: BoardStatus | null;
  ingestEnabled: boolean;
  consecutiveErrors: number;
  totalErrors: number;
  totalRuns: number;
  jobsOpen: number;
  consecutiveEmptyLists: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorKind: string | null;
  concern: BoardConcern;
}

export interface AdminSourceHealth {
  generatedAt: string;
  totals: SourceHealthTotals;
  needsAttention: AdminBoardRow[];
  /** Boards with nothing wrong: the count, not the rows. 303 ledger lines is not observability. */
  healthy: number;
  /** True when `needsAttention` was cut to its ceiling; the count is still `totals`-accurate. */
  truncated: boolean;
}

export interface AdminDeliveryFailureRow {
  deliveryId: string;
  matchId: string | null;
  channelType: ChannelType;
  /** The sanitized error label the dispatcher wrote. Never a provider's raw body. */
  error: string | null;
  createdAt: string;
  jobTitle: string | null;
  companyName: string | null;
  isDemo: boolean;
}

/** The five panels, by name. */
export const ADMIN_PANELS = [
  "flags",
  "automatedActions",
  "quarantined",
  "spend",
  "source",
  "deliveryFailures",
] as const;
export type AdminPanel = (typeof ADMIN_PANELS)[number];

export interface AdminView {
  /** When the server read all five panels. One clock for the page. */
  readAt: string;
  /**
   * Panels whose read threw. Their data arrives empty, and **an empty panel that failed is not an
   * empty panel that found nothing** — the whole point of this page is to be able to tell those
   * apart, so each named panel says on screen that it could not be read rather than showing the
   * "nothing here" copy.
   *
   * Per panel rather than per page, because these five questions are independent: one unavailable
   * query should not blank the four that answered. It is not hypothetical — `selectFlagsForReview`
   * reads `flags.claim_attempts`, which a pending migration adds, so on any environment that is
   * behind, four panels are correct and the fifth cannot run.
   */
  failedPanels: AdminPanel[];
  flags: AdminFlagRow[];
  automatedActions: AdminAutomatedActionRow[];
  /** How far back the automated-actions log looked, in days. */
  automatedWindowDays: number;
  /**
   * Whether this deploy can put a quarantined post back at all.
   *
   * A deploy-wide fact, not a per-row one, so no control that would answer `release_unavailable` is
   * ever drawn — on the quarantined panel or on a flag row whose post is held.
   */
  releaseAvailable: boolean;
  quarantined: AdminQuarantinedJobRow[];
  spend: AdminSpend;
  source: AdminSourceHealth;
  deliveryFailures: AdminDeliveryFailureRow[];
  /** How far back the delivery-failure panel looked, in days. */
  deliveryWindowDays: number;
}
