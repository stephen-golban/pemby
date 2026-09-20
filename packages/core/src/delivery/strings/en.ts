// Delivery copy: the English a match wears on Telegram, in an email and in a push notification.
//
// It lives here, and not in `apps/web/messages`, because none of the three channels can read a
// next-intl catalogue. The worker and the bot have no React, and `apps/web` cannot import either of
// them. A typed key -> string table in `@pemby/core` is the one place all three can reach, and the
// table shape is what keeps it i18n-ready (PLAN D22): a second language is a second table beside
// this one, not a rewrite of the callers.
//
// Same rules as `GATE_REASONS` and `SCORE_REASONS`, and for the same reason — `renderDeliveryString`
// does naive `{param}` substitution, so a template only next-intl could read would give these
// channels broken output:
//   - no ICU, no plurals, no select;
//   - no line may depend on grammatical number ("Your matches: {count}", never "{count} matches");
//   - any key that also appears in a web messages file must be byte-identical to its twin, and
//     `pnpm --filter @pemby/core check:reasons` is what enforces that.
//
// PLAN D16 wording applies to every line: Pemby is AI job-matching software; you apply yourself.
// Nothing here says board, recruiter, recruitment, placement, get hired, guaranteed job,
// auto-apply, scrape or beat the ATS, and nothing offers to write anyone's CV.

// Type-only, and erased by `verbatimModuleSyntax`: `../../tracker` imports the labels below as a
// value, so a runtime import in this direction would be a cycle.
import type { TrackerColumn } from "../../tracker";

