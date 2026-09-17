import { ENGINE_REASONS, type EngineReasonKey } from "@pemby/core";

// `job_eligibility.reason` stores only the English text `renderReason(key, params)` produced; the
// key and params are not stored. The teaser needs them for i18n, so they are recovered here by
// matching the text against the engine templates. Suggestion for phase 07: store `reason_key` and
// `reason_params` on `job_eligibility` and delete this file.

const TRUNCATION = "...";

interface Template {
  key: EngineReasonKey;
  full: RegExp;
  /** For text `renderReason` cut at 120 chars: everything from the last param on is captured. */
  truncated: RegExp | null;
  /** Literal characters before the last param; a cut text must match at least this much text. */
  truncatedLiteralChars: number;
  params: string[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile(key: EngineReasonKey, text: string): Template {
  const parts = text.split(/\{(\w+)\}/);
  const params: string[] = [];
  let full = "";
  let prefix = "";
  let literalChars = 0;
  let truncated: string | null = null;
  let truncatedLiteralChars = 0;
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      params.push(part);
      truncated = `${prefix}(.+)`;
      truncatedLiteralChars = literalChars;
      full += "(.+?)";
      prefix += "(.+?)";
    } else {
      full += escape(part);
      prefix += escape(part);
      literalChars += part.length;
    }
  });
  return {
    key,
    full: new RegExp(`^${full}$`),
    // A template whose last param has no literal text before it would match any cut text.
    truncated:
      truncated === null || truncatedLiteralChars === 0
        ? null
        : new RegExp(`^${truncated as string}$`),
    truncatedLiteralChars,
    params,
  };
}

// Longer templates first, so a short template's params cannot swallow a longer template's text.
const TEMPLATES: readonly Template[] = (
  Object.entries(ENGINE_REASONS) as [EngineReasonKey, string][]
)
  .sort((a, b) => b[1].length - a[1].length)
  .map(([key, text]) => compile(key, text));

export interface RecoveredReason {
  reasonKey: EngineReasonKey | null;
  reasonParams: Record<string, string>;
}

/** `renderReason` cuts at 120 chars to 117 plus "..."; `trimEnd` can make the result a little shorter. */
const TRUNCATED_MIN_LENGTH = 110;

function matchFull(text: string): RecoveredReason | null {
  for (const t of TEMPLATES) {
    const m = t.full.exec(text);
    if (m) {
      return {
        reasonKey: t.key,
        reasonParams: Object.fromEntries(t.params.map((p, i) => [p, m[i + 1] ?? ""])),
      };
    }
  }
  return null;
}

function matchTruncated(text: string): RecoveredReason | null {
  if (!text.endsWith(TRUNCATION)) return null;
  const cut = text.slice(0, -TRUNCATION.length);
  let best: { t: Template; m: RegExpExecArray } | null = null;
  for (const t of TEMPLATES) {
    const m = t.truncated?.exec(cut);
    if (m && (!best || t.truncatedLiteralChars > best.t.truncatedLiteralChars)) best = { t, m };
  }
  if (!best) return null;
  const { t, m } = best;
  const last = t.params.length - 1;
  return {
    reasonKey: t.key,
    reasonParams: Object.fromEntries(
      t.params.map((p, i) => [p, i === last ? `${m[i + 1] ?? ""}…` : (m[i + 1] ?? "")]),
    ),
  };
}

export function recoverReason(text: string): RecoveredReason {
  // A cut text ending "..." would otherwise match a template ending "." with ".." in its param.
  const cutFirst = text.length >= TRUNCATED_MIN_LENGTH && text.endsWith(TRUNCATION);
  const found = cutFirst
    ? (matchTruncated(text) ?? matchFull(text))
    : (matchFull(text) ?? matchTruncated(text));
  return found ?? { reasonKey: null, reasonParams: {} };
}
