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
//   - **It has no web fonts.** `Rethink Sans` and `Source Code Pro` are named first so a client
//     that happens to have them honours the two voices, and each stack ends in a system family so
//     every other client still gets a grotesk for names and a monospace for prose.
//   - **It does not do flexbox or grid.** Layout is `<table role="presentation">` with `cellpadding`
//     and `cellspacing` zeroed, one 600px column, fluid below that.
//   - **It may invert the colours.** Dark mode in Apple Mail and Outlook re-colours anything it can
//     reason about, and it reasons badly about a background it cannot see. So `color-scheme` is
//     declared light in three places *and* every element that sets a colour also sets its own
//     background: an inverted background then still has legible text on it, which is the failure
//     mode worth designing for.
//   - **It rounds fractional pixels and ignores `border-radius`.** Outlook squares every corner.
//     The design survives that: the cards are still cards, just sharper.
//
// `DESIGN.md` is binding on the colour *choices*; an email cannot read `var(--color-ink)`, so each
// token below is resolved to the literal light-mode hex that file lists.

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
// `DESIGN.md` light values, flattened to opaque hex. `line` is the one token that cannot survive
// the trip literally: it is `rgb(20 17 13 / 0.28)`, and an alpha colour over an unknown background
// is exactly what a dark-mode client mis-reasons about, so it is composited over `ground` here.

const GROUND = "#faf6f0";
const SURFACE = "#f4eee4";
const PAPER = "#fbf8f2";
const INK = "#14110d";
const INK_SOFT = "#3b342b";
const LINE = "#bab6b0";
const LINE_STRONG = "#14110d";
const FIELD = "#2b3323";
const ON_FIELD = "#f7f1e6";
const ON_FIELD_SOFT = "#ddd4c6";

/** PLAN D2 as amended: only green and yellow are ever delivered. The other two are here so the
 *  swatch is total rather than defaulting a colour it was not given. */
const TIER_COLOR: Record<EligibilityTier, string> = {
  green: "#56733c",
  yellow: "#d1a432",
  white: "#fbf8f2",
  red: "#a54a3b",
};

/** The two voices of DESIGN.md, each ending in a family every client already has. */
const DISPLAY = "'Rethink Sans','Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'Source Code Pro',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

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

function anchor(url: string, label: string, color: string): string {
  return `<a${attr("href", url)} style="color:${color};text-decoration:underline;">${label}</a>`;
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
  params: Record<string, string> = {},
): string {
  const escaped = escapeHtml(renderDeliveryString(key, { ...params, url: URL_SLOT }));
  const safe = safeUrl(url);
  return escaped.replace(URL_SLOT, safe ? anchor(safe, escapeHtml(safe), color) : "");
}

/** `appUrl` plus a path, tolerant of the trailing slash `EmailContext` says will not be there. */
function pageUrl(appUrl: string, path: string): string {
  return `${appUrl.replace(/\/+$/, "")}${path}`;
}

/** A hairline, as a table row: `<hr>` is styled differently by every client. */
function rule(topPad: number, bottomPad: number): string {
  return (
    `<tr><td style="padding:${topPad}px 0 ${bottomPad}px 0;background-color:${PAPER};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `<tr><td style="height:1px;line-height:1px;font-size:1px;background-color:${LINE};">&nbsp;</td></tr>` +
    `</table></td></tr>`
  );
}

/**
 * A line hanging under the swatch, aligned with the text beside it rather than with the disc.
 *
 * `padding-left` and not a nested table: three lines of a verdict block that a client renders as
 * three tables is three chances for Outlook to space them differently.
 */
function indented(style: string, content: string, topPad: number): string {
  return (
    `<tr><td style="padding:${topPad}px 0 0 32px;font-family:${MONO};line-height:1.6;` +
    `background-color:${PAPER};${style}">${content}</td></tr>`
  );
}

/** Two cells: a fixed-size mark, and the text beside it. The ledger row of DESIGN.md. */
function markedRow(mark: string, text: string, color: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `<tr>` +
    `<td width="22" valign="top" style="width:22px;padding:6px 10px 0 0;background-color:${PAPER};">${mark}</td>` +
    `<td valign="top" style="font-family:${MONO};font-size:15px;line-height:1.6;color:${color};background-color:${PAPER};">${text}</td>` +
    `</tr></table>`
  );
}

