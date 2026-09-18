// One match, rendered. Channel-agnostic and pure: no DB types, no React, no Telegram SDK types, no
// `Date.now()`. The dispatcher builds a `MatchCard` from a row and hands it to whichever channel is
// sending.
//
// **This module is layout, never copy.** Every sentence about the match itself arrives already
// rendered — `tierReason` from `renderGateReason`, `reasons` and `gap` from `renderScoreReason` —
// and the fixed furniture comes from `strings/en.ts`. Nothing here invents a phrase, because a
// phrase invented here would be the one line of the product that no i18n catalogue and no parity
// check can see.
//
// Telegram's limits and how this file meets them:
//
//   - **HTML, never MarkdownV2.** A title like `C#/.NET Dev (Remote!)` breaks unescaped MarkdownV2;
//     HTML needs only three characters escaped and gets them all.
//   - **Escape `<`, `>` and `&`, and nothing else.** `&` goes first or the escaping eats itself.
//   - **4096 characters.** Telegram counts the text after entity parsing, so the raw HTML is the
//     longer of the two and bounding it bounds both. Two mechanisms, and they are not both
//     belt-and-braces: the per-field caps bound ordinary text to around a tenth of the limit, but
//     they count **code points before escaping**, and escaping can quintuple a field (`&` becomes
//     `&amp;`). A title, a company and three reasons that are all nothing but ampersands escape to
//     more than 4096 between them. So `clampToLimit` is the thing that actually holds the limit in
//     the adversarial case, and it holds it by dropping whole lines in a fixed order rather than
//     cutting one, which is why a truncation can never land inside a tag or a half-written entity.
//   - The two measurements use two different units on purpose. A field is capped in **code
//     points**, because that is what keeps a surrogate pair whole; the final clamp measures
//     `String.length`, in **UTF-16 units**, because that is the unit Telegram counts in. Capping in
//     graphemes instead would keep a ZWJ emoji intact but let 120 of them become 1,300 units, and
//     the budget is what has to hold.
//   - Every value is truncated as **plain text and then escaped**, in that order. The other order
//     can slice `&amp;` down the middle and emit markup Telegram refuses.

import type { EligibilityTier } from "../eligibility";
import { renderGateReason } from "../gates";
import { encodeCallbackData } from "./callback";
import { resolveReasonParams } from "./params";
import { renderDeliveryString, TIER_VERDICTS } from "./strings/en";

/** Bot API 10.3: message text is 1-4096 characters after entity parsing. */
export const TELEGRAM_MESSAGE_MAX_CHARS = 4096;

/**
 * Per-field caps, in code points, applied before anything is escaped or assembled.
 *
 * They bound the card at a few hundred characters of ordinary text, which is what keeps the clamp
 * below from ever running on a real match. They do **not** bound it on hostile input: they count
 * the string before escaping, and escaping can multiply a field by five. The clamp is what closes
 * that gap, and it is exercised, not decorative.
 */
const MAX_TITLE = 120;
const MAX_COMPANY = 80;
const MAX_SALARY = 60;
/** "Relocation with a visa" is the longest `WAY_LABELS` entry; the cap is for anything else. */
const MAX_WAY = 40;
/** `MAX_GATE_REASON` and `MAX_SCORE_REASON` are both 120; this leaves room for a longer twin. */
const MAX_REASON = 160;
/** PLAN D6: top three reasons, and no more, whatever the caller passes. */
const MAX_REASONS = 3;

/**
 * The only two tiers a card can carry (PLAN D2 as amended: white and red never show).
 *
 * Narrower than `EligibilityTier` on purpose. `TIER_VERDICTS` words all four so the parity checker
 * stays bidirectional, and this type is what stops the two that must never ship from reaching a
 * reader through the table that happens to contain them.
 */
export type DeliverableTier = Extract<EligibilityTier, "green" | "yellow">;

/**
 * The dot beside the verdict.
 *
 * Ornament, not copy: it is never translated and never read aloud, and it is the reason the verdict
 * is worded beside it. DESIGN.md forbids conveying eligibility by colour alone, so the dot never
 * appears without "Likely for Moldova" or "Hires from Moldova" on the same line.
 */
const TIER_DOT: Record<DeliverableTier, string> = { green: "🟢", yellow: "🟡" };