export const DELIVERY_STRINGS = {
  // ---- Buttons on a match card -------------------------------------------------------------
  "button-apply": "Apply",
  "button-save": "Save",
  "button-unsave": "Unsave",
  "button-applied": "I applied",
  "button-not-for-me": "Not for me",
  "button-flag": "Something's wrong",
  "button-back": "Back",

  /**
   * The tracker button on an already-sent Telegram card, after a state change edits it.
   *
   * **The whole label, with the column as a parameter** — not a suffix the caller concatenates onto
   * `TRACKER_COLUMN_LABELS[column]`. The column name came from the watched table and the rest was a
   * hand-written literal in the worker, which put half of a button a person taps outside this file
   * and outside `check:reasons`. Composing it at the call site also hard-codes English word order
   * and an em dash: a language that leads with the verb, or spells the separator differently,
   * cannot be served by concatenation, and Russian is the next language (PLAN D22).
   *
   * `{column}` is an already-worded label from `TRACKER_COLUMN_LABELS`, resolved by the caller, the
   * same way `MatchCard.wayOfWorking` is worded before it reaches the card.
   */
  "button-tracker": "{column} — open tracker",

  // "Not for me" picker (PLAN D6). One tap, no free text.
  "pass-label-location": "Location",
  "pass-label-salary": "Pay",
  "pass-label-seniority": "Level",
  "pass-label-stack": "Tech",
  "pass-label-company": "Company",
  "pass-label-role": "Role",
  "pass-label-already-applied": "Already applied",
  "pass-label-other": "Something else",

  // Flag picker (PLAN D26, section 6).
  "flag-label-closed-or-fake": "Closed or not real",
  "flag-label-not-hiring-from-country": "Not open to my country",
  "flag-label-scam": "Scam",
  "flag-label-wrong-details": "Wrong details",
  "flag-label-duplicate": "Duplicate",
  "flag-label-other": "Something else",

  // The fixed "Wrong details" field picker (PLAN section 6).
  "field-label-salary": "Pay",
  "field-label-seniority": "Level",
  "field-label-stack": "Tech",
  "field-label-location": "Location",
  "field-label-eligibility": "Eligibility",

  // ---- Card body ---------------------------------------------------------------------------
  //
  // The "seen live" line is NOT here. It used to be, as a byte copy of `GATE_REASONS`
  // "freshness-ok" and "freshness-never" (`../../gates/reasons.ts`), which are themselves under the
  // parity checker against `brief.json` — so the copies sat in the one table the checker skips.
  // Someone reworking that sentence would have edited the two files CI watches, gone green, and
  // left the Brief and the Telegram card saying it differently. `card.ts` renders the gate's own
  // keys through `renderGateReason` instead, and there is nothing left to drift.
  /**
   * The two labels the card's blocks carry. Twins of `Brief.match.reasonsLabel` and
   * `Brief.match.gapLabel`, and covered by the parity checker as single keys — `Brief.match` holds
   * twenty keys of page furniture, so the pair is these two by name, not the whole namespace.
   *
   * `gap-label` is the word alone. It replaced a `"Gap: {gap}"` here that *duplicated* the web's
   * `"Gap"` rather than matching it, which is the same defect as the freshness copy above: the
   * label drifts, the checker cannot see it, and the Brief and the card disagree. The card lays the
   * label out beside the gap text; the table holds only the word.
   */
  "reasons-label": "Why this one",
  "gap-label": "Gap",
  /**
   * PLAN D13. `{hours}` is the delay that actually elapsed, measured from the job's `first_seen_at`
   * at the moment of sending, never the 24 in `FREE_DELIVERY_DELAY_HOURS`: a job matched two days
   * after it appeared is two days old when it lands, and saying "24 hours" would be a false
   * statement about this particular match.
   */
  "card-late-note": "This post went up {hours}h ago. A pass sends matches the moment they appear.",

  // ---- Prompts and toasts ------------------------------------------------------------------
  "prompt-pass-reason": "What put you off?",
  "prompt-flag-reason": "What's wrong with it?",
  "prompt-flag-field": "Which detail is wrong?",
  "toast-saved": "Saved",
  "toast-unsaved": "Removed from saved",
  "toast-applied": "Marked as applied",
  "toast-passed": "Noted — fewer like this",
  "toast-flagged": "Thanks, we'll check it",
  "toast-flag-limit": "That's a lot of reports today. Try again tomorrow.",
  "toast-stale-card": "This card is out of date. Open your Brief instead.",

  // What the card says once it has been acted on, after the message is edited in place.
  "status-saved": "Saved.",
  "status-applied": "Applied.",
  "status-passed": "Not for me: {reason}.",
  "status-flagged": "Reported: {reason}.",

  // ---- Bot commands ------------------------------------------------------------------------
  "start-connected": "Connected. Your matches will arrive here.",
  "start-token-invalid": "That link has expired or was already used. Open {url} for a fresh one.",
  "start-no-token": "Hi. To get your matches here, connect this chat from {url}.",
  "start-already-connected": "This chat is already connected.",
  /**
   * The chat was connected to a *different* account and now belongs to this one.
   *
   * It has its own line, and not `start-connected`, because a deep link is a bearer credential
   * that anyone can send to anyone: tapping a link an attacker minted from their own settings
   * page silently unbinds the tapper's Telegram and points their chat at the attacker's matches.
   * The move itself is still allowed — refusing would strand a chat on an account nobody can
   * prove they own — but it must never read as an ordinary "Connected".
   */
  "start-moved":
    "Connected. This chat was linked to a different Pemby account, which will no longer receive matches here. If you did not mean to do that, open {url} to reconnect it.",
  /** Sent to the chat that *lost* the binding, so a move is visible from both ends. */
  "start-disconnected":
    "This chat has been disconnected. The account it belonged to is now connected to a different Telegram chat. If that was not you, open {url} to connect this chat again.",
  "pause-done": "Paused. Nothing will be sent until you send /resume.",
  "pause-already": "Delivery is already paused. Send /resume to start again.",
  "resume-done": "Back on. New matches will arrive here.",
  "resume-already": "Delivery is already running.",
  "quiet-set": "Quiet hours {start}-{end}, {timezone}. Matches found inside that window wait.",
  "quiet-cleared": "Quiet hours off.",
  "quiet-none": "No quiet hours set. Send /quiet 22:00 07:00, or set them at {url}.",
  "quiet-usage": "Send /quiet 22:00 07:00 to hold matches overnight, or /quiet off.",
  "quiet-unknown-timezone": "Set your time zone at {url} first, so quiet hours mean your hours.",
  "brief-link": "Your Brief: {url}",
  "help-body":
    "Pemby is AI job-matching software; you apply yourself.\n\n" +
    "/brief - open your Brief\n" +
    "/pause - stop delivery\n" +
    "/resume - start delivery again\n" +
    "/quiet - set quiet hours\n" +
    "/help - this message",
  "command-unknown": "I don't know that one. Send /help for what I do.",
  "pass-link": "Passes are at {url}.",

  // ---- Email ------------------------------------------------------------------------------
  "email-subject-match": "{title} - {company}",
  "email-subject-digest": "Your matches: {count}",
  "email-preheader-match": "{tierReason}",
  "email-cta-apply": "Apply",
  "email-cta-brief": "Open your Brief",
  "email-cta-flag": "Something wrong with this one?",
  "email-unsubscribe": "Stop these emails",
  "email-manage": "Delivery settings",
  "email-footer": "Pemby is AI job-matching software; you apply yourself.",

  // ---- Web push ---------------------------------------------------------------------------
  "push-title-match": "{title} - {company}",
} as const;

