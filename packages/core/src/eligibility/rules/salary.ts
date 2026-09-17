// Salary figures in post text: currency, range, period. A separate structured output, not an
// eligibility signal. Isomorphic.

export type SalaryPeriod = "hour" | "day" | "month" | "year";

export interface SalaryMention {
  min: number;
  max: number;
  /** ISO 4217 code. */
  currency: string;
  /** Null when the text gives no period and the amount does not settle it. */
  period: SalaryPeriod | null;
  /** Verbatim span. */
  text: string;
  start: number;
  end: number;
}

const SYMBOLS: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "₴": "UAH",
  "₹": "INR",
};
const CODES =
  "USD|EUR|GBP|CAD|AUD|NZD|CHF|PLN|RON|MDL|UAH|GEL|AMD|RSD|SEK|NOK|DKK|CZK|HUF|BGN|INR|BRL|MXN|SGD|JPY|ILS|AED|TRY|ZAR";
const PREFIX_CURRENCY = String.raw`(?:(?:US|CA|AU|NZ|C|A)?\$|€|£|₴|₹|(?:${CODES})\s?)`;
const NUMBER = String.raw`\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{1,2})?\s?[kK]?|\d+(?:[.,]\d+)?\s?[kK]?`;
const PERIOD = String.raw`(?:\s*(?:\/|per|an?|each)\s*(?:hour|hr|h|day|month|mo|year|yr|annum|annual)\b|\s*(?:hourly|daily|monthly|annually|yearly|p\.?a\.?|per annum)\b)`;

const RANGE_RE = new RegExp(
  String.raw`(?<![\w$€£])(${PREFIX_CURRENCY})?\s?(${NUMBER})\s?(${CODES})?(${PERIOD})?\s*(?:-|–|—|to)\s*(${PREFIX_CURRENCY})?\s?(${NUMBER})\s?(${CODES})?(${PERIOD})?`,
  "g",
);
const UP_TO_RE = new RegExp(
  String.raw`\b(?:up to|upto|max(?:imum)?(?: of)?)\s+(${PREFIX_CURRENCY})?\s?(${NUMBER})\s?(${CODES})?(${PERIOD})?`,
  "gi",
);

function currencyOf(prefix: string | undefined, code: string | undefined): string | null {
  const p = prefix?.trim();
  if (p) {
    if (/^(?:US)?\$$/.test(p)) return "USD";
    if (/^(?:CA|C)\$$/.test(p)) return "CAD";
    if (/^(?:AU|A)\$$/.test(p)) return "AUD";
    if (/^NZ\$$/.test(p)) return "NZD";
    if (SYMBOLS[p]) return SYMBOLS[p] ?? null;
    if (new RegExp(`^(?:${CODES})$`).test(p)) return p;
  }
  return code ?? null;
}

function amount(raw: string): number | null {
  let text = raw.replace(/\s/g, "");
  let multiplier = 1;
  if (/k$/i.test(text)) {
    multiplier = 1000;
    text = text.slice(0, -1);
  }
  // "150,000" / "150.000" thousands separators; "95.4" decimal before k.
  if (/^\d{1,3}(?:[,.]\d{3})+$/.test(text)) text = text.replace(/[,.]/g, "");
  else text = text.replace(",", ".");
  const value = Number(text) * multiplier;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function periodOf(raw: string | undefined, context: string, value: number): SalaryPeriod | null {
  // Only period words right after the figure count ("$95K–$190K annually", "30 EUR/h (net)").
  const lead =
    /^[\s(),]*(?:(?:USD|EUR|GBP|net|gross|base)[\s(),]*)*(?:\/\s?\w+|per \w+|an? \w+|\w+ly\b|p\.?a\.?)/i.exec(
      context,
    );
  const text = `${raw ?? ""} ${lead?.[0] ?? ""}`.toLowerCase();
  if (/\b(?:hour|hr|hourly)\b|\/\s?h\b/.test(text)) return "hour";
  if (/\b(?:day|daily)\b/.test(text)) return "day";
  if (/\b(?:month|mo|monthly)\b/.test(text)) return "month";
  if (/\b(?:year|yr|annum|annual|annually|yearly|p\.?a)\b/.test(text)) return "year";
  if (value >= 20000) return "year";
  return null;
}

/** Salary ranges and "up to" figures with a currency. Figures without a currency are ignored. */
export function extractSalaries(text: string): SalaryMention[] {
  const out: SalaryMention[] = [];
  const taken: Array<[number, number]> = [];
  for (const m of text.matchAll(RANGE_RE)) {
    const [whole, pre1, n1 = "", code1, per1, pre2, n2 = "", code2, per2] = m;
    const currency = currencyOf(pre1, code1) ?? currencyOf(pre2, code2);
    if (!currency) continue;
    const a = amount(n1);
    const b = amount(n2);
    if (a === null || b === null) continue;
    // "$177k - $240" never happens; "$150 - 200k" means both in thousands.
    if (/k\s*$/i.test(n2) && !/k\s*$/i.test(n1) && a < 1000) {
      out.push(make(text, m.index, whole, a * 1000, b, currency, per1 ?? per2));
    } else {
      if (b < a || b > a * 10) continue;
      out.push(make(text, m.index, whole, a, b, currency, per1 ?? per2));
    }
    taken.push([m.index, m.index + whole.length]);
  }
  for (const m of text.matchAll(UP_TO_RE)) {
    if (taken.some(([s, e]) => m.index < e && m.index + m[0].length > s)) continue;
    const [whole, pre, n = "", code, per] = m;
    const currency = currencyOf(pre, code);
    const value = amount(n);
    if (!currency || value === null) continue;
    out.push(make(text, m.index, whole, value, value, currency, per));
  }
  return out.sort((x, y) => x.start - y.start);
}

function make(
  text: string,
  start: number,
  whole: string,
  min: number,
  max: number,
  currency: string,
  period: string | undefined,
): SalaryMention {
  const trimmed = whole.trimEnd();
  const context = text.slice(start + trimmed.length, start + trimmed.length + 24);
  return {
    min,
    max,
    currency,
    period: periodOf(period, context, max),
    text: trimmed,
    start,
    end: start + trimmed.length,
  };
}