/**
 * Narrow an eligibility tier to one a card may carry, or null.
 *
 * The dispatcher reads `matches.tier`, which is the full four-value enum, and `selectDueMatches`
 * already refuses white and red — so this returns null on a row that cannot exist. That is the
 * point: PLAN D2's "white and red never show" is then enforced by the compiler at the one place a
 * tier becomes a message, instead of resting on a `where` clause somewhere else staying correct.
 * A null is a skip, not an error.
 */
export function asDeliverableTier(tier: EligibilityTier): DeliverableTier | null {
  return tier === "green" || tier === "yellow" ? tier : null;
}

/** The separator in the meta line. A middot with hair spaces would be prettier and is not portable. */
const META_SEPARATOR = " · ";

/** One match, with every sentence about it already rendered by its own reason table. */
export interface MatchCard {
  matchId: string;
  jobId: string;
  title: string;
  company: string;
  /** Where the Apply button goes: `jobs.apply_url` when there is one, else `jobs.url`. */
  url: string;
  /** Green or yellow only — white and red never reach anyone (PLAN D2 as amended 2026-09-17). */
  tier: DeliverableTier;
  /**
   * The user's residence country, ISO 3166-1 alpha-2. The only unworded value on this card, and it
   * is here rather than pre-resolved because the verdict line is built from `TIER_VERDICTS` and has
   * to fill `{country}` with a name — "Likely for Moldova", never "Likely for MD". `params.ts` does
   * the resolving, from the same `Intl.DisplayNames` table the Brief reads.
   */
  country: string;
  /** Already rendered by `renderGateReason`. */
  tierReason: string;
  /** Already rendered by `renderScoreReason`. At most three are shown. */
  reasons: string[];
  /** Already rendered by `renderScoreReason`, or null when the score found no gap. */
  gap: string | null;
  /** Already formatted for display ("$90k-$120k / year"), or null when the post lists no pay. */
  salary: string | null;
  /**
   * Worded way of working ("B2B contractor"), or null when the post states none.
   *
   * Already resolved, like every other sentence on this card: the dispatcher maps
   * `matches.way_of_working` through `WAY_LABELS` in `./strings/en.ts`. The segment is omitted when
   * null rather than rendered empty.
   */
  wayOfWorking: string | null;
  /**
   * When the post was last confirmed live on the company's own board, or null if it never was.
   *
   * Nullable because the source is: `jobs.last_verified_live_at` is nullable and `DueMatch` carries
   * it through as `Date | null`. It used to be a non-null `Date` here, which was a type seam with
   * nothing bridging it — and a null arriving through it rendered "Seen live ... NaNh ago", a
   * sentence that is worse than the honest "not yet confirmed".
   */
  verifiedLiveAt: Date | null;
  /** A free-tier match sent after the delay, which makes it carry the PLAN D13 upgrade note. */
  late: boolean;
  /**
   * Hours between the job's `first_seen_at` and this send — **measured, not assumed**. PLAN D13's
   * note says how old this post actually is; `FREE_DELIVERY_DELAY_HOURS` is the floor the
   * dispatcher waits, not a claim about any particular match.
   *
   * If this is not a finite number the note is left off the card entirely. A disclosure carrying a
   * figure that is wrong is worse than one that is absent.
   */
  delayHours: number;
}

export type CardButtonKind = "url" | "callback";

/**
 * One button, described rather than built. Telegram's `InlineKeyboardButton` and an email's anchor
 * are both a label plus a destination, and neither the SDK's types nor its imports belong in core.
 */
export interface CardButton {
  label: string;
  kind: CardButtonKind;
  /** An absolute URL when `kind` is `"url"`, `encodeCallbackData` output when `"callback"`. */
  payload: string;
}

export type KeyboardRow = CardButton[];

/** Context the pass URL needs. Kept out of `MatchCard` so a card is only ever about the match. */
export interface CardLinks {
  /** Absolute URL of the passes page, for the PLAN D13 note. No trailing slash. */
  passUrl: string;
}

/**
 * Truncate by code point, not by UTF-16 unit: `"👩‍💻 Engineer".slice(0, 1)` leaves half a surrogate
 * pair, which is an unpaired code unit in the message body and a rendering bug on every client.
 * Cuts at the last space inside the budget when there is one, so a word is not sliced in half.
 */
function truncatePlain(value: string, max: number): string {
  const chars = Array.from(value);
  if (chars.length <= max) return value;
  const head = chars.slice(0, Math.max(1, max - 1)).join("");
  const lastSpace = head.lastIndexOf(" ");
  const body = lastSpace > max / 2 ? head.slice(0, lastSpace) : head;
  return `${body.trimEnd()}…`;
}

