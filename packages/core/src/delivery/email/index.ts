// The email rendering of a match card.
//
// Same card, same order, same sentences as the Telegram message — the owner approved that layout as
// a **ledger**, and an email that reordered it would be a second product. What changes is only what
// the medium forces: a table instead of a stack of lines, literal hex instead of custom properties,
// and a footer carrying the two links an inbox needs and a chat does not.
//
// **No React, no `react-email`, no new dependency.** `@pemby/core` has one runtime dependency
// (`zod`) and the worker that calls this cannot use React, so the body is built as a string. That
// is not a limitation worth apologising for: every serious email template ends up as inline-styled
// tables whatever produced them, and producing them from a string makes the escaping visible.
//
// What an email client will do to this markup, and what the template does about it:
//
//   - **It strips the head.** Gmail drops `<style>` from the body, Outlook's Word engine ignores
//     most of it, and no client fetches a stylesheet. Every rule here is an inline `style`
//     attribute, and nothing depends on a `<style>` block existing.
//   - **It has no web fonts.** This is the one rule of `DESIGN.md` an email cannot literally keep.
//     The product is one family, Hanken Grotesk, loaded through `next/font`; an inbox has no
//     `@font-face` worth relying on and no `next/font`, so the family is *named* first — a client
//     that happens to have it installed honours the One Family rule exactly — and everything after
//     it is a system grotesk. What the stack must never do is fork: there is no monospace anywhere
//     in this world, so prose falls back to the same grotesk as the headings rather than to Menlo.
//     One stack, one voice, in whichever family the client can actually find.
//   - **It does not do flexbox or grid.** Layout is `<table role="presentation">` with `cellpadding`
//     and `cellspacing` zeroed, one 600px column, fluid below that.
//   - **It has no SVG and no icon font.** The tier marker is an authored single-stroke drawing in
//     the product; here it is the nearest character — a check, an "approximately" tilde — set in
//     the tile's own `on-` colour. It is ornament either way: the tinted pill beside it carries the
//     verdict in words, so a client that renders the glyph badly loses decoration, not meaning.
//   - **It may invert the colours.** Dark mode in Apple Mail and Outlook re-colours anything it can
//     reason about, and it reasons badly about a background it cannot see. So `color-scheme` is
//     declared light in three places *and* every element that sets a colour also sets its own
//     background: an inverted background then still has legible text on it, which is the failure
//     mode worth designing for. There is deliberately no `prefers-color-scheme` block: the head it
//     would live in is the first thing Gmail throws away, and a dark treatment that only half the
//     inboxes apply is worse than one honest light rendering.
//   - **It has no `box-shadow`.** In the product a white card is separated from the white sheet by
//     one soft wide shadow, and Outlook draws no shadow at all. So the separation is done the other
//     way `DESIGN.md` allows — the tonal step from the sheet to the near-black band. The band is
//     the page here, and the card stands on it, which is the north star's own arrangement.
//   - **It rounds fractional pixels and ignores `border-radius`.** Outlook squares every corner, so
//     the 24px card and the fully-rounded pills come out sharp there. The design survives that:
//     they are still a card and still pills, just cut square.
//
// `DESIGN.md` is binding on the colour *choices*; an email cannot read `var(--color-ink)`, so each
// token below is resolved to the literal light-mode hex `packages/ui/src/tokens.css` lists.

import {
  renderFreshnessLine,
  renderMetaLine,
  renderPlainText,
  renderTierVerdict,
  type MatchCard,
} from "../card";
import type { EligibilityTier } from "../../eligibility";
import { renderDeliveryString, type DeliveryStringKey } from "../strings/en";
import { attr, escapeHtml, field, oneLine, safeUrl, subjectLine, truncatePlain } from "./html";

/**
 * Everything the template needs that is not about the match.
 *
 * Every URL arrives ready to use. Signing an unsubscribe link, a flag link or anything else that
 * has to survive a round trip through someone's inbox is the caller's job — this package is pure
 * and has no secret to sign with.
 */