/** The tier swatch: a coloured disc that always sits beside its own words (DESIGN.md). */
function tierSwatch(tier: EligibilityTier): string {
  const color = TIER_COLOR[tier];
  const border = tier === "white" ? `border:1px solid ${LINE_STRONG};` : "";
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td width="13" height="13" style="width:13px;height:13px;line-height:13px;font-size:1px;` +
    `background-color:${color};border-radius:13px;${border}">&nbsp;</td>` +
    `</tr></table>`
  );
}

/** The filled tick of the match-card anatomy: a criterion that is met is never an empty box. */
const TICK =
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
  `<td width="10" height="10" style="width:10px;height:10px;line-height:10px;font-size:1px;` +
  `background-color:${INK};border-radius:3px;">&nbsp;</td>` +
  `</tr></table>`;

/** The one primary action, built the way an email button has to be built to survive Outlook. */
function applyButton(url: string): string {
  const safe = safeUrl(url);
  if (!safe) return "";
  const label = escapeHtml(renderDeliveryString("email-cta-apply"));
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td align="center" bgcolor="${INK}" style="background-color:${INK};border-radius:999px;">` +
    `<a${attr("href", safe)} style="display:inline-block;padding:16px 30px;font-family:${DISPLAY};` +
    `font-size:17px;font-weight:700;line-height:1;color:${GROUND};background-color:${INK};` +
    `text-decoration:none;border-radius:999px;">${label}</a>` +
    `</td></tr></table>`
  );
}

/**
 * The PLAN D13 note. Dashed, because in this design a dashed stroke means "not yet".
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
  const passes = sentenceWithLink("pass-link", passUrl, INK_SOFT);
  return (
    `<tr><td style="padding:18px 0 0 0;background-color:${GROUND};">` +
    `<div style="border:1px dashed ${LINE};border-radius:20px;padding:18px 22px;` +
    `background-color:${SURFACE};font-family:${MONO};font-size:13px;line-height:1.7;color:${INK_SOFT};">` +
    `${note} ${passes}</div></td></tr>`
  );
}

/** The deep olive field that closes every Pemby page, closing the email too. */
function footer(ctx: EmailContext): string {
  const row = (content: string, topPad: number): string =>
    `<div style="padding-top:${topPad}px;color:${ON_FIELD};background-color:${FIELD};">${content}</div>`;

  const link = (url: string, key: DeliveryStringKey): string => {
    const safe = safeUrl(url);
    const label = escapeHtml(renderDeliveryString(key));
    return safe ? anchor(safe, label, ON_FIELD) : label;
  };

  return (
    `<tr><td style="padding:22px 0 0 0;background-color:${GROUND};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `<tr><td style="background-color:${FIELD};border-radius:28px;padding:28px 26px;` +
    `font-family:${MONO};font-size:13px;line-height:1.7;color:${ON_FIELD};">` +
    row(link(pageUrl(ctx.appUrl, "/brief"), "email-cta-brief"), 0) +
    row(link(ctx.flagUrl, "email-cta-flag"), 10) +
    row(
      `${link(ctx.unsubscribeUrl, "email-unsubscribe")}` +
        `<span style="color:${ON_FIELD_SOFT};background-color:${FIELD};"> &middot; </span>` +
        `${link(pageUrl(ctx.appUrl, "/settings"), "email-manage")}`,
      18,
    ) +
    `<div style="padding-top:18px;color:${ON_FIELD_SOFT};background-color:${FIELD};">` +
    `${escapeHtml(renderDeliveryString("email-footer"))}</div>` +
    `</td></tr></table></td></tr>`
  );
}

/**
 * The card itself: the owner's approved ledger, in the approved order.
 *
 * Line for line the same information in the same sequence as `renderTelegramHtml`, because the
 * owner approved one layout and a reader on two channels must be told one story. What differs is
 * only what the medium forces — a coloured disc where Telegram has an emoji, a table row where it
 * has a newline, and the apply link as a button rather than a keyboard.
 *
 * The three lines both surfaces share are built once, in `../card.ts`: `renderMetaLine`,
 * `renderTierVerdict` and `renderFreshnessLine`. Each returns plain text and each is escaped here,
 * which is the contract that lets one function serve a channel that escapes three characters and a
 * channel that escapes five. This module composed two of them privately for a while, and both the
 * freshness line and the gap label had already drifted by the time that was noticed — so the rule
 * is now the boring one: if a sentence appears on more than one channel, it is not written here.
 *
 * `renderTierVerdict` returns the words with no mark of any kind. Telegram puts its emoji in front
 * of them and this file puts its disc beside them, and neither can render the colour without the
 * sentence, so "a tier colour always sits beside its words" (DESIGN.md) holds by construction.
 */
