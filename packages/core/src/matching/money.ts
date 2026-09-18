// Money used by the salary gate: pay periods, period conversion and currency conversion.
// Isomorphic and pure: no rate lookup, no network. The caller supplies rates or we say we did not
// convert. Nothing here ever guesses a rate.

/** `pay_period` pg enum values. Same spelling in core and the database. */
export const PAY_PERIODS = ["hour", "day", "month", "year"] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];

/**
 * How many of each period there are in a year, used to compare pay stated in different periods.
 * Stated here once, so no call site invents its own: 40h x 52 weeks = 2080 hours, 5 x 52 = 260
 * working days, 12 months. These are conventions, not facts about any one contract.
 */
export const PERIODS_PER_YEAR = {
  hour: 2080,
  day: 260,
  month: 12,
  year: 1,
} as const satisfies Record<PayPeriod, number>;

/**
 * Value of one unit of each currency in one shared base currency, keyed by ISO 4217 code
 * (upper case). The base is whatever the caller used consistently; only ratios are read.
 * An empty map is legal and means "we cannot convert anything".
 */
export type CurrencyRates = Readonly<Record<string, number>>;

export interface Money {
  amount: number;
  /** ISO 4217, upper case. */
  currency: string;
  period: PayPeriod;
}

export type ConversionResult =
  | { readonly ok: true; readonly amount: number }
  /** No usable rate for `currency`; the caller must not compare, and must say so. */
  | { readonly ok: false; readonly currency: string };

/** Restates `amount` from one pay period in another. Exact, no rounding. */
export function convertPeriod(amount: number, from: PayPeriod, to: PayPeriod): number {
  return (amount * PERIODS_PER_YEAR[from]) / PERIODS_PER_YEAR[to];
}

function rateFor(rates: CurrencyRates, currency: string): number | null {
  const rate = rates[currency.toUpperCase()];
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * Restates `money` in `target`'s currency and period. Same currency needs no rate. A missing or
 * unusable rate returns `{ ok: false }` rather than a guess.
 */
export function convertMoney(
  money: Money,
  target: { currency: string; period: PayPeriod },
  rates: CurrencyRates = {},
): ConversionResult {
  const from = money.currency.toUpperCase();
  const to = target.currency.toUpperCase();
  const inTargetPeriod = convertPeriod(money.amount, money.period, target.period);
  if (from === to) return { ok: true, amount: inTargetPeriod };

  const fromRate = rateFor(rates, from);
  const toRate = rateFor(rates, to);
  if (fromRate === null) return { ok: false, currency: from };
  if (toRate === null) return { ok: false, currency: to };
  return { ok: true, amount: (inTargetPeriod * fromRate) / toRate };
}

/** `1 234 USD/month`, for a reason param. No locale formatting: the UI localises from the parts. */
export function formatMoney(money: Money): string {
  return `${Math.round(money.amount)} ${money.currency.toUpperCase()}/${money.period}`;
}
