// String primitives for an email body.
//
// Email HTML is not web HTML and this file is where that stops being a slogan. There is no CSS
// file to load, no custom property to resolve, no `<style>` block that survives every client, and
// no guarantee that the markup reaching the reader is the markup that left here — Gmail rewrites
// it, Outlook re-renders it through Word, and a dark-mode client may invert any colour it can see.
// So the template builds one long string, inline-styled, out of these helpers.
//
// The escaping rules are the ones `../card.ts` states, for the same reasons and with one addition:
//
//   - **`&` first, or the escaping eats itself.** Same as the Telegram card.
//   - **Quotes matter here.** A Telegram message has no attributes; an email has `href` and
//     `style`, so `"` and `'` are escaped too and every attribute is emitted through `attr`.
//   - **Truncate as plain text, then escape.** The other order can cut `&amp;` in half and leave
//     markup that a client either shows raw or silently drops.
//   - **A URL is not text.** `apply_url` arrives from a job post, which is to say from a stranger.
//     `href` takes a URL only after `safeUrl` has confirmed it parses and that its scheme is
//     `http` or `https`, so a `javascript:` or `data:` payload in an ATS feed cannot become a live
//     link in someone's inbox.
//
// Nothing here writes a sentence: copy comes from `../strings/en.ts`, as it does for every channel.

/** Every character that can change the meaning of markup, `&` first. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * One attribute, or nothing when the value is empty.
 *
 * Returns a leading space so `` `<td${attr("align", "center")}>` `` reads as the markup it emits,
 * and the caller can never forget the separator that keeps two attributes apart.
 */
export function attr(name: string, value: string | null): string {
  return value === null || value === "" ? "" : ` ${name}="${escapeHtml(value)}"`;
}

/**
 * Truncate by code point, not by UTF-16 unit, and cut at a space when there is one inside the
 * budget. Identical in behaviour to `../card.ts`'s `truncatePlain`, and deliberately a second copy:
 * that one is private to the Telegram card and the caps here are the email's own.
 */
export function truncatePlain(value: string, max: number): string {
  const chars = Array.from(value);
  if (chars.length <= max) return value;
  const head = chars.slice(0, Math.max(1, max - 1)).join("");
  const lastSpace = head.lastIndexOf(" ");
  const body = lastSpace > max / 2 ? head.slice(0, lastSpace) : head;
  return `${body.trimEnd()}…`;
}

/** Truncate, then escape. Never the other way round. */
export function field(value: string, max: number): string {
  return escapeHtml(truncatePlain(value, max));
}

/**
 * The URL, or null when it is not one we are willing to put behind a link.
 *
 * `http` and `https` only. A relative URL is refused rather than resolved: this package has no
 * base to resolve against, and a caller that passes one has made a mistake worth seeing.
 */
export function safeUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
}

/**
 * Control characters, including the CR and LF that would be header injection in a subject.
 *
 * Tested by code point rather than by a character class, because a regular expression holding a
 * literal control character is the thing `no-control-regex` exists to stop and the point here is
 * the opposite of the point there: these characters are the input, not the pattern.
 */
function isControl(code: number): boolean {
  return code < 0x20 || code === 0x7f;
}

/**
 * A subject line: one line, always.
 *
 * A CR or LF reaching an SMTP header is header injection, and the title in `email-subject-match`
 * comes from a job post. Every control character becomes a space, runs of whitespace collapse, and
 * the result is capped well short of the point where a client stops showing it.
 */
export function subjectLine(value: string, max: number): string {
  let flattened = "";
  for (const char of value) {
    flattened += isControl(char.codePointAt(0) ?? 0) ? " " : char;
  }
  return truncatePlain(flattened.replace(/\s+/g, " ").trim(), max);
}

/** The same flattening for the hidden preheader, which is markup rather than a header. */
export function oneLine(value: string, max: number): string {
  return field(subjectLine(value, max), max);
}