export interface EmailContext {
  /** Absolute base URL of the web app, no trailing slash. */
  appUrl: string;
  /** The passes page, for the PLAN D13 note on a late free-tier match. */
  passUrl: string;
  /**
   * Where "Stop these emails" in the **body** goes: the `/unsubscribe` page, which renders a button.
   *
   * **Not the RFC 8058 one-click target, and one field cannot be both.** The `List-Unsubscribe`
   * header has to name the POST endpoint, and that endpoint answers 405 to a GET on purpose — a GET
   * that unsubscribed people would be followed by every link scanner and pre-rendering inbox that
   * ever read the message. The body therefore needs the page and the header needs the route. The
   * header is the sender's to set (Resend takes it through its generic `headers` field; there is no
   * dedicated API field), and this template never sees it: nothing in the body is built from it, so
   * carrying it here would be a field the renderer reads nowhere.
   */
  unsubscribeUrl: string;
  /** Where "Something wrong with this one?" goes for this match. */
  flagUrl: string;
  /**
   * Explicit clock, as everywhere else in this package.
   *
   * The only instant this template needs, because the only time it prints is the elapsed count in
   * `renderFreshnessLine` — "seen live 3h ago", the same sentence on every channel. There is no
   * recipient time zone here on purpose: an email is the one channel that could print an absolute
   * local time well, and doing so would make this surface say something the approved card does not.
   */
  now: Date;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// ---- Resolved design tokens ------------------------------------------------------------------
//
// The light values of `packages/ui/src/tokens.css`, flattened to opaque hex. Two of them cannot
// survive the trip literally — `line` is `rgb(16 16 16 / 0.12)` and the footer's tagline is
// `on-band` at 0.74 — and an alpha colour over a background a dark-mode client cannot see is
// exactly what it mis-reasons about, so both are composited here instead.

/**
 * The near-black band the sheet stands on, which here is the page itself.
 *
 * In the product the band shows above and under the white sheet and the sheet is lifted off it by
 * a soft wide shadow. An email has no shadow worth naming, so the band does the whole job: it is
 * the tonal step that gives a white card its edge, and it is the ground the wordmark and the footer
 * are set on, exactly as they are on a Pemby page.
 */
const BAND = "#0b0b0b";
const ON_BAND = "#ffffff";
/** `on-band` at the footer tagline's 0.74 opacity, composited over the band. */
const ON_BAND_SOFT = "#c0c0c0";
/** The white sheet, and every block drawn on it. */
const CARD = "#ffffff";
const INK = "#101010";
const INK_SOFT = "#6e6e73";
/** Recessed grey: the tag pill, and the quieter fill that replaced the dashed "not yet" stroke. */
const SURFACE = "#f2f2f3";
/** `line`, composited over the card: the 1px hairline between rows. */
const LINE = "#e2e2e2";
/** The solid edge the white tier tile is drawn with, having no fill to stand on. */
const LINE_STRONG = "#101010";
/** The only colour sanctioned inside an ink fill: the black pill's label. */
const GROUND = "#ffffff";

/**
 * How a tier is painted, in the four parts the Never Colour Alone rule asks for.
 *
 * A solid tile, the tier's own marker inside it, a tinted pill, and the pill's words — and the
 * words are the half that carries the verdict, which is why `renderTierVerdict` is never decorated
 * anywhere but here.
 */
interface TierPaint {
  /** The solid accent the tile is filled with. An accent is a whole shape, never a wash. */
  fill: string;
  /** The tile's paired `on-` colour: the only one sanctioned inside that fill. */
  onFill: string;
  /** The pill's tint — the single tinted fill this world allows. */
  tint: string;
  onTint: string;
  /** The tier's marker, as a character. An inbox has no SVG; see the note at the top of the file. */
  mark: string;
  /**
   * The edges, when the tier has one, as ready-made declarations.
   *
   * They live in the table rather than in a `tier === "white"` at the call site because
   * `MatchCard["tier"]` is narrowed to the two tiers that ship and such a comparison is dead code
   * the compiler refuses. A tier that needs an edge says so here, where the rest of its paint is.
   */
  tileEdge: string;
  pillEdge: string;
}

/**
 * PLAN D2 as amended: only green and yellow are ever delivered, and `MatchCard["tier"]` is narrowed
 * to those two so the compiler agrees. The other two are here so the table is total rather than
 * defaulting a colour it was not given — and red in particular is a blocker colour, never a
 * verdict, so its row exists only to keep the vocabulary complete.
 */
const TIER: Record<EligibilityTier, TierPaint> = {
  // It says your country: a check.
  green: {
    fill: "#17a35b",
    onFill: "#ffffff",
    tint: "#dff5e9",
    onTint: "#0b6b3a",
    mark: "&#10003;",
    tileEdge: "",
    pillEdge: "",
  },
  // It only implies your country: the "approximately" mark. Near-black on yellow, always —
  // white on #ffc629 is 1.57:1.
  yellow: {
    fill: "#ffc629",
    onFill: "#101010",
    tint: "#fff0c9",
    onTint: "#6b4a00",
    mark: "&#8776;",
    tileEdge: "",
    pillEdge: "",
  },
  // It says nothing either way: a question. The only tier with no fill to stand on, so it is the
  // only one drawn with an edge — solid, as everything in this world is.
  white: {
    fill: "#ffffff",
    onFill: "#101010",
    tint: "#f2f2f3",
    onTint: "#45454a",
    mark: "?",
    tileEdge: `border:2px solid ${LINE_STRONG};`,
    pillEdge: `border:1px solid ${LINE};`,
  },
  // Ruled out. Never drawn as a verdict; here so the table is total.
  red: {
    fill: "#f03a3f",
    onFill: "#ffffff",
    tint: "#ffe2e3",
    onTint: "#a01216",
    mark: "&#215;",
    tileEdge: "",
    pillEdge: "",
  },
};

/**
 * The one family, then the nearest grotesks an inbox already has.
 *
 * There is no second stack. `DESIGN.md` has no serif and no monospace at any size, so prose, meta
 * lines, counts and labels all take this one — the contrast in this world is weight and scale,
 * never family, and that much an email can keep literally.
 */
const GROTESK =
  "'Hanken Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";

// ---- Per-field caps --------------------------------------------------------------------------
//
// Looser than the Telegram card's, because an email has no 4096-character ceiling, and present for
// the other reason those exist: a 4,000-character "title" from a badly parsed post should make a
// long line, not a wall.

const MAX_TITLE = 140;
/** Only the subject needs this now; the meta line is capped by `renderMetaLine`. */
const MAX_COMPANY = 100;
const MAX_REASON = 200;
const MAX_REASONS = 3;
/** Long enough not to cut a real role name, short enough that no client truncates mid-word. */
const MAX_SUBJECT = 120;
const MAX_PREHEADER = 140;

/**
 * Where a URL goes inside an already-escaped sentence.
 *
 * `pass-link` reads "Passes are at {url}.", and the link has to be a link. Substituting the anchor
 * before escaping would escape the anchor; substituting after escaping means finding the slot in
 * the escaped string, so the slot is a character that escaping cannot produce and that no copy
 * contains. U+0001 is both.
 */
const URL_SLOT = "";

/** Every anchor names its own background, for the same reason every other coloured element does. */
function anchor(url: string, label: string, color: string, background: string): string {
  return (
    `<a${attr("href", url)} style="color:${color};background-color:${background};` +
    `text-decoration:underline;">${label}</a>`
  );
}

/**
 * A delivery string whose `{url}` becomes a real link, escaped as a whole and linked afterwards.
 *
 * A URL that does not pass `safeUrl` leaves the sentence without its link rather than with a dead
 * or dangerous one.
 */
function sentenceWithLink(
  key: DeliveryStringKey,
  url: string,
  color: string,
  background: string,
  params: Record<string, string> = {},
): string {
  const escaped = escapeHtml(renderDeliveryString(key, { ...params, url: URL_SLOT }));
  const safe = safeUrl(url);
  return escaped.replace(URL_SLOT, safe ? anchor(safe, escapeHtml(safe), color, background) : "");
}

/** `appUrl` plus a path, tolerant of the trailing slash `EmailContext` says will not be there. */
function pageUrl(appUrl: string, path: string): string {
  return `${appUrl.replace(/\/+$/, "")}${path}`;
}

/**
 * A hairline, as a table row: `<hr>` is styled differently by every client.
 *
 * Solid, 1px, and the only stroke inside the card. Nothing in this world is dashed or dotted.
 */
function rule(topPad: number, bottomPad: number): string {
  return (
    `<tr><td style="padding:${topPad}px 0 ${bottomPad}px 0;background-color:${CARD};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `<tr><td style="height:1px;line-height:1px;font-size:1px;background-color:${LINE};">&nbsp;</td></tr>` +
    `</table></td></tr>`
  );
}

/**
 * A reason, as the tag pill the Brief draws it with: recessed grey, ink, fully rounded.
 *
 * A table rather than an inline-block so it shrink-wraps its sentence in Word's engine too, and so
 * the fill is on a `<td>` that every client paints.
 */
function tagPill(text: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td bgcolor="${SURFACE}" style="padding:7px 13px;background-color:${SURFACE};` +
    `border-radius:999px;font-family:${GROTESK};font-size:13px;font-weight:500;line-height:1.35;` +
    `color:${INK};overflow-wrap:anywhere;word-break:break-word;">${text}</td></tr></table>`
  );
}

/**
 * The eligibility verdict: a solid tier tile carrying that tier's marker, and beside it the tinted
 * pill that says the verdict in words, with the reason and the freshness line under it.
 *
 * All four parts at once, which is the Never Colour Alone rule — the tile is the fill, the marker
 * is the shape, the pill is the tint, and the words are what a reader who cannot tell green from
 * yellow actually reads. The two-column table is the Brief card's own grid: the tile is a column,
 * not a bullet, and everything it governs sits in the column beside it.
 */
function verdictBlock(card: MatchCard, ctx: EmailContext): string {
  const paint = TIER[card.tier];

  const tile =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td width="48" height="48" align="center" valign="middle" bgcolor="${paint.fill}" ` +
    `style="width:48px;height:48px;background-color:${paint.fill};border-radius:14px;` +
    `font-family:${GROTESK};font-size:24px;font-weight:700;line-height:48px;` +
    `color:${paint.onFill};${paint.tileEdge}">${paint.mark}</td>` +
    `</tr></table>`;

  const pill =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td bgcolor="${paint.tint}" style="padding:5px 12px;background-color:${paint.tint};` +
    `border-radius:999px;font-family:${GROTESK};font-size:13px;font-weight:700;line-height:1.35;` +
    `color:${paint.onTint};${paint.pillEdge}">${escapeHtml(renderTierVerdict(card))}</td>` +
    `</tr></table>`;

  const under = (style: string, content: string, topPad: number): string =>
    `<div style="padding-top:${topPad}px;font-family:${GROTESK};background-color:${CARD};` +
    `overflow-wrap:anywhere;word-break:break-word;${style}">${content}</div>`;

  return (
    `<tr><td style="background-color:${CARD};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td width="48" valign="top" style="width:48px;padding:0 20px 0 0;background-color:${CARD};">` +
    tile +
    `</td>` +
    `<td valign="top" style="background-color:${CARD};">` +
    pill +
    under(
      `font-size:15px;line-height:1.5;color:${INK_SOFT};`,
      field(card.tierReason, MAX_REASON),
      12,
    ) +
    under(
      `font-size:13px;line-height:1.5;color:${INK_SOFT};`,
      escapeHtml(renderFreshnessLine(card.verifiedLiveAt, ctx.now)),
      8,
    ) +
    `</td></tr></table></td></tr>`
  );
}

/** The one primary action, built the way an email button has to be built to survive Outlook. */
function applyButton(url: string): string {
  const safe = safeUrl(url);
  if (!safe) return "";
  const label = escapeHtml(renderDeliveryString("email-cta-apply"));
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td align="center" bgcolor="${INK}" style="background-color:${INK};border-radius:999px;">` +
    `<a${attr("href", safe)} style="display:inline-block;padding:16px 24px;font-family:${GROTESK};` +
    `font-size:16px;font-weight:700;line-height:1;color:${GROUND};background-color:${INK};` +
    `text-decoration:none;border-radius:999px;">${label}</a>` +
    `</td></tr></table>`
  );
}