function cardBlock(card: MatchCard, ctx: EmailContext): string {
  const rows: string[] = [];

  rows.push(
    `<tr><td style="font-family:${DISPLAY};font-size:27px;font-weight:700;line-height:1.1;` +
      `letter-spacing:-0.9px;color:${INK};background-color:${PAPER};">` +
      `${field(card.title, MAX_TITLE)}</td></tr>`,
  );
  rows.push(
    `<tr><td style="padding:12px 0 0 0;font-family:${MONO};font-size:15px;line-height:1.5;` +
      `color:${INK_SOFT};background-color:${PAPER};">${escapeHtml(renderMetaLine(card))}</td></tr>`,
  );

  rows.push(rule(20, 20));

  // The verdict block, in the approved order: the coloured swatch and the verdict it labels, then
  // the reason behind the verdict, then how recently the post was confirmed live. The swatch never
  // stands alone — the words beside it are what carry the eligibility (DESIGN.md).
  rows.push(
    `<tr><td style="background-color:${PAPER};">` +
      markedRow(
        tierSwatch(card.tier),
        `<b style="font-weight:600;">${escapeHtml(renderTierVerdict(card))}</b>`,
        INK,
      ) +
      `</td></tr>`,
  );
  rows.push(indented(`font-size:15px;color:${INK_SOFT};`, field(card.tierReason, MAX_REASON), 8));
  rows.push(
    indented(
      `font-size:13px;color:${INK_SOFT};`,
      escapeHtml(renderFreshnessLine(card.verifiedLiveAt, ctx.now)),
      6,
    ),
  );

  const reasons = card.reasons.slice(0, MAX_REASONS);
  if (reasons.length > 0) {
    rows.push(rule(20, 14));
    rows.push(
      `<tr><td style="padding:0 0 10px 0;font-family:${MONO};font-size:13px;line-height:1.6;` +
        `color:${INK_SOFT};background-color:${PAPER};">` +
        `<i>${escapeHtml(renderDeliveryString("reasons-label"))}</i></td></tr>`,
    );
    reasons.forEach((reason, index) => {
      rows.push(
        `<tr><td style="padding:${index === 0 ? 0 : 10}px 0 0 0;background-color:${PAPER};">` +
          markedRow(TICK, field(reason, MAX_REASON), INK) +
          `</td></tr>`,
      );
    });
  }

  if (card.gap !== null) {
    rows.push(
      `<tr><td style="padding:16px 0 0 0;font-family:${MONO};font-size:15px;line-height:1.6;` +
        `color:${INK_SOFT};background-color:${PAPER};">` +
        `<i>${escapeHtml(renderDeliveryString("gap-label"))}</i>&nbsp;&nbsp;` +
        `${field(card.gap, MAX_REASON)}` +
        `</td></tr>`,
    );
  }

  const button = applyButton(card.url);
  if (button !== "") {
    rows.push(`<tr><td style="padding:26px 0 0 0;background-color:${PAPER};">${button}</td></tr>`);
  }

  return (
    `<tr><td style="background-color:${PAPER};border:1px solid ${LINE_STRONG};border-radius:30px;` +
    `padding:32px 28px 30px 28px;color:${INK};">` +
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
    `<body style="margin:0;padding:0;width:100%;background-color:${GROUND};color:${INK};">` +
    // Hidden, and padded with a zero-width space run so the client does not pull the first visible
    // line of the card into the inbox preview after it.
    `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;` +
    `font-size:1px;line-height:1px;color:${GROUND};background-color:${GROUND};">` +
    `${preheader}${"&#8203;&nbsp;".repeat(60)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;background-color:${GROUND};">` +
    `<tr><td align="center" style="padding:24px 12px 40px 12px;background-color:${GROUND};">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;max-width:600px;text-align:left;">` +
    `<tr><td style="padding:0 6px 18px 6px;font-family:${DISPLAY};font-size:24px;font-weight:800;` +
    `letter-spacing:-0.8px;line-height:1;color:${INK};background-color:${GROUND};">Pemby</td></tr>` +
    cardBlock(card, ctx) +
    (card.late ? lateNote(card, ctx.passUrl) : "") +
    footer(ctx) +
    `</table></td></tr></table></body></html>`;

  return { subject, html, text: textPart(card, ctx) };
}