/**
 * The card's eligibility verdict, as the Brief words it. Twin of `Brief.tier` in `brief.json`.
 *
 * All five keys, not the two that ship. `white` and `red` can never reach a card (PLAN D2 as
 * amended: they never show), and `renderTierVerdict` is typed so they cannot be asked for — but the
 * parity checker is bidirectional on purpose, and a table that carries only what today's code path
 * uses would report the other three as drift for ever. Completeness here costs three lines;
 * teaching the checker to ignore keys would cost it its second direction.
 *
 * `{country}` is a resolved country *name*, not an ISO code. `resolveReasonParams` does that, the
 * same way `useCountryName` does it on the web, so the card says Moldova and the Brief does too.
 */
export const TIER_VERDICTS = {
  green: "Hires from {country}",
  yellow: "Likely for {country}",
  white: "Unclear for {country}",
  red: "Not open to {country}",
  label: "Eligibility",
} as const;

/**
 * Ways of working, worded. Twin of `Brief.way`, and keyed by the **database** spelling
 * (`b2b_contractor`), because that is what `matches.way_of_working` holds and what the dispatcher
 * reads; `DB_WAYS_OF_WORKING` in `../../profile/enums.ts` is the same list of keys.
 *
 * Here rather than resolved inside the card, because the card renders text and does not translate
 * slugs: `MatchCard.wayOfWorking` is already-worded display text, exactly as `tierReason`,
 * `reasons`, `gap` and `salary` are. The dispatcher resolves it through this table. That keeps one
 * rule for the whole of `MatchCard` instead of one exception, and it puts the labels somewhere the
 * parity checker can see them — which resolving them privately inside `card.ts` would not.
 */
export const WAY_LABELS = {
  b2b_contractor: "B2B contractor",
  eor_employee: "Employee via EOR",
  relocation_visa: "Relocation with a visa",
  freelance: "Freelance",
  local: "Local",
  paid_program: "Paid program",
} as const;

/**
 * The application tracker's column headings (phase 09). Twin of `Tracker.columns` in the web's
 * `messages/en/tracker.json`, under the parity checker like every other table in this file.
 *
 * Here, in the table `check-reasons.ts` watches, and not in `../../tracker/index.ts` beside the
 * mapping, for one reason: the web board and the Telegram card that the `tracker.sync` job edits
 * render the same five headings through two different mechanisms, and phase 08 shipped two
 * defects that were both a string copied out of a watched table. The mapping re-exports these.
 *
 * Wording is PLAN D16: the person applies, so nothing here says placement, recruiter or hired.
 * "Interview" folds `screening` and `interviewing`; "Saved" is a job kept, not an application.
 */
export const TRACKER_COLUMN_LABELS = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
} as const satisfies Record<TrackerColumn, string>;

export type WayLabelKey = keyof typeof WAY_LABELS;

/** The worded way of working for a `way_of_working` value, or null when the post states none. */
export function renderWayLabel(way: string | null): string | null {
  if (way === null) return null;
  return Object.hasOwn(WAY_LABELS, way) ? WAY_LABELS[way as WayLabelKey] : null;
}

export type DeliveryStringKey = keyof typeof DELIVERY_STRINGS;
export const DELIVERY_STRING_KEYS = Object.keys(DELIVERY_STRINGS) as DeliveryStringKey[];

/**
 * English rendering with naive `{param}` substitution, exactly as `renderGateReason` does it.
 *
 * Unlike the reason tables there is no length cap: these are whole messages rather than one line
 * of a stack of reasons, and a cap would cut `help-body` in half. The card's own truncation, in
 * `../card.ts`, is what keeps a message inside Telegram's limit.
 */
export function renderDeliveryString(
  key: DeliveryStringKey,
  params: Record<string, string> = {},
): string {
  return DELIVERY_STRINGS[key].replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? "");
}