/**
 * The PLAN D13 note, in the recessed grey the No Dash rule leaves for a state that is not reached.
 *
 * It used to be a dashed stroke, on the reasoning that a dash meant "not yet". This world refuses
 * a dashed edge anywhere, for anything, and names the replacement itself: a quieter fill. So the
 * note is the picker panel's shape — surface, 20px, ink — a block that is plainly subordinate to
 * the white card above it without being harder to read than it.
 *
 * Returns nothing when `delayHours` is not a finite number, which is the same rule `../card.ts`
 * applies and for the same reason: the note's whole job is to state how old this post is, and a
 * disclosure that states the wrong figure is worse than one that is absent. `Math.round(NaN)` is
 * `NaN` and `Math.max(0, NaN)` is `NaN`, so a floor is not a guard here either.
 */
function lateNote(card: MatchCard, passUrl: string): string {
  if (!Number.isFinite(card.delayHours)) return "";
  const hours = String(Math.max(0, Math.round(card.delayHours)));
  const note = escapeHtml(renderDeliveryString("card-late-note", { hours }));
  const passes = sentenceWithLink("pass-link", passUrl, INK, SURFACE);
  return (
    `<tr><td style="padding:16px 0 0 0;background-color:${BAND};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `<tr><td bgcolor="${SURFACE}" style="background-color:${SURFACE};border-radius:20px;` +
    `padding:20px 24px;font-family:${GROTESK};font-size:15px;line-height:1.5;color:${INK};">` +
    `${note} ${passes}</td></tr></table></td></tr>`
  );
}

