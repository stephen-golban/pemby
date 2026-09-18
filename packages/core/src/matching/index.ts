// Shared input types and helpers for the matcher (PLAN section 4). The gates, the score and the
// feedback nudges all read the same `MatchUser` / `MatchJob` pair, so the caller builds it once.
export {
  PAY_PERIODS,
  PERIODS_PER_YEAR,
  convertMoney,
  convertPeriod,
  formatMoney,
  type ConversionResult,
  type CurrencyRates,
  type Money,
  type PayPeriod,
} from "./money";
export { differenceBySlug, intersectBySlug, slug, slugSet } from "./normalize";
export {
  DEFAULT_REQUIRED_OVERLAP_HOURS,
  WORKDAY_HOURS,
  timezoneOverlap,
  userUtcOffset,
  utcOffsetForCountry,
  type TimezoneOverlap,
} from "./timezone";
export {
  MATCH_PASS_REASONS,
  jobListsSalary,
  type MatchJob,
  type MatchPassReason,
  type MatchUser,
  type TimezoneWindow,
} from "./types";