/** The only three characters Telegram's HTML parse mode needs escaped. `&` first, or it recurses. */
function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** Truncate, then escape. Never the other way round. */
function field(value: string, max: number): string {
  return escapeHtml(truncatePlain(value, max));
}

/**
 * Whole hours between two instants, or null if the answer is not a number.
 *
 * `Math.max(0, NaN)` is `NaN`, so a floor is not a guard: an invalid `Date` on either side went
 * straight through it and printed "NaNh ago". Every caller here now has to decide what to say when
 * there is no number, which is the point — silently printing one that is wrong is the failure that
 * matters most on the PLAN D13 line.
 */
function hoursBetween(from: Date | null, to: Date): number | null {
  if (from === null) return null;
  const hours = Math.round((to.getTime() - from.getTime()) / 3_600_000);
  return Number.isFinite(hours) ? Math.max(0, hours) : null;
}

/** The same guard for a number that arrived on the card rather than being computed from two dates. */
function wholeHours(value: number): number | null {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function freshnessLine(hours: number | null): string {
  return hours === null
    ? renderGateReason("freshness-never", {})
    : renderGateReason("freshness-ok", { hours: String(hours) });
}

export interface MetaLineOptions {
  /**
   * Include the company. Default true.
   *
   * False for a surface that has already named it on the line above — the push and email-text
   * headline is `title — company`, so repeating it in the meta line would say it twice. It is the
   * one thing that genuinely differs between the two layouts, which is why it is an option here
   * rather than a second copy of the joining somewhere else.
   */
  company?: boolean;
}

/**
 * `LiveKit · $135K – $300K · B2B contractor` — whichever of the three the post actually has.
 *
 * Plain text, capped per segment; the caller escapes. A null salary or way of working drops its
 * segment rather than leaving an empty one between two separators.
 *
 * Exported for the same reason `renderFreshnessLine` is: all three channels show this line, and
 * none of them should be deciding on its own which fields go in it, in what order, with what
 * separator, cut at what length. The *words* were already shared and parity-checked; it is the
 * joining that had started to exist in three places, and joining is where the last two defects in
 * this phase lived.
 */
export function renderMetaLine(card: MatchCard, options: MetaLineOptions = {}): string {
  return [
    options.company === false ? null : truncatePlain(card.company, MAX_COMPANY),
    card.salary === null ? null : truncatePlain(card.salary, MAX_SALARY),
    card.wayOfWorking === null ? null : truncatePlain(card.wayOfWorking, MAX_WAY),
  ]
    .filter((part): part is string => part !== null)
    .join(META_SEPARATOR);
}

/**
 * "Likely for Moldova" / "Hires from Moldova", from `TIER_VERDICTS`.
 *
 * The country arrives as an ISO code and leaves as a name, through the same `Intl.DisplayNames`
 * table the Brief reads. This is the one line on the card built from a template rather than handed
 * over finished, and the template is parity-checked against `Brief.tier`.
 *
 * **The words only — no dot.** The mark beside them is each channel's own business: Telegram uses
 * an emoji, the email a coloured disc, because an emoji is a font-availability gamble in a mail
 * client. What must not vary is the sentence, and what must not happen is the mark appearing
 * without it (DESIGN.md forbids conveying eligibility by colour alone). Returning the verdict
 * undecorated is what lets both channels satisfy that rule from one string.
 */
export function renderTierVerdict(card: MatchCard): string {
  const { country } = resolveReasonParams({ country: card.country });
  return TIER_VERDICTS[card.tier].replace("{country}", country ?? card.country);
}

/**
 * "Seen live on the company's own board 3h ago", or "Not yet confirmed live on the company's own
 * board" when the post never was. Plain text; the caller escapes it for whatever it is putting it in.
 *
 * Exported because all three channels need this one line and none of them should build it: it comes
 * from `GATE_REASONS` through `renderGateReason`, which is the freshness gate's own sentence and has
 * a twin in `brief.json` that the parity checker watches. The delivery table used to hold a byte
 * copy of both halves, in the one place the checker does not look.
 *
 * It is also the only correct handling of a null `verifiedLiveAt`, which is what the column and
 * `DueMatch` actually carry. Formatting the hours at a call site brings back the `NaNh ago` that
 * `hoursBetween` exists to prevent.
 */
export function renderFreshnessLine(verifiedLiveAt: Date | null, now: Date): string {
  return freshnessLine(hoursBetween(verifiedLiveAt, now));
}

interface CardLine {
  text: string;
  /**
   * Drop order under length pressure: lower goes first. A line with no rank is never dropped.
   *
   * Ranked rather than a boolean because not everything droppable is equally droppable. The PLAN
   * D13 late note is a **disclosure** — it states how old the post is, and a card that quietly
   * loses it is a card that misrepresents itself — so it carries no rank at all, while the gap,
   * which is useful but says nothing the reader is owed, goes first. Under the old boolean the note
   * was merely last in the list, which made it the first thing the second pass reached.
   */
  drop?: number;
}

/** Drop ranks, lowest dropped first. Named so the priority is readable rather than inferred. */
const DROP_GAP = 1;
const DROP_PASS_LINK = 2;
const DROP_REASONS = 3;

/**
 * Assemble, guaranteeing the limit.
 *
 * Optional lines go first, from the end; then trailing lines; and if even one line is somehow over
 * the limit on its own, the markup is abandoned for an escaped plain-text stub. That last branch is
 * unreachable while the caps above hold, and it is here so that "emits a string Telegram rejects"
 * is not a state this function can reach at all.
 */
function clampToLimit(lines: CardLine[], fallback: string, limit: number): string {
  const kept = [...lines];
  const length = () => kept.reduce((n, line) => n + line.text.length + 1, -1);

  // Droppable lines leave in rank order, and within a rank from the end, so a block goes as a block.
  const ranks = [...new Set(kept.map((line) => line.drop).filter((r) => r !== undefined))].sort(
    (a, b) => a - b,
  );
  for (const rank of ranks) {
    if (length() <= limit) break;
    for (let i = kept.length - 1; i >= 0; i--) {
      if (kept[i]?.drop === rank) kept.splice(i, 1);
    }
  }
  // Only once everything droppable has gone: trailing lines, which by now are all load-bearing.
  while (kept.length > 1 && length() > limit) kept.pop();

  const text = kept.map((line) => line.text).join("\n");
  if (text.length <= limit) return text;
  // Escaping can grow a string fivefold (`&` -> `&amp;`), so the plain input is cut to a fraction
  // of the budget before it is escaped.
  return escapeHtml(truncatePlain(fallback, Math.floor(limit / 8)));
}

/**
 * The Telegram message body for one match: layout A, "the ledger", as the owner approved it.
 *
 *     Senior Product Engineer                            <- bold
 *     LiveKit · $135K – $300K · B2B contractor
 *
 *     🟡 Likely for Moldova                              <- bold
 *     The post names EMEA, which may include Moldova.
 *     Seen live on the company's own board 1h ago.
 *
 *     Why this one                                       <- italic
 *     • Matches what the post asks for: TypeScript, Go.
 *     • Close to the roles on your CV.
 *
 *     Gap  You haven't worked in developer-tools, ai.    <- "Gap" italic
 *
 * Why it is shaped this way, so that a later edit keeps the shape rather than the lines:
 *
 *   - **Bold falls exactly twice**, on the role and on the verdict, because those are the two
 *     things a reader scans for. A third bold would cost the other two their meaning.
 *   - Company, pay and engagement are **one meta line** under the title: they are read together or
 *     not at all, and pay stranded at the bottom is pay nobody sees.
 *   - The freshness line sits **inside the tier block**, not at the end. "Likely for Moldova",
 *     because of this, seen live this recently — one claim, its reason and its currency, together.
 *   - The dot never carries the tier alone (DESIGN.md).
 *
 * Everything around the arrangement is unchanged and is not up for rearranging: the escaping, the
 * per-field caps, the code-point truncation, the ranked clamp, the rule that no sentence is written
 * in this file, and the D13 note's refusal to state a figure it does not have.
 */
export function renderTelegramHtml(card: MatchCard, now: Date, links?: CardLinks): string {
  const hours = hoursBetween(card.verifiedLiveAt, now);

  const lines: CardLine[] = [
    { text: `<b>${field(card.title, MAX_TITLE)}</b>` },
    { text: escapeHtml(renderMetaLine(card)) },
    { text: "" },
    { text: `<b>${TIER_DOT[card.tier]} ${escapeHtml(renderTierVerdict(card))}</b>` },
    { text: field(card.tierReason, MAX_REASON) },
    { text: escapeHtml(freshnessLine(hours)) },
  ];

  const reasons = card.reasons.slice(0, MAX_REASONS);
  if (reasons.length > 0) {
    lines.push({ text: "", drop: DROP_REASONS });
    lines.push({
      text: `<i>${escapeHtml(renderDeliveryString("reasons-label"))}</i>`,
      drop: DROP_REASONS,
    });
    for (const reason of reasons) {
      lines.push({ text: `• ${field(reason, MAX_REASON)}`, drop: DROP_REASONS });
    }
  }

  if (card.gap !== null) {
    lines.push({ text: "", drop: DROP_GAP });
    lines.push({
      text: `<i>${escapeHtml(renderDeliveryString("gap-label"))}</i>  ${field(card.gap, MAX_REASON)}`,
      drop: DROP_GAP,
    });
  }

  // PLAN D13. The note states the delay that actually elapsed, so if that number is not a number
  // the note does not go out: a disclosure with the wrong figure in it is worse than none.
  const delayHours = wholeHours(card.delayHours);
  if (card.late && delayHours !== null) {
    lines.push({ text: "" });
    lines.push({
      text: escapeHtml(renderDeliveryString("card-late-note", { hours: String(delayHours) })),
    });
    if (links) {
      lines.push({
        text: escapeHtml(renderDeliveryString("pass-link", { url: links.passUrl })),
        drop: DROP_PASS_LINK,
      });
    }
  }

  return clampToLimit(lines, `${card.title} - ${card.company}`, TELEGRAM_MESSAGE_MAX_CHARS);
}

/**
 * The same match, headline-first: the text part of an email, and the body of a web push
 * notification.
 *
 *     Senior Product Engineer — LiveKit
 *     Likely for Moldova. The post names EMEA, which may include Moldova.
 *     Matches what the post asks for: TypeScript, Go. Close to the roles on your CV.
 *     Gap  You haven't worked in developer-tools, ai.
 *     $135K – $300K · B2B contractor
 *     Seen live on the company's own board 1h ago.
 *     https://...
 *
 * Not the ledger. A push notification is read in two seconds on a lock screen and is cut off by the
 * operating system, not by us, so the claim comes first and the reasons run together as prose
 * rather than stacking as bullets. Nothing is *omitted* — an email's text part is the accessible
 * copy of the HTML and has to carry the same facts — it is only ordered for a reader who may stop
 * after the first line.
 *
 * No escaping, because there is no markup to protect. The same caps, because the same values can be
 * arbitrarily long.
 */
export function renderPlainText(card: MatchCard, now: Date, links?: CardLinks): string {
  const hours = hoursBetween(card.verifiedLiveAt, now);
  const parts: string[] = [
    `${truncatePlain(card.title, MAX_TITLE)} — ${truncatePlain(card.company, MAX_COMPANY)}`,
    `${renderTierVerdict(card)}. ${truncatePlain(card.tierReason, MAX_REASON)}`,
  ];

  const reasons = card.reasons.slice(0, MAX_REASONS);
  if (reasons.length > 0) {
    parts.push(reasons.map((reason) => truncatePlain(reason, MAX_REASON)).join(" "));
  }
  if (card.gap !== null) {
    parts.push(`${renderDeliveryString("gap-label")}  ${truncatePlain(card.gap, MAX_REASON)}`);
  }

  // The company is already in the headline above, so it is left out of the meta line here — the
  // one difference between the two layouts, and an argument rather than a second implementation.
  const meta = renderMetaLine(card, { company: false });
  if (meta !== "") parts.push(meta);

  parts.push(freshnessLine(hours));
  parts.push(card.url);

  // Same rule as the HTML body: no number, no note.
  const delayHours = wholeHours(card.delayHours);
  if (card.late && delayHours !== null) {
    parts.push("");
    parts.push(renderDeliveryString("card-late-note", { hours: String(delayHours) }));
    if (links) parts.push(renderDeliveryString("pass-link", { url: links.passUrl }));
  }

  return parts.join("\n");
}

const button = (label: string, kind: CardButtonKind, payload: string): CardButton => ({
  label,
  kind,
  payload,
});

/** The buttons on a fresh card. */
export function buildKeyboard(card: MatchCard): KeyboardRow[] {
  return [
    [button(renderDeliveryString("button-apply"), "url", card.url)],
    [
      button(
        renderDeliveryString("button-save"),
        "callback",
        encodeCallbackData("save", card.matchId),
      ),
      button(
        renderDeliveryString("button-applied"),
        "callback",
        encodeCallbackData("applied", card.matchId),
      ),
    ],
    [
      button(
        renderDeliveryString("button-not-for-me"),
        "callback",
        encodeCallbackData("pass", card.matchId),
      ),
      button(
        renderDeliveryString("button-flag"),
        "callback",
        encodeCallbackData("flag", card.matchId),
      ),
    ],
  ];
}

/**
 * The "Not for me" picker (PLAN D6). Two per row, `Back` last, so the whole set fits a phone.
 *
 * Here rather than in the bot for the same reason the card is: which answers exist and what they
 * are called is layout and copy, and the bot should not be spelling either.
 */
export function buildPassReasonKeyboard(matchId: string): KeyboardRow[] {
  return pairs([
    button(
      renderDeliveryString("pass-label-location"),
      "callback",
      encodeCallbackData("pass-location", matchId),
    ),
    button(
      renderDeliveryString("pass-label-salary"),
      "callback",
      encodeCallbackData("pass-salary", matchId),
    ),
    button(
      renderDeliveryString("pass-label-seniority"),
      "callback",
      encodeCallbackData("pass-seniority", matchId),
    ),
    button(
      renderDeliveryString("pass-label-stack"),
      "callback",
      encodeCallbackData("pass-stack", matchId),
    ),
    button(
      renderDeliveryString("pass-label-company"),
      "callback",
      encodeCallbackData("pass-company", matchId),
    ),
    button(
      renderDeliveryString("pass-label-role"),
      "callback",
      encodeCallbackData("pass-role", matchId),
    ),
    button(
      renderDeliveryString("pass-label-already-applied"),
      "callback",
      encodeCallbackData("pass-already-applied", matchId),
    ),
    button(
      renderDeliveryString("pass-label-other"),
      "callback",
      encodeCallbackData("pass-other", matchId),
    ),
    button(renderDeliveryString("button-back"), "callback", encodeCallbackData("back", matchId)),
  ]);
}

/** The flag picker (PLAN D26, section 6). */
export function buildFlagReasonKeyboard(matchId: string): KeyboardRow[] {
  return pairs([
    button(
      renderDeliveryString("flag-label-closed-or-fake"),
      "callback",
      encodeCallbackData("flag-closed-or-fake", matchId),
    ),
    button(
      renderDeliveryString("flag-label-not-hiring-from-country"),
      "callback",
      encodeCallbackData("flag-not-hiring-from-country", matchId),
    ),
    button(
      renderDeliveryString("flag-label-scam"),
      "callback",
      encodeCallbackData("flag-scam", matchId),
    ),
    button(
      renderDeliveryString("flag-label-wrong-details"),
      "callback",
      encodeCallbackData("flag-wrong-details", matchId),
    ),
    button(
      renderDeliveryString("flag-label-duplicate"),
      "callback",
      encodeCallbackData("flag-duplicate", matchId),
    ),
    button(
      renderDeliveryString("flag-label-other"),
      "callback",
      encodeCallbackData("flag-other", matchId),
    ),
    button(renderDeliveryString("button-back"), "callback", encodeCallbackData("back", matchId)),
  ]);
}

/** The fixed "Wrong details" field picker (PLAN section 6). No free text, by design. */
export function buildFlagFieldKeyboard(matchId: string): KeyboardRow[] {
  return pairs([
    button(
      renderDeliveryString("field-label-salary"),
      "callback",
      encodeCallbackData("field-salary", matchId),
    ),
    button(
      renderDeliveryString("field-label-seniority"),
      "callback",
      encodeCallbackData("field-seniority", matchId),
    ),
    button(
      renderDeliveryString("field-label-stack"),
      "callback",
      encodeCallbackData("field-stack", matchId),
    ),
    button(
      renderDeliveryString("field-label-location"),
      "callback",
      encodeCallbackData("field-location", matchId),
    ),
    button(
      renderDeliveryString("field-label-eligibility"),
      "callback",
      encodeCallbackData("field-eligibility", matchId),
    ),
    button(renderDeliveryString("button-back"), "callback", encodeCallbackData("back", matchId)),
  ]);
}

/** Two buttons to a row, the odd one out on a row of its own. */
function pairs(buttons: CardButton[]): KeyboardRow[] {
  const rows: KeyboardRow[] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  return rows;
}