/**
 * The near-black band that closes every Pemby page, closing the email too.
 *
 * It is not a panel here: the band is already the page, so the footer is simply type set on it, the
 * way the product's footer is type set on the band under the sheet.
 */
function footer(ctx: EmailContext): string {
  const row = (content: string, topPad: number): string =>
    `<div style="padding-top:${topPad}px;color:${ON_BAND};background-color:${BAND};">${content}</div>`;

  const link = (url: string, key: DeliveryStringKey): string => {
    const safe = safeUrl(url);
    const label = escapeHtml(renderDeliveryString(key));
    return safe ? anchor(safe, label, ON_BAND, BAND) : label;
  };

  return (
    `<tr><td style="padding:32px 8px 0 8px;font-family:${GROTESK};font-size:15px;line-height:1.6;` +
    `color:${ON_BAND};background-color:${BAND};">` +
    row(link(pageUrl(ctx.appUrl, "/brief"), "email-cta-brief"), 0) +
    row(link(ctx.flagUrl, "email-cta-flag"), 12) +
    row(
      `${link(ctx.unsubscribeUrl, "email-unsubscribe")}` +
        `<span style="color:${ON_BAND_SOFT};background-color:${BAND};"> &middot; </span>` +
        `${link(pageUrl(ctx.appUrl, "/settings"), "email-manage")}`,
      20,
    ) +
    `<div style="padding-top:20px;font-size:13px;line-height:1.5;color:${ON_BAND_SOFT};` +
    `background-color:${BAND};">${escapeHtml(renderDeliveryString("email-footer"))}</div>` +
    `</td></tr>`
  );
}

/**
 * The card itself: the owner's approved ledger, in the approved order.
 *
 * Line for line the same information in the same sequence as `renderTelegramHtml`, because the
 * owner approved one layout and a reader on two channels must be told one story. What differs is
 * only what the medium forces — a tier tile where Telegram has an emoji, a table row where it has a
 * newline, and the apply link as a button rather than a keyboard.
 *
 * The three lines both surfaces share are built once, in `../card.ts`: `renderMetaLine`,
 * `renderTierVerdict` and `renderFreshnessLine`. Each returns plain text and each is escaped here,
 * which is the contract that lets one function serve a channel that escapes three characters and a
 * channel that escapes five. This module composed two of them privately for a while, and both the
 * freshness line and the gap label had already drifted by the time that was noticed — so the rule
 * is now the boring one: if a sentence appears on more than one channel, it is not written here.
 *
 * `renderTierVerdict` returns the words with no mark of any kind. Telegram puts its emoji in front
 * of them and this file puts them inside the tinted pill beside the tier's tile, and neither can
 * render the colour without the sentence, so the Never Colour Alone rule holds by construction.
 */
function cardBlock(card: MatchCard, ctx: EmailContext): string {
  const rows: string[] = [];

  rows.push(
    // `overflow-wrap` because a title is a stranger's string: a 140-character run with no space in
    // it is a real ATS title, and without this it pushes the 600px column wider than the window.
    `<tr><td style="font-family:${GROTESK};font-size:24px;font-weight:800;line-height:1.12;` +
      `letter-spacing:-0.67px;color:${INK};background-color:${CARD};` +
      `overflow-wrap:anywhere;word-break:break-word;">` +
      `${field(card.title, MAX_TITLE)}</td></tr>`,
  );
  rows.push(
    `<tr><td style="padding:10px 0 0 0;font-family:${GROTESK};font-size:15px;font-weight:500;` +
      `line-height:1.3;color:${INK_SOFT};background-color:${CARD};overflow-wrap:anywhere;` +
      `word-break:break-word;">` +
      `${escapeHtml(renderMetaLine(card))}</td></tr>`,
  );

  rows.push(rule(20, 20));

  // The verdict block, in the approved order: the tier's tile and the pill it labels, then the
  // reason behind the verdict, then how recently the post was confirmed live.
  rows.push(verdictBlock(card, ctx));

  const reasons = card.reasons.slice(0, MAX_REASONS);
  if (reasons.length > 0) {
    rows.push(rule(20, 14));
    rows.push(
      `<tr><td style="padding:0 0 10px 0;font-family:${GROTESK};font-size:13px;font-weight:500;` +
        `line-height:1.35;color:${INK_SOFT};background-color:${CARD};">` +
        `${escapeHtml(renderDeliveryString("reasons-label"))}</td></tr>`,
    );
    reasons.forEach((reason, index) => {
      rows.push(
        `<tr><td style="padding:${index === 0 ? 0 : 8}px 0 0 0;background-color:${CARD};">` +
          tagPill(field(reason, MAX_REASON)) +
          `</td></tr>`,
      );
    });
  }

  if (card.gap !== null) {
    rows.push(
      `<tr><td style="padding:16px 0 0 0;font-family:${GROTESK};font-size:15px;line-height:1.5;` +
        `color:${INK_SOFT};background-color:${CARD};overflow-wrap:anywhere;word-break:break-word;">` +
        `<b style="font-weight:700;color:${INK_SOFT};background-color:${CARD};">` +
        `${escapeHtml(renderDeliveryString("gap-label"))}</b> &mdash; ` +
        `${field(card.gap, MAX_REASON)}` +
        `</td></tr>`,
    );
  }

  const button = applyButton(card.url);
  if (button !== "") {
    rows.push(`<tr><td style="padding:26px 0 0 0;background-color:${CARD};">${button}</td></tr>`);
  }

  return (
    `<tr><td bgcolor="${CARD}" style="background-color:${CARD};border-radius:24px;` +
    `padding:32px;color:${INK};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    rows.join("") +
    `</table></td></tr>`
  );
}

/** The plain-text part: the same ledger, then the same four links. */
function textPart(card: MatchCard, ctx: EmailContext): string {
  const labelled = (key: DeliveryStringKey, url: string): string =>
    `${renderDeliveryString(key)}\n${url}`;

  return [
    renderPlainText(card, ctx.now, { passUrl: ctx.passUrl }),
    "",
    labelled("email-cta-brief", pageUrl(ctx.appUrl, "/brief")),
    "",
    labelled("email-cta-flag", ctx.flagUrl),
    "",
    labelled("email-unsubscribe", ctx.unsubscribeUrl),
    "",
    labelled("email-manage", pageUrl(ctx.appUrl, "/settings")),
    "",
    renderDeliveryString("email-footer"),
  ].join("\n");
}

/**
 * One match, as an email.
 *
 * Pure: no clock, no network, no environment. Every sentence comes from `../strings/en.ts` or
 * arrives on the card already rendered by its own reason table, and every interpolated value is
 * truncated as text and then escaped before it touches the markup.
 */
export function renderMatchEmail(card: MatchCard, ctx: EmailContext): RenderedEmail {
  const subject = subjectLine(
    renderDeliveryString("email-subject-match", {
      title: truncatePlain(card.title, MAX_TITLE),
      company: truncatePlain(card.company, MAX_COMPANY),
    }),
    MAX_SUBJECT,
  );

  const preheader = oneLine(
    renderDeliveryString("email-preheader-match", { tierReason: card.tierReason }),
    MAX_PREHEADER,
  );

  const html =
    `<!doctype html>` +
    `<html lang="en" style="color-scheme:light;supported-color-schemes:light;">` +
    `<head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light">` +
    `<meta name="supported-color-schemes" content="light">` +
    `<meta name="x-apple-disable-message-reformatting">` +
    `<title>${escapeHtml(subject)}</title>` +
    `</head>` +
    `<body style="margin:0;padding:0;width:100%;background-color:${BAND};color:${ON_BAND};">` +
    // Hidden, and padded with a zero-width space run so the client does not pull the first visible
    // line of the card into the inbox preview after it.
    `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;` +
    `font-size:1px;line-height:1px;color:${BAND};background-color:${BAND};">` +
    `${preheader}${"&#8203;&nbsp;".repeat(60)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `bgcolor="${BAND}" style="width:100%;background-color:${BAND};">` +
    `<tr><td align="center" style="padding:32px 12px 40px 12px;background-color:${BAND};">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;max-width:600px;text-align:left;">` +
    `<tr><td style="padding:0 8px 20px 8px;font-family:${GROTESK};font-size:26px;font-weight:800;` +
    `letter-spacing:-0.73px;line-height:1;color:${ON_BAND};background-color:${BAND};">Pemby</td></tr>` +
    cardBlock(card, ctx) +
    (card.late ? lateNote(card, ctx.passUrl) : "") +
    footer(ctx) +
    `</table></td></tr></table></body></html>`;

  return { subject, html, text: textPart(card, ctx) };
}
